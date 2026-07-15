FROM postgres:16-alpine

RUN apk add --no-cache tzdata

ENV TZ=America/Sao_Paulo
ENV BACKUP_ROOT=/backups
ENV BACKUP_KEEP_DAYS=14
ENV MINIO_DATA_PATH=/minio-data
ENV ENV_FILE_PATH=/source/.env
ENV POSTGRES_HOST=postgres
ENV POSTGRES_PORT=5432

COPY backup.sh /usr/local/bin/backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh \
  && chmod 0600 /etc/crontabs/root

WORKDIR /backups
# -f: foreground · -l 2: log level info
CMD ["crond", "-f", "-l", "2"]
