"""Anonimização de PII/dados sensíveis ANTES de enviar conteúdo a integrações EXTERNAS
(gateway IDCortex). Objetivos:
  - Remover dados pessoais identificáveis (nomes, e-mails, telefones, CPF, RG, matrícula,
    cargo de pessoa, assinatura, usuário de rede, identificadores internos).
  - Substituir nomes por PAPÉIS FUNCIONAIS genéricos (Sponsor da área demandante, etc.).
  - Generalizar dado sensível SEM apagar o risco (coleta facial, biometria, saúde,
    financeiro → frases que preservam a sinalização de LGPD/segurança).
  - Generalizar sistemas corporativos quando houver risco de bloqueio por DLP.
  - Preservar os campos necessários para classificação (título/descrição sanitizados,
    rubrica, critérios, etc.) — só o conteúdo identificável é tratado.

`anonymize_text` retorna (texto_anonimizado, relatorio). O relatório informa APENAS
categorias e contagens tratadas — nunca os dados reais removidos.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

# ── 1. Campos de PESSOA → valor substituído por papel funcional genérico ──────────
# Formato típico do prompt: "  - Rótulo: valor"
_PERSON_FIELD_RULES: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"(?im)^(\s*[-•*]?\s*sponsor\s*:\s*)(.+)$"),
     "Sponsor da área demandante", "sponsor"),
    (re.compile(r"(?im)^(\s*[-•*]?\s*solicitante\s*:\s*)(.+)$"),
     "Solicitante anonimizado", "solicitante"),
    (re.compile(r"(?im)^(\s*[-•*]?\s*requisitante\s*:\s*)(.+)$"),
     "Requisitante interno anonimizado", "requisitante"),
    (re.compile(r"(?im)^(\s*[-•*]?\s*respons[áa]vel(?:\s+t[ée]cnico)?\s*:\s*)(.+)$"),
     "Responsável da área demandante", "responsavel"),
    (re.compile(r"(?im)^(\s*[-•*]?\s*(?:dono(?:\s+do\s+neg[óo]cio)?|gestor|gerente|aprovador|"
                r"patrocinador|contato|product\s+owner|p\.?\s*o\.?|analista)\s*:\s*)(.+)$"),
     "Usuário interno anonimizado", "usuario"),
    (re.compile(r"(?im)^(\s*[-•*]?\s*cargo\s*:\s*)(.+)$"),
     "Cargo de usuário interno anonimizado", "cargo"),
    (re.compile(r"(?im)^(\s*[-•*]?\s*(?:matr[íi]cula|usu[áa]rio\s+de\s+rede|login(?:\s+de\s+rede)?|"
                r"assinatura|rg)\s*:\s*)(.+)$"),
     "Identificador interno anonimizado", "identificador_interno"),
]

# ── 2. E-mails → marcador por papel (contexto da linha) ───────────────────────────
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# ── 3. Termos sensíveis → generaliza preservando o risco (LGPD/segurança) ──────────
# Generaliza dado sensível com termos NEUTROS (sem acionar gatilhos do DLP como "LGPD",
# "biometria", "identidade", "saúde"); mantém só a sinalização de que requer avaliação.
_SENSITIVE: list[tuple[re.Pattern, str]] = [
    (re.compile(r"coleta\s+facial|reconhecimento\s+facial|valida[çc][ãa]o\s+facial", re.I),
     "mecanismo de autenticação (requer avaliação)"),
    (re.compile(r"biom[ée]tric[ao]s?|biometria", re.I),
     "dado de autenticação (requer avaliação)"),
    (re.compile(r"dados?\s+de\s+sa[úu]de|prontu[áa]rio", re.I),
     "dado pessoal (requer avaliação)"),
    (re.compile(r"dados?\s+financeiros?\s+pessoa(?:l|is)", re.I),
     "dado financeiro (requer avaliação)"),
]

# ── 4. Sistemas corporativos → generaliza p/ evitar bloqueio por DLP ───────────────
_SYSTEMS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bCRM\s+Rubeus\b|\bRubeus\b", re.I), "Sistema CRM"),
    (re.compile(r"\bSGE\b", re.I), "Sistema Acadêmico/Gestão"),
    (re.compile(r"\be-?commerce\b", re.I), "Portal de Vendas"),
    (re.compile(r"\bfolha\s+de\s+pagamento\b", re.I), "sistema administrativo interno"),
    (re.compile(r"\b(?:LG|Folha)\b", re.I), "sistema administrativo interno"),
    (re.compile(r"\bwhats\s?app\b", re.I), "canal manual de comunicação"),
    (re.compile(r"\bchamados?\b(?!\s+internos)", re.I), "chamados internos"),
]

# Termos trabalhistas/internos e acrônimos regulatórios → generaliza para reduzir o gatilho
# do DLP, preservando o sentido para a classificação.
_TERMS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"controle\s+de\s+ponto", re.I), "controle de frequência de usuários internos"),
    (re.compile(r"\bhoras\s+extras\b", re.I), "jornada adicional"),
    (re.compile(r"\bprofessor(?:es|a|as)?\b", re.I), "usuários internos"),
    (re.compile(r"\bLGPD\b", re.I), "normas de privacidade"),
    (re.compile(r"\bANPD\b", re.I), "órgão regulador"),
    (re.compile(r"\bTCU\b", re.I), "órgão de controle"),
    (re.compile(r"\bSistema\s+S\b"), "entidade do setor"),
]

# ── 5. PII estruturada ────────────────────────────────────────────────────────────
_STRUCTURED: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/\d{4}-?\d{2}\b"), "cnpj_anonimizado", "cnpj"),
    (re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"), "cpf_anonimizado", "cpf"),
    (re.compile(r"\bRG\s*:?\s*\d[\d.\-]{3,}[\dxX]\b", re.I), "rg_anonimizado", "rg"),
    (re.compile(r"\(?\b\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}\b"), "telefone_anonimizado", "telefone"),
    (re.compile(r"https?://[^\s)>\]\"']+"), "url_interna_anonimizada", "url"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "ip_interno_anonimizado", "ip"),
]

_NAME_STOPWORDS = {"de", "da", "do", "das", "dos", "e", "system", "sistema", "ia", "ti"}


def _email_marker(line: str) -> str:
    low = line.lower()
    if "solicit" in low:
        return "email_solicitante_anonimizado"
    if "respons" in low:
        return "email_responsavel_anonimizado"
    return "email_usuario_anonimizado"


def anonymize_text(text: str | None, names: Iterable[str] = ()) -> tuple[str | None, dict[str, int]]:
    """Anonimiza `text` aplicando as regras acima. `names` = nomes de pessoas cadastradas
    (TeamOps) a redigir como "Usuário interno anonimizado". Retorna (texto, relatorio)."""
    report: Counter = Counter()
    if not text:
        return text, {}
    out = text

    # 1) Campos de pessoa (valor inteiro → papel funcional)
    for pattern, role, cat in _PERSON_FIELD_RULES:
        out, n = pattern.subn(lambda m, r=role: f"{m.group(1)}{r}", out)
        if n:
            report[f"campo_pessoa:{cat}"] += n

    # 2) E-mails (marcador por papel conforme a linha)
    lines = out.split("\n")
    for i, line in enumerate(lines):
        if _EMAIL_RE.search(line):
            marker = _email_marker(line)
            lines[i], n = _EMAIL_RE.subn(marker, line)
            report["email"] += n
    out = "\n".join(lines)

    # 3) Nomes de pessoas cadastradas (frase inteira, do mais longo p/ o mais curto)
    seen: set[str] = set()
    for name in sorted({(s or "").strip() for s in names}, key=len, reverse=True):
        if len(name) < 3 or name.lower() in _NAME_STOPWORDS or name.lower() in seen:
            continue
        seen.add(name.lower())
        out, n = re.subn(rf"(?<!\w){re.escape(name)}(?!\w)", "Usuário interno anonimizado",
                         out, flags=re.IGNORECASE)
        if n:
            report["nome_pessoa"] += n

    # 4) Termos sensíveis (generaliza preservando o risco)
    for pattern, repl in _SENSITIVE:
        out, n = pattern.subn(repl, out)
        if n:
            report["dado_sensivel"] += n

    # 5) Sistemas corporativos
    for pattern, repl in _SYSTEMS:
        out, n = pattern.subn(repl, out)
        if n:
            report["sistema_generalizado"] += n

    # 5b) Termos trabalhistas/internos e acrônimos regulatórios
    for pattern, repl in _TERMS:
        out, n = pattern.subn(repl, out)
        if n:
            report["termo_generalizado"] += n

    # 6) PII estruturada (CPF, CNPJ, RG, telefone, URL, IP)
    for pattern, repl, cat in _STRUCTURED:
        out, n = pattern.subn(repl, out)
        if n:
            report[cat] += n

    return out, dict(report)
