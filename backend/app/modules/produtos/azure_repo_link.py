"""Parser das URLs de repositório gravadas em `products.link_repositorio`.

O campo é texto livre e foi preenchido à mão, então convive com várias formas reais
(levantadas nos 43 links do tenant em ago/2026):

    https://dev.azure.com/{org}/{project}/_git/{repo}
    https://{org}@dev.azure.com/{org}/{project}/_git/{repo}      # forma que o Azure copia
    https://dev.azure.com/{org}/Avalia%C3%A7%C3%A3o%20FRPRT      # sem /_git/ → projeto inteiro
    https://github.com/FIEA-IA/MetroLIMS                          # outro provider
    https://capacitamais-dev.sistemafiea.com.br/                  # nem é repositório
    dois links no MESMO campo, separados por quebra de linha (Athena, Ivy)

O parser NÃO decide nada: classifica e devolve. Quem grava é o importador, depois da
confirmação do gestor.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional
from urllib.parse import unquote, urlparse

LinkKind = Literal["azure_repo", "azure_projeto", "outro_provider", "nao_repositorio"]

_AZURE_HOSTS = ("dev.azure.com", "visualstudio.com", "vsts.io")
_GIT_HOSTS = ("github.com", "gitlab.com", "bitbucket.org")


@dataclass(frozen=True)
class ParsedLink:
    """Uma URL do campo, já classificada."""
    url: str
    kind: LinkKind
    organization: Optional[str] = None
    project: Optional[str] = None
    repository: Optional[str] = None
    provider: Optional[str] = None  # 'azure_devops' | 'github' | ...

    @property
    def is_importable(self) -> bool:
        return self.kind == "azure_repo"


def split_links(raw: Optional[str]) -> list[str]:
    """Quebra o conteúdo do campo em URLs individuais (quebra de linha, vírgula ou espaço)."""
    if not raw:
        return []
    parts = re.split(r"[\s,;]+", raw.strip())
    return [p.strip() for p in parts if p.strip().lower().startswith("http")]


def _provider_of(host: str) -> Optional[str]:
    host = host.lower()
    if any(h in host for h in _AZURE_HOSTS):
        return "azure_devops"
    if "github.com" in host:
        return "github"
    if "gitlab" in host:
        return "gitlab"
    if "bitbucket" in host:
        return "bitbucket"
    return None


def parse_link(url: str) -> ParsedLink:
    """Classifica uma única URL."""
    url = (url or "").strip()
    try:
        parsed = urlparse(url)
    except ValueError:
        return ParsedLink(url=url, kind="nao_repositorio")

    host = (parsed.netloc or "").split("@")[-1].lower()  # descarta credencial embutida
    provider = _provider_of(host)

    if provider is None:
        return ParsedLink(url=url, kind="nao_repositorio")

    if provider != "azure_devops":
        return ParsedLink(url=url, kind="outro_provider", provider=provider)

    # dev.azure.com/{org}/{project}[/_git/{repo}] — segmentos vêm URL-encoded.
    segments = [unquote(s) for s in parsed.path.split("/") if s]
    if len(segments) < 2:
        return ParsedLink(url=url, kind="nao_repositorio", provider=provider)

    organization, project = segments[0], segments[1]
    repository = None
    if "_git" in segments:
        idx = segments.index("_git")
        if idx + 1 < len(segments):
            repository = segments[idx + 1]
        # /{org}/{project}/_git/{repo}: quando o projeto é omitido, o Azure usa
        # /{org}/_git/{repo} e o nome do repo vale como projeto.
        if idx == 1:
            project = repository or project

    if repository:
        return ParsedLink(
            url=url, kind="azure_repo", provider=provider,
            organization=organization, project=project, repository=repository,
        )
    return ParsedLink(
        url=url, kind="azure_projeto", provider=provider,
        organization=organization, project=project,
    )


def parse_field(raw: Optional[str]) -> list[ParsedLink]:
    """Classifica todas as URLs de um `link_repositorio`."""
    return [parse_link(u) for u in split_links(raw)]
