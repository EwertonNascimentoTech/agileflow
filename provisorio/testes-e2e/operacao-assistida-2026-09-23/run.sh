#!/bin/bash
# E2E da Operação Assistida (Fases 1–5) contra o sistema no ar (tenant_ss), com dados isolados [E2E].
# Uso: ./run.sh            → limpa, cria fixture, API (partes 1 e 2), telas (Playwright), encerra e limpa
#      ./run.sh cleanup-only → só remove o que um teste anterior deixou
# Requer: containers saas_* no ar e a imagem mcr.microsoft.com/playwright/python:v1.48.0-jammy.
SP="$(cd "$(dirname "$0")" && pwd)"
cleanup() {
  PRE=$(python3 -c "import json;print(json.dumps(json.load(open('$SP/e2e_ids.json'))['pre']))" 2>/dev/null || echo '{"client_role_existed": false}')
  UPL=$(python3 -c "import json;print(json.dumps(json.load(open('$SP/e2e_state.json'))['state']['uploads']))" 2>/dev/null || echo '[]')
  docker cp "$SP/e2e_cleanup.py" saas_api:/tmp/c.py >/dev/null && docker exec -w /app -e PYTHONPATH=/app saas_api python /tmp/c.py "$PRE" "$UPL" 2>&1 | grep '^{' | sed 's/^/limpeza: /'
  docker cp "$SP/minio_ls.py" saas_api:/tmp/m.py >/dev/null && docker exec -w /app -e PYTHONPATH=/app saas_api python /tmp/m.py rm 2>&1 | tail -1 | sed 's/^/minio: /'
  rm -f "$SP/e2e_state.json" "$SP/e2e_ids.json"
}
cleanup
[ "$1" = "cleanup-only" ] && exit 0
docker cp "$SP/e2e_fixture.py" saas_api:/tmp/f.py >/dev/null && docker exec -w /app -e PYTHONPATH=/app saas_api python /tmp/f.py 2>/dev/null | tail -1 > "$SP/e2e_ids.json"
python3 "$SP/e2e_http.py" && python3 "$SP/e2e_http2.py"
docker run --rm --network host -v "$SP:/work" mcr.microsoft.com/playwright/python:v1.48.0-jammy \
  sh -c "pip install -q playwright==1.48.0 >/dev/null 2>&1; python /work/e2e_ui.py && mkdir -p /work/prints && cp /work/ui/*.png /work/prints/ && rm -rf /work/ui"
python3 "$SP/e2e_http2.py" final
cleanup
