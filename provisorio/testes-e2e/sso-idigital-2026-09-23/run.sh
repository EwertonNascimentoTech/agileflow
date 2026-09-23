#!/bin/bash
# Testes do SSO IDigital: backend (IdP falso, transação desfeita) + telas (Playwright, IdP simulado no navegador).
# Uso: ./run.sh  — não mexe na configuração real (SSO segue desligado em produção até o client existir).
SP="$(cd "$(dirname "$0")" && pwd)"
run_py() { docker cp "$SP/$1" saas_api:/tmp/$1 >/dev/null && docker exec -w /app -e PYTHONPATH=/app saas_api python /tmp/$1 2>/dev/null; }
run_py cleanup.py | sed 's/^/limpeza: /'
run_py service_test.py | grep -E '^\[|^==='
run_py fixture.py | tail -1 > "$SP/fixture.json"
docker run --rm --network host -v "$SP:/work" mcr.microsoft.com/playwright/python:v1.48.0-jammy \
  sh -c "pip install -q playwright==1.48.0 >/dev/null 2>&1; python /work/ui_test.py"
run_py cleanup.py | sed 's/^/limpeza: /'
rm -f "$SP/fixture.json"
