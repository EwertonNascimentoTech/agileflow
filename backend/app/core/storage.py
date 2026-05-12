"""
MinIO storage client.
Usado para upload de anexos (imagens, áudios, PDFs) de mensagens e propostas.
"""
import io
import uuid
from datetime import timedelta
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Optional[Minio] = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def ensure_bucket(bucket: str) -> None:
    client = get_minio()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


def upload_file(
    data: bytes,
    content_type: str,
    bucket: Optional[str] = None,
    object_name: Optional[str] = None,
    folder: str = "uploads",
) -> str:
    """
    Faz upload de bytes para o MinIO e retorna o object_name gerado.
    O caller usa object_name para gerar presigned URL depois.
    """
    bucket = bucket or settings.MINIO_BUCKET_DEFAULT
    ensure_bucket(bucket)

    ext = _ext_for_content_type(content_type)
    object_name = object_name or f"{folder}/{uuid.uuid4()}{ext}"

    client = get_minio()
    client.put_object(
        bucket,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_name


def get_presigned_url(object_name: str, bucket: Optional[str] = None, expires_hours: int = 24) -> str:
    """Gera presigned URL para leitura (GET) do objeto."""
    bucket = bucket or settings.MINIO_BUCKET_DEFAULT
    client = get_minio()
    try:
        return client.presigned_get_object(
            bucket, object_name, expires=timedelta(hours=expires_hours)
        )
    except S3Error:
        return ""


def delete_object(object_name: str, bucket: Optional[str] = None) -> None:
    bucket = bucket or settings.MINIO_BUCKET_DEFAULT
    client = get_minio()
    try:
        client.remove_object(bucket, object_name)
    except S3Error:
        pass


def _ext_for_content_type(ct: str) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "audio/ogg": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/wav": ".wav",
        "video/mp4": ".mp4",
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    }
    return mapping.get(ct, "")
