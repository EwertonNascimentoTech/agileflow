import sys
from app.core.storage import get_minio
from app.core.config import settings
c = get_minio()
objs = [o.object_name for o in c.list_objects(settings.MINIO_BUCKET_DEFAULT, prefix="projetos/tenant_ss/ocorrencias/", recursive=True)]
print(objs)
if len(sys.argv) > 1 and sys.argv[1] == "rm":
    for o in objs: c.remove_object(settings.MINIO_BUCKET_DEFAULT, o)
    print("removidos", len(objs))
