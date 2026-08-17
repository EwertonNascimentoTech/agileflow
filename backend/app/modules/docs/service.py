"""Serviço de leitura das documentações em docs/{processo,usuario,técnico}."""
from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import settings

ALLOWED_SECTIONS: dict[str, str] = {
    "processo": "processo",
    "usuario": "usuario",
    "tecnico": "técnico",
    "técnico": "técnico",
}

SECTION_META = [
    {
        "slug": "usuario",
        "folder": "usuario",
        "title": "Utilizador",
        "description": "Guias para quem usa a aplicação",
    },
    {
        "slug": "processo",
        "folder": "processo",
        "title": "Processo",
        "description": "BPMN e ficha de processo de negócio",
    },
    {
        "slug": "tecnico",
        "folder": "técnico",
        "title": "Técnico",
        "description": "Documentação para a equipa de desenvolvimento",
    },
]

_ALLOWED_SUFFIXES = {".md", ".xml", ".txt", ".svg"}


def resolve_docs_root() -> Path:
    """Resolve a raiz de docs/: DOCS_ROOT, /docs (Docker) ou pasta na raiz do repo."""
    candidates: list[Path] = []
    if settings.DOCS_ROOT.strip():
        candidates.append(Path(settings.DOCS_ROOT).expanduser())
    candidates.append(Path("/docs"))
    # backend/app/modules/docs/service.py → repo root = parents[4]
    here = Path(__file__).resolve()
    candidates.append(here.parents[4] / "docs")
    candidates.append(Path.cwd().parent / "docs")
    candidates.append(Path.cwd() / "docs")

    for path in candidates:
        try:
            if path.is_dir():
                return path.resolve()
        except OSError:
            continue
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Pasta de documentação não encontrada no servidor.",
    )


def _section_dir(section: str) -> Path:
    key = section.strip().lower()
    # Preserve exact técnico lookup via ALLOWED_SECTIONS
    folder = ALLOWED_SECTIONS.get(section.strip()) or ALLOWED_SECTIONS.get(key)
    if not folder:
        raise HTTPException(status_code=404, detail="Secção de documentação inválida.")
    root = resolve_docs_root()
    path = (root / folder).resolve()
    if not str(path).startswith(str(root.resolve())) or not path.is_dir():
        raise HTTPException(status_code=404, detail="Secção não encontrada.")
    return path


def _safe_file(section: str, filename: str) -> Path:
    if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
        raise HTTPException(status_code=400, detail="Nome de ficheiro inválido.")
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Tipo de ficheiro não suportado.")
    base = _section_dir(section)
    path = (base / filename).resolve()
    if not str(path).startswith(str(base)) or not path.is_file():
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    return path


def list_sections() -> list[dict]:
    root = resolve_docs_root()
    out: list[dict] = []
    for meta in SECTION_META:
        folder = root / meta["folder"]
        count = 0
        if folder.is_dir():
            count = sum(
                1
                for p in folder.iterdir()
                if p.is_file() and p.suffix.lower() in _ALLOWED_SUFFIXES and not p.name.startswith(".")
            )
        out.append({**meta, "file_count": count, "available": folder.is_dir()})
    return out


def list_files(section: str) -> list[dict]:
    base = _section_dir(section)
    files: list[dict] = []
    for p in sorted(base.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file() or p.name.startswith("."):
            continue
        if p.suffix.lower() not in _ALLOWED_SUFFIXES:
            continue
        files.append(
            {
                "name": p.name,
                "title": _title_from_name(p.name),
                "format": p.suffix.lower().lstrip("."),
                "size": p.stat().st_size,
            }
        )
    return files


def read_document(section: str, filename: str) -> dict:
    path = _safe_file(section, filename)
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        content = path.read_text(encoding="latin-1")
    return {
        "section": section,
        "name": path.name,
        "title": _title_from_name(path.name),
        "format": path.suffix.lower().lstrip("."),
        "content": content,
    }


def _title_from_name(name: str) -> str:
    stem = Path(name).stem
    if stem.upper() == "README":
        return "Índice"
    # 01-foo-bar → Foo bar
    parts = stem.split("-", 1)
    label = parts[1] if len(parts) == 2 and parts[0].isdigit() else stem
    return label.replace("-", " ").replace("_", " ").strip().capitalize()
