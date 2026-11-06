#!/usr/bin/env bash
# pnpm dev:public — run the server locally behind the ngrok static domain (PUBLIC_BASE_URL), for development and as the
# demo-day spare. Ctrl-C stops both. ngrok runs with its own project config (the laptop's default config belongs to
# another account) and with traffic inspection OFF, because inspection records full URLs, including path tokens.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="$(grep '^PUBLIC_BASE_URL=' .env.local | cut -d= -f2-)"
PORT="$(node -p "require('./config/app.json').server.port")"
NGROK_CONFIG="$HOME/.config/ngrok/supabrain.yml"
[ -n "$URL" ] || { echo "PUBLIC_BASE_URL is not set in .env.local"; exit 1; }
[ -f "$NGROK_CONFIG" ] || { echo "missing $NGROK_CONFIG (version: \"3\" + agent.authtoken from NGROK_AUTHTOKEN)"; exit 1; }
ngrok http "$PORT" --config "$NGROK_CONFIG" --url "$URL" --inspect=false --log stdout --log-format logfmt > /tmp/supabrain-ngrok.log 2>&1 &
NGROK=$!
trap 'kill $NGROK 2>/dev/null || true' EXIT
echo "tunnel $URL → :$PORT (ngrok log: /tmp/supabrain-ngrok.log)"
NODE_NO_WARNINGS=1 pnpm --filter @supabrain/server start
