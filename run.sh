#!/usr/bin/env bash
# Runs RepLay locally with hot reload: save a file, the page updates.
#   http://localhost:5180
# ./run.sh samples/<file>.replay opens straight into that replay.
# Ctrl+C stops it.
set -euo pipefail
cd "$(dirname "$0")"

port=5180
if lsof -ti tcp:$port -sTCP:LISTEN >/dev/null; then
  echo "Port $port is already in use — is ./run.sh running in another terminal?" >&2
  exit 1
fi

command -v pnpm >/dev/null || corepack enable
[ -d node_modules ] || pnpm install

url=http://localhost:$port/
[ $# -eq 0 ] || url+="?replay=$1"

trap 'kill 0' EXIT
pnpm dev --port $port --strictPort &

until curl -s -o /dev/null http://localhost:$port; do sleep 0.5; done
open "$url"

wait
