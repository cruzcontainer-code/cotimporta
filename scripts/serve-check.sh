#!/usr/bin/env bash
# Arranca el build de producción (next start), pide una ruta y verifica el estado HTTP y,
# opcionalmente, que el cuerpo contenga un texto literal. Apaga el servidor al salir.
# Uso: bash scripts/serve-check.sh <ruta> <estado> [patrón-literal] [cookie]
# Ejemplo: bash scripts/serve-check.sh / 200 'class="dark"' 'theme=dark'
# Requiere un `pnpm build` previo. Sale 0 solo si estado y patrón coinciden.
set -euo pipefail

path="${1:?uso: serve-check.sh <ruta> <estado> [patrón] [cookie]}"
expected="${2:?falta el estado esperado}"
pattern="${3:-}"
cookie="${4:-}"
port="${SERVE_CHECK_PORT:-3200}"
base="http://127.0.0.1:${port}"

if [ ! -f .next/BUILD_ID ]; then
  echo "serve-check: no hay build de producción (.next/BUILD_ID); ejecuta pnpm build" >&2
  exit 2
fi

mkdir -p .data
log=".data/serve-check.log"
body=".data/serve-check.body"

# Grupo de procesos propio para poder apagar next start y sus hijos de una vez.
set -m
./node_modules/.bin/next start --port "$port" >"$log" 2>&1 &
server_pid=$!
set +m

cleanup() {
  kill -- "-${server_pid}" 2>/dev/null || kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${base}/" || true)"
  if [ "$code" != "000" ]; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "serve-check: el servidor no respondió en 90 s; ver ${log}" >&2
  exit 3
fi

if [ -n "$cookie" ]; then
  status="$(curl -s -o "$body" -w '%{http_code}' -H "Cookie: ${cookie}" "${base}${path}")"
else
  status="$(curl -s -o "$body" -w '%{http_code}' "${base}${path}")"
fi

if [ "$status" != "$expected" ]; then
  echo "serve-check: ${path} respondió ${status}, se esperaba ${expected}" >&2
  exit 1
fi

if [ -n "$pattern" ] && ! grep -qF -- "$pattern" "$body"; then
  echo "serve-check: el cuerpo de ${path} no contiene: ${pattern}" >&2
  exit 1
fi

echo "serve-check: OK ${path} ${status}"
