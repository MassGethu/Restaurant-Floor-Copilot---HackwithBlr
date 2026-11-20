#!/usr/bin/env bash
# Puts the app that runs on this Mac online through a temporary Cloudflare
# link, behind a username and password. Start the app first (./run_all.sh).
# The link works only while this script and the app run; Ctrl+C takes it offline.
set -euo pipefail
cd "$(dirname "$0")"

for tool in caddy cloudflared; do
    if ! command -v "$tool" >/dev/null; then
        echo "$tool is missing. Install it with: brew install $tool"
        exit 1
    fi
done

export API_PORT="${API_PORT:-8001}"
export SHARE_PORT="${SHARE_PORT:-8090}"
if ! curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null; then
    echo "The backend is not running on port $API_PORT. Start it with ./run_all.sh first."
    exit 1
fi

# The login lives in .env.share (gitignored). A random password is made once;
# edit the file to choose your own.
LOGIN_FILE=.env.share
if [ ! -f "$LOGIN_FILE" ]; then
    umask 077
    printf 'SHARE_USER=demo\nSHARE_PASSWORD=%s\n' \
        "$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)" > "$LOGIN_FILE"
fi
# shellcheck disable=SC1090
source "$LOGIN_FILE"
export SHARE_USER
SHARE_HASH="$(caddy hash-password --plaintext "$SHARE_PASSWORD")"
export SHARE_HASH

echo "Building the dashboard..."
(cd frontend && npm run build >/dev/null)
DIST_DIR="$(pwd)/frontend/dist"
export DIST_DIR

caddy run --config share/Caddyfile --adapter caddyfile >/dev/null 2>&1 &
CADDY_PID=$!
trap 'kill "$CADDY_PID" 2>/dev/null || true' EXIT

echo
echo "Login: user \"$SHARE_USER\", password in $LOGIN_FILE"
echo "The public https://....trycloudflare.com link appears below in a few seconds."
echo
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$SHARE_PORT"
