Backup AgileFlow gerado em 20260626-190610
Restaurar PostgreSQL:
  gunzip -c postgres.sql.gz | docker exec -i saas_postgres psql -U saas_user -d saas_db
Restaurar MinIO (pare o minio antes, se necessário):
  docker run --rm -v agileflow_minio_data:/data -v $(pwd):/backup alpine tar xzf /backup/minio-data.tar.gz -C /data
