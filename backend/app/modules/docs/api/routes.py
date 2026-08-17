from fastapi import APIRouter, Depends, Query

from app.core.security import require_authenticated
from app.modules.docs import service as docs_service

router = APIRouter(prefix="/docs", tags=["Documentação"])


@router.get("/sections")
async def get_sections(_user=Depends(require_authenticated)):
    return docs_service.list_sections()


@router.get("/{section}/files")
async def get_files(section: str, _user=Depends(require_authenticated)):
    return docs_service.list_files(section)


@router.get("/{section}/file")
async def get_file(
    section: str,
    name: str = Query(..., min_length=1, max_length=200),
    _user=Depends(require_authenticated),
):
    return docs_service.read_document(section, name)
