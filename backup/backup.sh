#!/bin/sh
# Backup AgileFlow — PostgreSQL + MinIO + .env
# Rodado pelo serviço saas_backup (cron 12h e 17h, America/Sao_Paulo).
set -eu

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR="${BACKUP_ROOT}/${STAMP}"

PGHOST="${POSTGRES_HOST:-postgres}"
PGPORT="${POSTGRES_PORT:-5432}"
PGUSER="${POSTGRES_USER:?POSTGRES_USER obrigatório}"
PGDATABASE="${POSTGRES_DB:?POSTGRES_DB obrigatório}"

MINIO_DATA="${MINIO_DATA_PATH:-/minio-data}"
ENV_FILE="${ENV_FILE_PATH:-/source/.env}"

mkdir -p "$DIR"
echo "[backup] Início ${STAMP} → ${DIR}"

echo "[backup] PostgreSQL (${PGDATABASE}@${PGHOST})..."
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --no-owner --no-acl --format=plain \
  | gzip -c > "${DIR}/postgres.sql.gz"

if [ -d "$MINIO_DATA" ]; then
  echo "[backup] MinIO (${MINIO_DATA})..."
  tar -C "$MINIO_DATA" -czf "${DIR}/minio-data.tar.gz" .
else
  echo "[backup] MinIO: caminho ausente, pulando."
fi

if [ -f "$ENV_FILE" ]; then
  echo "[backup] .env..."
  cp "$ENV_FILE" "${DIR}/env.backup"
  chmod 600 "${DIR}/env.backup"
else
  echo "[backup] .env: arquivo ausente, pulando."
fi

{
  echo "Backup AgileFlow gerado em ${STAMP}"
  echo "Timezone: $(date +%Z) ($(date -Iseconds))"
  echo ""
  echo "Restaurar PostgreSQL:"
  echo "  gunzip -c postgres.sql.gz | docker exec -i saas_postgres psql -U ${PGUSER} -d ${PGDATABASE}"
  echo ""
  echo "Restaurar MinIO (pare o minio antes, se necessário):"
  echo "  docker run --rm -v agileflow_minio_data:/data -v \$(pwd)/${STAMP}:/backup alpine tar xzf /backup/minio-data.tar.gz -C /data"
  echo ""
  echo "Restaurar .env:"
  echo "  cp env.backup /caminho/do/projeto/.env"
} > "${DIR}/README.txt"

if [ -d "$BACKUP_ROOT" ] && [ "$KEEP_DAYS" -gt 0 ] 2>/dev/null; then
  echo "[backup] Retenção: mantém ${KEEP_DAYS} dias..."
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -exec rm -rf {} +
fi

SIZE=$(du -sh "$DIR" | awk '{print $1}')
echo "[backup] Concluído ${STAMP} (${SIZE})"
