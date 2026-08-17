"""Cliente da integração com o EPA (Sistema de Planos de Ação — sysepa).

Usado pelo slide "Planos Estratégicos" do RTD. Credenciais únicas da instituição no
.env (EPA_LOGIN/EPA_SENHA); token JWT obtido em POST /epa/api/api/login (form login/senha)
e cacheado até ~expirar (fallback 13h).

Formato mapeado da API real (jul/2026):
  GET /epa/api/planos-de-acoes/grid/Grafico → {"data": [<todos os itens do cliente>]}
  Item: codigo, codigoorigem (pai), tipo ("Plano de Ação" | "Ação Estratégica" | ...),
        status ("Concluído" | "Em Andamento" | "Planejado" | "Suspenso"), oque (título),
        responsavel (login), datafimprevista (prazo; "0000-00-00..." = sem data),
        datafim (fim real), datafimautorizada (data repactuada), percentualConcluido.
O grid devolve o dataset INTEIRO (~15k itens) — cacheado em memória por 10 min.
"""

from __future__ import annotations

import base64
import html
import json
import time
import unicodedata
from datetime import date, datetime
from typing import Any, Optional

import httpx

from app.core.config import settings


class EpaError(Exception):
    """Erro amigável da integração EPA (exibido na UI)."""


_TOKEN_CACHE: dict = {"token": None, "exp": 0.0}
_FALLBACK_TTL = 13 * 3600  # doc: 13h quando o JWT não traz exp

_GRID_CACHE: dict = {"data": None, "ts": 0.0}
_GRID_TTL = 600.0  # o grid traz o dataset inteiro — não rebuscar a cada navegação


def epa_configured() -> bool:
    return bool(settings.EPA_API_BASE_URL and settings.EPA_LOGIN and settings.EPA_SENHA)


def _base() -> str:
    return (settings.EPA_API_BASE_URL or "").strip().rstrip("/")


def _jwt_exp(token: str) -> Optional[float]:
    """Extrai `exp` (epoch) do payload do JWT, sem validar assinatura."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        exp = data.get("exp")
        return float(exp) if exp else None
    except Exception:  # noqa: BLE001
        return None


async def _token(client: httpx.AsyncClient) -> str:
    now = time.time()
    if _TOKEN_CACHE["token"] and _TOKEN_CACHE["exp"] - 300 > now:
        return _TOKEN_CACHE["token"]
    r = await client.post(
        f"{_base()}/epa/api/api/login",
        data={"login": settings.EPA_LOGIN, "senha": settings.EPA_SENHA},
    )
    try:
        body = r.json()
    except Exception:  # noqa: BLE001
        raise EpaError(f"EPA retornou resposta inválida no login (HTTP {r.status_code}).")
    tok = body.get("access_token")
    if r.status_code != 200 or not tok:
        msg = body.get("message") or f"HTTP {r.status_code}"
        raise EpaError(f"Falha no login do EPA: {msg}. Verifique EPA_LOGIN/EPA_SENHA no .env.")
    _TOKEN_CACHE["token"] = tok
    _TOKEN_CACHE["exp"] = _jwt_exp(tok) or (now + _FALLBACK_TTL)
    return tok


# ── Normalização ─────────────────────────────────────────────────────────────

def _parse_date(v: Any) -> Optional[date]:
    """Datas do EPA: 'YYYY-MM-DD HH:MM:SS'; '0000-00-00...' significa SEM data."""
    if not v:
        return None
    s = str(v).strip()
    if s.startswith("0000"):
        return None
    for cand in (s[:19], s[:10]):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(cand, fmt).date()
            except ValueError:
                continue
    return None


def _slug(texto: str) -> str:
    s = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def _status_norm(raw: Any) -> str:
    """'Concluído'|'Em Andamento'|'Planejado'|'Suspenso' → slug estável p/ o front."""
    s = _slug(str(raw or ""))
    if "conclu" in s or "finaliz" in s:
        return "concluido"
    if "andamento" in s or "execu" in s:
        return "em_andamento"
    if "suspens" in s or "cancel" in s:
        return "suspenso"
    if "atras" in s or "vencid" in s:
        return "atrasado"
    return "planejado"


def _prettify_login(login: Any) -> Optional[str]:
    """'ewerton.nascimento' → 'Ewerton Nascimento' (mantém se já for nome/e-mail)."""
    if not login:
        return None
    s = str(login).strip()
    if " " in s or "@" in s:
        return s
    return " ".join(p.capitalize() for p in s.split(".") if p)


def _normalize_acao(raw: dict) -> dict:
    prazo = _parse_date(raw.get("datafimprevista"))
    repactuada = _parse_date(raw.get("datafimautorizada"))
    return {
        "codigo": raw.get("codigo"),
        "titulo": str(raw.get("oque") or "(sem título)"),
        "status": _status_norm(raw.get("status")),
        "status_raw": str(raw.get("status")) if raw.get("status") else None,
        "responsavel": _prettify_login(raw.get("responsavel")),
        "prazo": (repactuada or prazo).isoformat() if (repactuada or prazo) else None,
        # Aproximação: o EPA não expõe contador de repactuações no grid;
        # datafimautorizada preenchida (≠ prazo original) indica repactuação.
        "repactuacoes": 1 if (repactuada and repactuada != prazo) else 0,
        "acompanhamentos": [],  # preenchido em buscar_planos (1 chamada por plano)
    }


def _normalize_acomp(raw: dict) -> dict:
    user = raw.get("usuario_inclusao") or {}
    cliente = user.get("cliente") or {}
    nome = cliente.get("nome") or _prettify_login(user.get("login"))
    data_str = str(raw.get("data_inclusao") or "")[:16]  # "2026-03-03 08:40"
    try:
        horas = float(raw.get("horas") or 0)
    except (TypeError, ValueError):
        horas = 0.0
    return {
        "descricao": html.unescape(str(raw.get("descricao") or "")).strip(),
        "colaborador": nome,
        "data": data_str or None,
        "horas": horas,
    }


async def _acompanhamentos_por_acao(
    client: httpx.AsyncClient, headers: dict, codigo_plano: int,
) -> dict[int, list[dict]]:
    """Acompanhamentos do PLANO inteiro (uma chamada), agrupados por codigo_acao."""
    r = await client.post(
        f"{_base()}/epa/api/planos-de-acoes/acompanhamentos/listar",
        data={
            "draw": 1, "start": 0, "length": 500, "tipo_iniciativa": "",
            "codigo_iniciativa": codigo_plano,
            "with": "usuario_inclusao,arquivos_count,_permissions,actions_tasks",
            "datatable": "true",
        },
        headers={**headers, "X-Requested-With": "XMLHttpRequest"},
    )
    if r.status_code != 200:
        return {}
    out: dict[int, list[dict]] = {}
    for raw in (r.json().get("data") or []):
        try:
            cod_acao = int(raw.get("codigo_acao"))
        except (TypeError, ValueError):
            continue
        out.setdefault(cod_acao, []).append(_normalize_acomp(raw))
    for lst in out.values():
        lst.sort(key=lambda a: a["data"] or "", reverse=True)
    return out


# ── Busca ────────────────────────────────────────────────────────────────────

async def _grid(client: httpx.AsyncClient, headers: dict) -> list[dict]:
    now = time.time()
    if _GRID_CACHE["data"] is not None and now - _GRID_CACHE["ts"] < _GRID_TTL:
        return _GRID_CACHE["data"]
    r = await client.get(f"{_base()}/epa/api/planos-de-acoes/grid/Grafico", headers=headers)
    if r.status_code != 200:
        raise EpaError(f"EPA retornou HTTP {r.status_code} ao buscar o grid de planos.")
    data = r.json().get("data") or []
    _GRID_CACHE["data"] = data
    _GRID_CACHE["ts"] = now
    return data


def _descendentes_folha(codigo: int, filhos_idx: dict[int, list[dict]]) -> list[dict]:
    """Coleta as FOLHAS da subárvore do plano (ações sem filhos; tarefas quando houver)."""
    out: list[dict] = []
    stack = [codigo]
    visitados: set[int] = set()
    while stack:
        cur = stack.pop()
        if cur in visitados:
            continue
        visitados.add(cur)
        for item in filhos_idx.get(cur, []):
            cod = item.get("codigo")
            if cod in filhos_idx and filhos_idx[cod]:
                stack.append(cod)  # container (ação com tarefas) — desce
            else:
                out.append(item)
    return out


async def buscar_planos(codigos: list[int], periodo_fim: date) -> list[dict]:
    """Busca cada plano no EPA e devolve a estrutura normalizada para o slide.
    Erros por plano não derrubam o conjunto (campo `erro` no item)."""
    if not epa_configured():
        raise EpaError("Integração EPA não configurada — defina EPA_LOGIN/EPA_SENHA no .env.")
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=90.0) as client:
        tok = await _token(client)
        headers = {"Authorization": f"Bearer {tok}"}
        grid = await _grid(client, headers)

        by_codigo: dict[int, dict] = {}
        filhos_idx: dict[int, list[dict]] = {}
        for item in grid:
            if int(item.get("excluido") or 0):
                continue
            cod = item.get("codigo")
            if cod is not None:
                by_codigo[cod] = item
            origem = item.get("codigoorigem")
            if origem is not None:
                filhos_idx.setdefault(origem, []).append(item)

        for codigo in codigos:
            raiz = by_codigo.get(codigo)
            if raiz is None:
                out.append({
                    "codigo": codigo, "titulo": f"Plano {codigo}",
                    "execucao_periodo": None, "execucao_total": None, "acoes": [],
                    "erro": "Plano não encontrado no EPA (confira o código).",
                })
                continue

            folhas = _descendentes_folha(codigo, filhos_idx)
            # Suspensas são LISTADAS, mas ficam fora dos denominadores de execução
            # (despriorização consciente).
            acoes = [_normalize_acao(f) for f in folhas]
            acoes.sort(key=lambda a: (
                a["status"] == "suspenso",              # suspensas por último
                a["status"] != "concluido",
                a["prazo"] or "9999-12-31",
            ))
            try:
                acomp_map = await _acompanhamentos_por_acao(client, headers, codigo)
                for a in acoes:
                    if a["codigo"] is not None:
                        a["acompanhamentos"] = acomp_map.get(int(a["codigo"]), [])
            except Exception:  # noqa: BLE001 — acompanhamentos são complemento
                pass

            # Regra da RTD: ação NÃO concluída com prazo até o fim do mês de referência
            # está ATRASADA — independente do status nominal no EPA (Planejado/Em andamento).
            fim_iso = periodo_fim.isoformat()
            for a in acoes:
                if a["status"] in ("planejado", "em_andamento", "outro") \
                        and a["prazo"] and a["prazo"] <= fim_iso:
                    a["status"] = "atrasado"

            exec_base = [a for a in acoes if a["status"] != "suspenso"]
            total = len(exec_base)
            concluidas = sum(1 for a in exec_base if a["status"] == "concluido")
            ate = [a for a in exec_base if a["prazo"] and a["prazo"] <= periodo_fim.isoformat()]
            ate_total = len(ate)
            ate_concluidas = sum(1 for a in ate if a["status"] == "concluido")

            def bloco(done: int, tot: int) -> dict:
                return {
                    "concluidas": done, "total": tot,
                    "pct": round(done / tot * 100, 2) if tot else None,
                }

            out.append({
                "codigo": codigo,
                "titulo": str(raiz.get("oque") or f"Plano {codigo}"),
                "execucao_periodo": bloco(ate_concluidas, ate_total),
                "execucao_total": bloco(concluidas, total),
                "acoes": acoes,
                "erro": None,
            })
    return out
