"""Repositórios de código, sincronização de commits e métricas de entrega dos devs.

Vive fora de `service.py` (2900 linhas) por ser um assunto fechado: inventário de repos,
importação a partir de `products.link_repositorio`, ingestão de commits do Azure DevOps,
resolução de autoria e agregação do painel.

Agregação é feita em SQL, não em memória: ao contrário do painel de Desempenho do Time
(que trabalha com centenas de tarefas), aqui a ordem de grandeza é de dezenas de milhares
de commits.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import String, cast, delete, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.produtos import azure_devops_client as azure, schemas
from app.modules.produtos.azure_repo_link import parse_field
from app.modules.produtos.models import (
    CodeRepository,
    Product,
    ProductRepository,
    RepoCommit,
    RepoCommitAuthor,
    RepoProvider,
    RepoSyncStatus,
)
from app.modules.teamops.models import Person, Position

logger = logging.getLogger(__name__)

# Sobreposição do sync incremental: a chave temporal é a data do AUTOR, que pode ser bem
# anterior ao push (rebase, cherry-pick, PR aberto há dias).
_OVERLAP = timedelta(hours=12)
# Teto de repositórios processados por execução do job, para o tick não virar maratona.
_REPOS_POR_TICK = 40


def _norm_email(value: Optional[str]) -> Optional[str]:
    v = (value or "").strip().lower()
    return v[:255] or None


class RepositoryService:
    """Inventário de repositórios e vínculo com produtos."""

    # ── consultas ──
    @staticmethod
    async def list_repositories(db: AsyncSession) -> list[schemas.RepositoryResponse]:
        repos = list((await db.execute(
            select(CodeRepository).order_by(CodeRepository.project, CodeRepository.repository)
        )).scalars())

        links = list((await db.execute(
            select(ProductRepository.repository_id, Product.id, Product.name, Product.sigla)
            .join(Product, Product.id == ProductRepository.product_id)
        )).all())
        by_repo: dict[uuid.UUID, list[schemas.ProductMini]] = {}
        for repo_id, pid, pname, sigla in links:
            by_repo.setdefault(repo_id, []).append(
                schemas.ProductMini(id=pid, name=pname, sigla=sigla)
            )

        return [
            schemas.RepositoryResponse(
                id=r.id,
                provider=r.provider.value if hasattr(r.provider, "value") else str(r.provider),
                organization=r.organization, project=r.project, repository=r.repository,
                remote_repo_id=r.remote_repo_id, web_url=r.web_url, default_branch=r.default_branch,
                is_active=r.is_active, sync_enabled=r.sync_enabled,
                first_synced_at=r.first_synced_at, last_sync_at=r.last_sync_at,
                last_sync_status=(
                    r.last_sync_status.value if hasattr(r.last_sync_status, "value") else str(r.last_sync_status)
                ),
                last_sync_error=r.last_sync_error, last_commit_at=r.last_commit_at,
                commits_count=r.commits_count,
                produtos=sorted(by_repo.get(r.id, []), key=lambda p: p.name.lower()),
            )
            for r in repos
        ]

    # ── criação / vínculo ──
    @staticmethod
    def _guard_org(organization: str) -> str:
        """O PAT é global da instância; permitir outra organização deixaria um tenant ler
        commits de outra empresa com a credencial da casa."""
        org = (organization or "").strip() or azure.default_organization()
        permitida = azure.default_organization()
        if permitida and org.lower() != permitida.lower():
            raise HTTPException(
                400,
                f"Só é possível cadastrar repositórios da organização '{permitida}' "
                "(o token de acesso é único da instituição).",
            )
        return org

    @classmethod
    async def get_or_create(
        cls, db: AsyncSession, *, organization: str, project: str, repository: str,
        provider: str = "azure_devops", web_url: Optional[str] = None,
        user_id: Optional[uuid.UUID] = None,
    ) -> tuple[CodeRepository, bool]:
        """Devolve (repo, criado). Busca case-insensitive — o Azure não diferencia caixa."""
        if provider == "azure_devops":
            organization = cls._guard_org(organization)
        found = (await db.execute(
            select(CodeRepository).where(
                cast(CodeRepository.provider, String) == provider,
                func.lower(CodeRepository.organization) == organization.lower(),
                func.lower(CodeRepository.project) == project.lower(),
                func.lower(CodeRepository.repository) == repository.lower(),
            )
        )).scalar_one_or_none()
        if found:
            return found, False

        repo = CodeRepository(
            provider=RepoProvider(provider), organization=organization,
            project=project, repository=repository, web_url=web_url,
            # GitHub entra no inventário para não sumir do mapa, mas não é sincronizado agora.
            sync_enabled=(provider == "azure_devops"),
            created_by=user_id, updated_by=user_id,
        )
        db.add(repo)
        await db.flush()
        return repo, True

    @staticmethod
    async def link(
        db: AsyncSession, product_id: uuid.UUID, repository_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
    ) -> bool:
        """Cria o vínculo produto↔repo. Devolve False se já existia."""
        exists_ = (await db.execute(
            select(ProductRepository.id).where(
                ProductRepository.product_id == product_id,
                ProductRepository.repository_id == repository_id,
            )
        )).scalar_one_or_none()
        if exists_:
            return False
        db.add(ProductRepository(product_id=product_id, repository_id=repository_id, created_by=user_id))
        return True

    @classmethod
    async def create(
        cls, db: AsyncSession, data: schemas.RepositoryCreate, user_id: Optional[uuid.UUID],
    ) -> schemas.RepositoryResponse:
        repo, _ = await cls.get_or_create(
            db, organization=data.organization or "", project=data.project,
            repository=data.repository, provider=data.provider, web_url=data.web_url,
            user_id=user_id,
        )
        for pid in data.product_ids:
            await cls.link(db, pid, repo.id, user_id)
        await db.commit()
        return await cls.get_one(db, repo.id)

    @classmethod
    async def get_one(cls, db: AsyncSession, repository_id: uuid.UUID) -> schemas.RepositoryResponse:
        for item in await cls.list_repositories(db):
            if item.id == repository_id:
                return item
        raise HTTPException(404, "Repositório não encontrado.")

    @classmethod
    async def update(
        cls, db: AsyncSession, repository_id: uuid.UUID, data: schemas.RepositoryUpdate,
        user_id: Optional[uuid.UUID],
    ) -> schemas.RepositoryResponse:
        repo = (await db.execute(
            select(CodeRepository).where(CodeRepository.id == repository_id)
        )).scalar_one_or_none()
        if not repo:
            raise HTTPException(404, "Repositório não encontrado.")

        if data.sync_enabled is not None:
            repo.sync_enabled = data.sync_enabled
        if data.is_active is not None:
            repo.is_active = data.is_active
        if data.product_ids is not None:
            await db.execute(
                delete(ProductRepository).where(
                    ProductRepository.repository_id == repository_id,
                    ProductRepository.product_id.notin_(data.product_ids or [uuid.uuid4()]),
                )
            )
            for pid in data.product_ids:
                await cls.link(db, pid, repository_id, user_id)
        repo.updated_by = user_id
        repo.updated_at = datetime.utcnow()
        await db.commit()
        return await cls.get_one(db, repository_id)

    @staticmethod
    async def delete(db: AsyncSession, repository_id: uuid.UUID, purgar: bool = False) -> None:
        repo = (await db.execute(
            select(CodeRepository).where(CodeRepository.id == repository_id)
        )).scalar_one_or_none()
        if not repo:
            raise HTTPException(404, "Repositório não encontrado.")
        if purgar:
            await db.delete(repo)  # CASCADE leva vínculos e commits
        else:
            repo.is_active = False
            repo.sync_enabled = False
        await db.commit()


class RepositoryImportService:
    """Importa o inventário a partir do campo livre `products.link_repositorio`.

    Sempre em duas etapas (preview → apply): o campo é texto digitado à mão e nem tudo que
    está lá é repositório.
    """

    @staticmethod
    async def _existing_keys(db: AsyncSession) -> tuple[dict[tuple, uuid.UUID], set[tuple]]:
        repos = list((await db.execute(select(CodeRepository))).scalars())
        by_key = {
            (str(r.provider.value if hasattr(r.provider, "value") else r.provider),
             r.organization.lower(), r.project.lower(), r.repository.lower()): r.id
            for r in repos
        }
        links = set((await db.execute(
            select(ProductRepository.product_id, ProductRepository.repository_id)
        )).all())
        return by_key, links

    @classmethod
    async def preview(cls, db: AsyncSession) -> schemas.RepoImportPreview:
        by_key, links = await cls._existing_keys(db)
        produtos = list((await db.execute(
            select(Product.id, Product.name, Product.link_repositorio).where(
                Product.is_active.is_(True), func.btrim(func.coalesce(Product.link_repositorio, "")) != "",
            ).order_by(func.lower(Product.name))
        )).all())

        itens: list[schemas.RepoLinkPreviewItem] = []
        resumo: dict[str, int] = {}
        repos_novos: set[tuple] = set()

        for pid, pname, raw in produtos:
            for link in parse_field(raw):
                resumo[link.kind] = resumo.get(link.kind, 0) + 1
                key = None
                ja = False
                if link.kind == "azure_repo":
                    key = ("azure_devops", link.organization.lower(), link.project.lower(), link.repository.lower())
                    repo_id = by_key.get(key)
                    ja = bool(repo_id and (pid, repo_id) in links)
                    if not repo_id:
                        repos_novos.add(key)
                itens.append(schemas.RepoLinkPreviewItem(
                    product_id=pid, product_name=pname, url=link.url, kind=link.kind,
                    organization=link.organization, project=link.project,
                    repository=link.repository, provider=link.provider, ja_vinculado=ja,
                ))

        return schemas.RepoImportPreview(
            itens=itens,
            total_produtos_com_link=len(produtos),
            total_importaveis=sum(1 for i in itens if i.kind == "azure_repo" and not i.ja_vinculado),
            total_repos_novos=len(repos_novos),
            resumo_por_tipo=resumo,
        )

    @classmethod
    async def apply(
        cls, db: AsyncSession, data: schemas.RepoImportApply, user_id: Optional[uuid.UUID],
    ) -> schemas.RepoImportResult:
        criados = vinculos = ignorados = 0
        for item in data.itens:
            if item.kind != "azure_repo" or not (item.project and item.repository):
                ignorados += 1
                continue
            repo, novo = await RepositoryService.get_or_create(
                db, organization=item.organization or "", project=item.project,
                repository=item.repository, provider=item.provider or "azure_devops",
                web_url=item.url, user_id=user_id,
            )
            criados += 1 if novo else 0
            vinculos += 1 if await RepositoryService.link(db, item.product_id, repo.id, user_id) else 0
        await db.commit()
        return schemas.RepoImportResult(
            repos_criados=criados, vinculos_criados=vinculos, ignorados=ignorados
        )

    @staticmethod
    async def descobrir(db: AsyncSession, project: str) -> list[schemas.AzureRepoMini]:
        """Repositórios de um projeto Azure — resolve os links que apontam só para o projeto."""
        cadastrados = {
            (p.lower(), r.lower()) for p, r in (await db.execute(
                select(CodeRepository.project, CodeRepository.repository)
            )).all()
        }
        return [
            schemas.AzureRepoMini(
                id=r["id"], name=r["name"], project=r["project"],
                web_url=r["web_url"], default_branch=r["default_branch"],
                ja_cadastrado=(r["project"].lower(), r["name"].lower()) in cadastrados,
            )
            for r in await azure.list_repositories(project)
        ]


class CommitAuthorService:
    """Casa o e-mail do commit com a pessoa do TeamOps."""

    @staticmethod
    async def refresh_authors(db: AsyncSession) -> None:
        """Recalcula a fila de autores a partir dos commits e faz o match automático.

        Nunca sobrescreve `resolution='manual'` nem `'ignorado'` — vínculo do gestor e bots
        marcados à mão permanecem.
        """
        # 1. upsert dos e-mails vistos, com contagem e última atividade
        await db.execute(text("""
            INSERT INTO repo_commit_authors (id, provider, email, display_name, commits_count, last_commit_at)
            SELECT gen_random_uuid(), 'azure_devops', c.author_email,
                   (array_agg(c.author_name ORDER BY c.author_date DESC))[1],
                   count(*), max(c.author_date)
              FROM repo_commits c
             WHERE c.author_email IS NOT NULL
             GROUP BY c.author_email
            ON CONFLICT (provider, email) DO UPDATE
               SET commits_count  = EXCLUDED.commits_count,
                   last_commit_at = EXCLUDED.last_commit_at,
                   display_name   = COALESCE(repo_commit_authors.display_name, EXCLUDED.display_name),
                   updated_at     = now()
        """))

        # 2. match automático por e-mail (team_persons.email é UNIQUE NOT NULL)
        await db.execute(text("""
            UPDATE repo_commit_authors a
               SET person_id = p.id, resolution = 'auto', updated_at = now()
              FROM team_persons p
             WHERE lower(p.email) = a.email
               AND a.resolution = 'pendente'
        """))

        # 3. bots conhecidos saem da fila de pendências
        patterns = [p.strip().lower() for p in (settings.AZURE_DEVOPS_BOT_EMAIL_PATTERNS or "").split(",")]
        for pat in [p for p in patterns if p]:
            await db.execute(
                update(RepoCommitAuthor)
                .where(RepoCommitAuthor.resolution == "pendente", RepoCommitAuthor.email.contains(pat))
                .values(ignored=True, resolution="ignorado", updated_at=datetime.utcnow())
            )

        await CommitAuthorService.reaplicar(db)

    @staticmethod
    async def reaplicar(db: AsyncSession) -> None:
        """Propaga o mapa de autores para os commits — inclusive os já importados, que é o
        que faz um vínculo manual valer para trás."""
        await db.execute(text("""
            UPDATE repo_commits c
               SET person_id = a.person_id, is_bot = a.ignored
              FROM repo_commit_authors a
             WHERE a.email = c.author_email
               AND (c.person_id IS DISTINCT FROM a.person_id OR c.is_bot <> a.ignored)
        """))

    @staticmethod
    async def list_authors(db: AsyncSession, apenas_pendentes: bool = False) -> list[schemas.CommitAuthorResponse]:
        stmt = (
            select(RepoCommitAuthor, Person.full_name)
            .outerjoin(Person, Person.id == RepoCommitAuthor.person_id)
            .order_by(RepoCommitAuthor.commits_count.desc())
        )
        if apenas_pendentes:
            stmt = stmt.where(RepoCommitAuthor.resolution == "pendente")
        return [
            schemas.CommitAuthorResponse(
                id=a.id, email=a.email, display_name=a.display_name, person_id=a.person_id,
                person_name=nome, ignored=a.ignored, commits_count=a.commits_count,
                last_commit_at=a.last_commit_at,
            )
            for a, nome in (await db.execute(stmt)).all()
        ]

    @staticmethod
    async def update_author(
        db: AsyncSession, author_id: uuid.UUID, data: schemas.CommitAuthorUpdate,
        user_id: Optional[uuid.UUID],
    ) -> schemas.CommitAuthorResponse:
        author = (await db.execute(
            select(RepoCommitAuthor).where(RepoCommitAuthor.id == author_id)
        )).scalar_one_or_none()
        if not author:
            raise HTTPException(404, "Autor não encontrado.")

        if data.ignored is not None:
            author.ignored = data.ignored
            author.resolution = "ignorado" if data.ignored else "manual"
            if data.ignored:
                author.person_id = None
        if data.person_id is not None or (data.ignored is False and data.person_id is None):
            author.person_id = data.person_id
            author.resolution = "manual" if data.person_id else "pendente"
            if data.person_id:
                author.ignored = False
        author.updated_by = user_id
        author.updated_at = datetime.utcnow()
        await db.flush()
        await CommitAuthorService.reaplicar(db)
        await db.commit()

        nome = None
        if author.person_id:
            nome = (await db.execute(
                select(Person.full_name).where(Person.id == author.person_id)
            )).scalar_one_or_none()
        return schemas.CommitAuthorResponse(
            id=author.id, email=author.email, display_name=author.display_name,
            person_id=author.person_id, person_name=nome, ignored=author.ignored,
            commits_count=author.commits_count, last_commit_at=author.last_commit_at,
        )


class RepoSyncService:
    """Ingestão dos commits. Fonte de verdade da integração — o webhook só antecipa."""

    @staticmethod
    def _env_of_branch(branch: Optional[str]) -> str:
        """main → prod · preview → hml · qualquer outra → dev.

        `master` conta como produção: 1 dos 25 repositórios ainda usa esse nome.
        """
        b = (branch or "").strip().lower()
        if b in ("main", "master"):
            return "prod"
        if b == "preview":
            return "hml"
        return "dev"

    # Precedência ao classificar um commit que existe em mais de uma branch:
    # chegou em produção vale mais que estar em homologação, que vale mais que dev.
    _ENV_RANK = {"prod": 3, "hml": 2, "dev": 1}

    @staticmethod
    async def _upsert_commits(db: AsyncSession, repo: CodeRepository, commits: list[dict]) -> int:
        """Grava uma leva de commits. `DO UPDATE ... WHERE` corrige o que o webhook gravou
        pela metade (o payload do push não traz changeCounts)."""
        if not commits:
            return 0
        rows = [{
            "id": uuid.uuid4(),
            "repository_id": repo.id,
            "commit_id": c["commit_id"],
            "author_name": c.get("author_name"),
            "author_email": _norm_email(c.get("author_email")),
            "author_date": c["author_date"],
            "committer_date": c.get("committer_date"),
            "comment": c.get("comment"),
            "comment_truncated": bool(c.get("comment_truncated")),
            "add_count": c.get("add_count") or 0,
            "edit_count": c.get("edit_count") or 0,
            "delete_count": c.get("delete_count") or 0,
            "is_merge": bool(c.get("is_merge")),
            "is_bot": bool(c.get("is_bot")),
            "remote_url": c.get("remote_url"),
            "branch": c.get("branch"),
            "environment": RepoSyncService._env_of_branch(c.get("branch")),
            "synced_at": datetime.utcnow(),
        } for c in commits if c.get("commit_id")]
        if not rows:
            return 0

        stmt = pg_insert(RepoCommit).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["repository_id", "commit_id"],
            set_={
                "add_count": stmt.excluded.add_count,
                "edit_count": stmt.excluded.edit_count,
                "delete_count": stmt.excluded.delete_count,
                "comment": stmt.excluded.comment,
            },
            where=(RepoCommit.add_count == 0) & (RepoCommit.edit_count == 0),
        )
        result = await db.execute(stmt)
        gravados = result.rowcount or 0

        # Promoção de ambiente: um commit que já estava em dev/hml e agora apareceu em
        # main passa a valer como prod. Só sobe de nível, nunca desce — senão o sync de
        # uma branch de feature rebaixaria o que já foi para produção.
        by_env: dict[str, list[str]] = {}
        for r in rows:
            by_env.setdefault(r["environment"], []).append(r["commit_id"])
        for env, ids in by_env.items():
            rank = RepoSyncService._ENV_RANK[env]
            piores = [e for e, v in RepoSyncService._ENV_RANK.items() if v < rank]
            await db.execute(
                update(RepoCommit)
                .where(
                    RepoCommit.repository_id == repo.id,
                    RepoCommit.commit_id.in_(ids),
                    or_(
                        RepoCommit.environment.is_(None),
                        RepoCommit.environment.in_(piores),
                    ),
                )
                .values(environment=env, branch=next(
                    r["branch"] for r in rows if r["environment"] == env
                ))
            )
        return gravados

    @classmethod
    async def sync_repository(cls, db: AsyncSession, repo: CodeRepository, full: bool = False) -> int:
        """Sincroniza um repositório. Devolve quantas linhas foram gravadas/corrigidas."""
        if not azure.azure_devops_configured():
            return 0

        try:
            if not repo.remote_repo_id:
                found = await azure.find_repository(repo.project, repo.repository)
                if not found:
                    repo.last_sync_status = RepoSyncStatus.NOT_FOUND
                    repo.last_sync_error = (
                        f"Repositório '{repo.repository}' não encontrado no projeto '{repo.project}'."
                    )
                    repo.sync_enabled = False  # não insistir a cada 30 min para sempre
                    repo.last_sync_at = datetime.utcnow()
                    return 0
                repo.remote_repo_id = found["id"]
                repo.default_branch = found.get("default_branch")
                repo.web_url = repo.web_url or found.get("web_url")

            if full or not repo.first_synced_at:
                from_date = datetime.utcnow() - timedelta(days=settings.AZURE_DEVOPS_BACKFILL_DAYS)
            else:
                base = repo.last_commit_at or repo.last_sync_at or datetime.utcnow()
                from_date = base - _OVERLAP

            # Percorre as branches em ordem de precedência (prod → hml → dev) e para
            # cada commit vale a PRIMEIRA em que ele aparece. Sem isso, um commit
            # mergeado em main continuaria contando como dev.
            try:
                branches = await azure.list_branches(repo.project, repo.remote_repo_id)
            except azure.AzureDevOpsError:
                branches = [repo.default_branch] if repo.default_branch else []

            ordenadas = sorted(
                [b for b in branches if b],
                key=lambda b: (-cls._ENV_RANK[cls._env_of_branch(b)], b.lower()),
            )
            limite = settings.AZURE_DEVOPS_MAX_BRANCHES
            if limite and len(ordenadas) > limite:
                logger.warning(
                    "[repo_sync] %s/%s tem %d branches; sincronizando as %d de maior "
                    "precedência (AZURE_DEVOPS_MAX_BRANCHES)",
                    repo.project, repo.repository, len(ordenadas), limite,
                )
                ordenadas = ordenadas[:limite]
            if not ordenadas:
                ordenadas = [None]  # cai na branch padrão do Azure

            commits: list[dict] = []
            vistos: set[str] = set()
            padrao = (repo.default_branch or "").strip().lower()
            for br in ordenadas:
                # Pegadinha do Azure: filtrar por `itemVersion` aplica histórico
                # simplificado e OMITE os merge commits (em athena-api eram 271 sem
                # filtro contra 214 com filtro). Para a branch padrão dá para consultar
                # sem filtro e obter o histórico completo — inclusive os merges.
                usar_filtro = (br or "").strip().lower() != padrao
                lote = await azure.fetch_commits(
                    repo.project, repo.remote_repo_id, from_date=from_date,
                    branch=br if usar_filtro else None,
                )
                if not usar_filtro:
                    for c in lote:
                        c["branch"] = br
                for c in lote:
                    cid = c.get("commit_id")
                    if not cid or cid in vistos:
                        continue
                    vistos.add(cid)
                    commits.append(c)

            gravados = await cls._upsert_commits(db, repo, commits)

            # Sobra do filtro acima: merge commits de branches não-padrão que a API não
            # devolve. Vieram da varredura sem filtro, então pertencem à branch padrão.
            if repo.default_branch:
                await db.execute(
                    update(RepoCommit)
                    .where(
                        RepoCommit.repository_id == repo.id,
                        RepoCommit.environment.is_(None),
                    )
                    .values(
                        branch=repo.default_branch,
                        environment=cls._env_of_branch(repo.default_branch),
                    )
                )

            repo.last_sync_at = datetime.utcnow()
            repo.last_sync_status = RepoSyncStatus.OK
            repo.last_sync_error = None
            repo.first_synced_at = repo.first_synced_at or datetime.utcnow()
            if commits:
                mais_novo = max(c["author_date"] for c in commits)
                repo.last_commit_at = max(repo.last_commit_at or mais_novo, mais_novo)
            repo.commits_count = (await db.execute(
                select(func.count()).select_from(RepoCommit).where(RepoCommit.repository_id == repo.id)
            )).scalar_one()
            return gravados

        except azure.AzureDevOpsError as e:
            repo.last_sync_at = datetime.utcnow()
            repo.last_sync_status = RepoSyncStatus.ERRO
            repo.last_sync_error = str(e)[:500]
            logger.warning("[repo_sync] %s/%s: %s", repo.project, repo.repository, e)
            return 0

    @classmethod
    async def sync_schema(cls, db: AsyncSession, full: bool = False) -> schemas.RepoSyncResult:
        """Sincroniza os repositórios do schema corrente (o job chama uma vez por tenant)."""
        if not azure.azure_devops_configured():
            return schemas.RepoSyncResult()

        repos = list((await db.execute(
            select(CodeRepository)
            .where(
                CodeRepository.is_active.is_(True),
                CodeRepository.sync_enabled.is_(True),
                cast(CodeRepository.provider, String) == "azure_devops",
            )
            # nunca sincronizado primeiro; depois o mais desatualizado
            .order_by(CodeRepository.last_sync_at.asc().nullsfirst())
            .limit(_REPOS_POR_TICK)
        )).scalars())

        total, erros = 0, []
        for repo in repos:
            # try/except por repositório: um repo quebrado não pode travar os outros.
            try:
                total += await cls.sync_repository(db, repo, full=full)
                await db.commit()
            except Exception as e:  # noqa: BLE001
                await db.rollback()
                erros.append(f"{repo.project}/{repo.repository}: {e}")
                logger.error("[repo_sync] %s/%s: %s", repo.project, repo.repository, e)

        if total:
            await CommitAuthorService.refresh_authors(db)
            await db.commit()
        return schemas.RepoSyncResult(repositorios=len(repos), commits_novos=total, erros=erros)

    @classmethod
    async def sync_one(cls, db: AsyncSession, repository_id: uuid.UUID, full: bool = False) -> schemas.RepoSyncResult:
        repo = (await db.execute(
            select(CodeRepository).where(CodeRepository.id == repository_id)
        )).scalar_one_or_none()
        if not repo:
            raise HTTPException(404, "Repositório não encontrado.")
        if not azure.azure_devops_configured():
            raise HTTPException(
                400,
                "Integração com o Azure DevOps não configurada. Defina AZURE_DEVOPS_PAT no .env.",
            )
        novos = await cls.sync_repository(db, repo, full=full)
        await db.commit()
        await CommitAuthorService.refresh_authors(db)
        await db.commit()
        return schemas.RepoSyncResult(
            repositorios=1, commits_novos=novos,
            erros=[repo.last_sync_error] if repo.last_sync_error else [],
        )


class RepoMetricsService:
    """Painel de commits: KPIs, evolução mensal, ranking por dev e visão por produto."""

    # A série mensal usa o fuso de São Paulo: um commit às 22h BRT do dia 31 pertence ao mês
    # que o dev viveu, não ao mês UTC.
    _MES = "to_char(c.author_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')"

    @staticmethod
    def _janela(date_from: date, date_to: date) -> tuple[datetime, datetime]:
        return (
            datetime.combine(date_from, datetime.min.time()),
            datetime.combine(date_to + timedelta(days=1), datetime.min.time()),
        )

    @classmethod
    async def _person_filter(
        cls, db: AsyncSession, team_area_ids: Optional[list[uuid.UUID]], positions: Optional[list[str]],
    ) -> Optional[set[uuid.UUID]]:
        """Pessoas que atendem aos filtros de time/cargo. None = sem filtro."""
        if not team_area_ids and not positions:
            return None
        ids: Optional[set[uuid.UUID]] = None

        if positions:
            rows = (await db.execute(
                select(Person.id).join(Position, Position.id == Person.position_id)
                .where(Position.slug.in_(positions))
            )).scalars()
            ids = set(rows)

        if team_area_ids:
            # team_person_areas não tem step em tenant_migrations (só nasce via create_all):
            # num schema antigo a tabela pode não existir — sem filtro é melhor que 500.
            try:
                rows = (await db.execute(text(
                    "SELECT person_id FROM team_person_areas WHERE area_id = ANY(:ids)"
                ), {"ids": [str(a) for a in team_area_ids]})).scalars()
                por_time = set(rows)
                ids = por_time if ids is None else (ids & por_time)
            except Exception as e:  # noqa: BLE001
                logger.warning("[repo_metrics] filtro de time indisponível: %s", e)

        return ids

    @classmethod
    async def build(
        cls, db: AsyncSession, date_from: date, date_to: date, *,
        product_ids: Optional[list[uuid.UUID]] = None,
        repository_ids: Optional[list[uuid.UUID]] = None,
        person_ids: Optional[list[uuid.UUID]] = None,
        team_area_ids: Optional[list[uuid.UUID]] = None,
        positions: Optional[list[str]] = None,
        incluir_bots: bool = False,
        environments: Optional[list[str]] = None,
    ) -> schemas.RepoOverviewResponse:
        win_start, win_end = cls._janela(date_from, date_to)

        pessoas = await cls._person_filter(db, team_area_ids, positions)
        if person_ids:
            pessoas = set(person_ids) if pessoas is None else (pessoas & set(person_ids))

        params: dict = {"ini": win_start, "fim": win_end}
        where = ["c.author_date >= :ini", "c.author_date < :fim"]
        if not incluir_bots:
            where.append("NOT c.is_bot")
        if environments:
            where.append("c.environment = ANY(:envs)")
            params["envs"] = environments
        if repository_ids:
            where.append("c.repository_id = ANY(:repos)")
            params["repos"] = [str(r) for r in repository_ids]
        if pessoas is not None:
            where.append("c.person_id = ANY(:pessoas)")
            params["pessoas"] = [str(p) for p in pessoas] or ["00000000-0000-0000-0000-000000000000"]
        if product_ids:
            where.append(
                "EXISTS (SELECT 1 FROM product_repositories pr "
                "WHERE pr.repository_id = c.repository_id AND pr.product_id = ANY(:prods))"
            )
            params["prods"] = [str(p) for p in product_ids]
        w = " AND ".join(where)

        # ── KPIs ──
        kpi = (await db.execute(text(f"""
            SELECT count(*) AS commits,
                   count(DISTINCT c.person_id) FILTER (WHERE c.person_id IS NOT NULL) AS devs,
                   count(DISTINCT c.repository_id) AS repos,
                   count(*) FILTER (WHERE c.person_id IS NULL AND NOT c.is_bot) AS sem_autor,
                   count(*) FILTER (WHERE c.environment = 'prod') AS commits_prod,
                   count(*) FILTER (WHERE c.environment = 'hml') AS commits_hml,
                   count(*) FILTER (WHERE c.environment = 'dev') AS commits_dev
              FROM repo_commits c WHERE {w}
        """), params)).mappings().one()

        totais = (await db.execute(text("""
            SELECT (SELECT count(*) FROM code_repositories WHERE is_active) AS repos_ativos,
                   (SELECT count(DISTINCT product_id) FROM product_repositories) AS produtos_com_repo,
                   (SELECT count(*) FROM repo_commit_authors WHERE resolution = 'pendente') AS pendentes,
                   (SELECT max(last_sync_at) FROM code_repositories) AS ultimo_sync
        """))).mappings().one()

        # ── série mensal global ──
        series = [
            schemas.MonthPoint(month=r["mes"], commits=r["commits"])
            for r in (await db.execute(text(
                f"SELECT {cls._MES} AS mes, count(*) AS commits FROM repo_commits c "
                f"WHERE {w} GROUP BY 1 ORDER BY 1"
            ), params)).mappings()
        ]

        # ── por dev ──
        dev_rows = list((await db.execute(text(f"""
            SELECT c.person_id,
                   coalesce(p.full_name, coalesce(c.author_name, c.author_email, 'Sem autor')) AS nome,
                   pos.name AS cargo,
                   count(*) AS commits,
                   sum(c.add_count) AS add_c, sum(c.edit_count) AS edit_c, sum(c.delete_count) AS del_c,
                   count(*) FILTER (WHERE c.is_merge) AS merges,
                   count(DISTINCT c.repository_id) AS repos,
                   count(DISTINCT c.author_date::date) AS dias,
                   min(c.author_date) AS primeiro, max(c.author_date) AS ultimo
              FROM repo_commits c
              LEFT JOIN team_persons p ON p.id = c.person_id
              LEFT JOIN team_positions pos ON pos.id = p.position_id
             WHERE {w}
             GROUP BY c.person_id, nome, pos.name
             ORDER BY commits DESC
        """), params)).mappings())

        dev_series: dict[Optional[uuid.UUID], list[schemas.MonthPoint]] = {}
        for r in (await db.execute(text(
            f"SELECT c.person_id, {cls._MES} AS mes, count(*) AS commits FROM repo_commits c "
            f"WHERE {w} GROUP BY 1, 2 ORDER BY 2"
        ), params)).mappings():
            dev_series.setdefault(r["person_id"], []).append(
                schemas.MonthPoint(month=r["mes"], commits=r["commits"])
            )

        prod_por_dev = {
            r["person_id"]: r["produtos"] for r in (await db.execute(text(f"""
                SELECT c.person_id, count(DISTINCT pr.product_id) AS produtos
                  FROM repo_commits c
                  JOIN product_repositories pr ON pr.repository_id = c.repository_id
                 WHERE {w} GROUP BY 1
            """), params)).mappings()
        }

        by_dev = [
            schemas.DevCommitRow(
                person_id=r["person_id"], person_name=r["nome"], position=r["cargo"],
                commits=r["commits"], arquivos_add=r["add_c"] or 0,
                arquivos_edit=r["edit_c"] or 0, arquivos_delete=r["del_c"] or 0,
                merges=r["merges"], repos_tocados=r["repos"],
                produtos_tocados=prod_por_dev.get(r["person_id"], 0),
                dias_com_commit=r["dias"], primeiro_commit=r["primeiro"], ultimo_commit=r["ultimo"],
                series=dev_series.get(r["person_id"], []),
            )
            for r in dev_rows
        ]

        # ── por produto (um repo compartilhado conta para os dois produtos) ──
        by_product = [
            schemas.ProductCommitRow(
                product_id=r["product_id"], product_name=r["name"], sigla=r["sigla"],
                repos=r["repos"], commits=r["commits"], devs=r["devs"],
                ultimo_commit_at=r["ultimo"],
                dias_sem_commit=((datetime.utcnow() - r["ultimo"]).days if r["ultimo"] else None),
            )
            for r in (await db.execute(text(f"""
                SELECT pr.product_id, pd.name, pd.sigla,
                       count(*) AS commits,
                       count(DISTINCT c.repository_id) AS repos,
                       count(DISTINCT c.person_id) AS devs,
                       max(c.author_date) AS ultimo
                  FROM repo_commits c
                  JOIN product_repositories pr ON pr.repository_id = c.repository_id
                  JOIN products pd ON pd.id = pr.product_id
                 WHERE {w}
                 GROUP BY pr.product_id, pd.name, pd.sigla
                 ORDER BY commits DESC
            """), params)).mappings()
        ]

        produtos_sem_commit = max(0, (totais["produtos_com_repo"] or 0) - len(by_product))
        repos_sem_commit = max(0, (totais["repos_ativos"] or 0) - (kpi["repos"] or 0))

        # ── opções dos filtros ──
        position_options = [
            {"slug": s, "name": n} for s, n in (await db.execute(
                select(Position.slug, Position.name)
                .join(Person, Person.position_id == Position.id)
                .where(Person.status != "desligado")
                .group_by(Position.slug, Position.name).order_by(Position.name)
            )).all()
        ]
        repo_options = [
            {"id": str(i), "name": f"{p} / {r}"} for i, p, r in (await db.execute(
                select(CodeRepository.id, CodeRepository.project, CodeRepository.repository)
                .where(CodeRepository.is_active.is_(True))
                .order_by(CodeRepository.project, CodeRepository.repository)
            )).all()
        ]
        try:
            team_options = [
                {"id": str(i), "name": n} for i, n in (await db.execute(text(
                    "SELECT a.id, a.name FROM team_areas a "
                    "WHERE EXISTS (SELECT 1 FROM team_person_areas pa WHERE pa.area_id = a.id) "
                    "ORDER BY a.name"
                ))).all()
            ]
        except Exception:  # noqa: BLE001
            team_options = []

        return schemas.RepoOverviewResponse(
            kpis=schemas.RepoOverviewKpis(
                commits_total=kpi["commits"], devs_ativos=kpi["devs"],
                repos_ativos=totais["repos_ativos"] or 0, repos_sem_commit=repos_sem_commit,
                produtos_com_repo=totais["produtos_com_repo"] or 0,
                produtos_sem_commit=produtos_sem_commit,
                commits_sem_autor=kpi["sem_autor"], autores_pendentes=totais["pendentes"] or 0,
                commits_prod=kpi["commits_prod"] or 0,
                commits_hml=kpi["commits_hml"] or 0,
                commits_dev=kpi["commits_dev"] or 0,
                ultimo_sync_at=totais["ultimo_sync"],
            ),
            by_dev=by_dev, by_product=by_product, series=series,
            position_options=position_options, team_options=team_options, repo_options=repo_options,
            integracao_configurada=azure.azure_devops_configured(),
        )

    @classmethod
    async def list_commits(
        cls, db: AsyncSession, date_from: date, date_to: date, *,
        product_ids: Optional[list[uuid.UUID]] = None,
        repository_ids: Optional[list[uuid.UUID]] = None,
        person_ids: Optional[list[uuid.UUID]] = None,
        incluir_bots: bool = False,
        page: int = 1, page_size: int = 50,
    ) -> schemas.RepoCommitPage:
        win_start, win_end = cls._janela(date_from, date_to)
        page = max(1, page)
        page_size = min(200, max(1, page_size))

        params: dict = {"ini": win_start, "fim": win_end}
        where = ["c.author_date >= :ini", "c.author_date < :fim"]
        if not incluir_bots:
            where.append("NOT c.is_bot")
        if repository_ids:
            where.append("c.repository_id = ANY(:repos)")
            params["repos"] = [str(r) for r in repository_ids]
        if person_ids:
            where.append("c.person_id = ANY(:pessoas)")
            params["pessoas"] = [str(p) for p in person_ids]
        if product_ids:
            where.append(
                "EXISTS (SELECT 1 FROM product_repositories pr "
                "WHERE pr.repository_id = c.repository_id AND pr.product_id = ANY(:prods))"
            )
            params["prods"] = [str(p) for p in product_ids]
        w = " AND ".join(where)

        total = (await db.execute(
            text(f"SELECT count(*) FROM repo_commits c WHERE {w}"), params
        )).scalar_one()

        params_pag = {**params, "lim": page_size, "off": (page - 1) * page_size}
        rows = list((await db.execute(text(f"""
            SELECT c.id, c.commit_id, c.author_name, c.author_email, c.author_date, c.comment,
                   c.add_count, c.edit_count, c.delete_count, c.is_merge, c.is_bot,
                   c.person_id, p.full_name AS person_name, c.remote_url,
                   r.repository, r.project,
                   coalesce(array_agg(pd.name) FILTER (WHERE pd.name IS NOT NULL), '{{}}') AS produtos
              FROM repo_commits c
              JOIN code_repositories r ON r.id = c.repository_id
              LEFT JOIN team_persons p ON p.id = c.person_id
              LEFT JOIN product_repositories pr ON pr.repository_id = c.repository_id
              LEFT JOIN products pd ON pd.id = pr.product_id
             WHERE {w}
             GROUP BY c.id, p.full_name, r.repository, r.project
             ORDER BY c.author_date DESC
             LIMIT :lim OFFSET :off
        """), params_pag)).mappings())

        return schemas.RepoCommitPage(
            items=[
                schemas.RepoCommitItem(
                    id=r["id"], commit_id=r["commit_id"], short_id=(r["commit_id"] or "")[:8],
                    author_name=r["author_name"], author_email=r["author_email"],
                    author_date=r["author_date"], comment=(r["comment"] or "").split("\n")[0][:300],
                    add_count=r["add_count"], edit_count=r["edit_count"], delete_count=r["delete_count"],
                    is_merge=r["is_merge"], is_bot=r["is_bot"], person_id=r["person_id"],
                    person_name=r["person_name"], repository=r["repository"], project=r["project"],
                    remote_url=r["remote_url"], produtos=list(r["produtos"] or []),
                )
                for r in rows
            ],
            total=total, page=page, page_size=page_size,
        )
