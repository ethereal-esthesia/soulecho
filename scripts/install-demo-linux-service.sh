#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  exec sudo -E "$0" "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_USER="${APP_USER:-shane}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_DIR="${APP_DIR:-$PROJECT_DIR}"
SERVICE_NAME="${SERVICE_NAME:-soulecho-astera-demo}"
DEMO_CONFIGURATION="${DEMO_CONFIGURATION:-astera}"
SOULECHO_HOST="${SOULECHO_HOST:-127.0.0.1}"
SOULECHO_PORT="${SOULECHO_PORT:-4173}"
SOULECHO_BASE_PATH="${SOULECHO_BASE_PATH:-/soulecho/demo/}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2:3b}"
ANIMAVISAGE_URL="${ANIMAVISAGE_URL:-http://127.0.0.1:8766}"
ANIMAVISAGE_FOLDER="${ANIMAVISAGE_FOLDER:-}"
ANIMAVISAGE_REQUEST_TIMEOUT_MS="${ANIMAVISAGE_REQUEST_TIMEOUT_MS:-10000}"
PROFILE_METADATA_EXTRACTION="${PROFILE_METADATA_EXTRACTION:-1}"
MAX_CONSOLE_MEMORY_LINES="${MAX_CONSOLE_MEMORY_LINES:-40}"
RUN_OLLAMA_SETUP="${RUN_OLLAMA_SETUP:-1}"
MIN_NODE_MAJOR="${MIN_NODE_MAJOR:-20}"
NODE_MAJOR="${NODE_MAJOR:-22}"
NODESOURCE_SETUP_URL="${NODESOURCE_SETUP_URL:-https://deb.nodesource.com/setup_${NODE_MAJOR}.x}"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_user() {
  id "$APP_USER" >/dev/null 2>&1 || fail "User does not exist: $APP_USER"
  getent group "$APP_GROUP" >/dev/null 2>&1 || fail "Group does not exist: $APP_GROUP"
}

install_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    fail "This installer currently supports Debian/Ubuntu systems with apt-get."
  fi

  log "Installing base runtime packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl
}

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi

  node --version | sed -E 's/^v([0-9]+).*/\1/'
}

install_node_runtime() {
  local current_major
  current_major="$(node_major_version)"

  if [[ "$current_major" =~ ^[0-9]+$ ]] && [[ "$current_major" -ge "$MIN_NODE_MAJOR" ]] &&
    command -v npm >/dev/null 2>&1; then
    log "Node $(node --version) is ready"
    return
  fi

  log "Installing Node $NODE_MAJOR.x"
  curl -fsSL "$NODESOURCE_SETUP_URL" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs
}

prepare_project() {
  log "Preparing SoulEcho at $APP_DIR"
  [[ -f "$APP_DIR/package.json" ]] || fail "Missing package.json in $APP_DIR"
  chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

  sudo -H -u "$APP_USER" npm --prefix "$APP_DIR" ci --include=optional
  sudo -H -u "$APP_USER" env \
    SOULECHO_BASE_PATH="$SOULECHO_BASE_PATH" \
    VITE_OLLAMA_MODEL="$OLLAMA_MODEL" \
    VITE_PROFILE_METADATA_EXTRACTION="$PROFILE_METADATA_EXTRACTION" \
    VITE_MAX_CONSOLE_MEMORY_LINES="$MAX_CONSOLE_MEMORY_LINES" \
    npm --prefix "$APP_DIR" run demo:build -- "$DEMO_CONFIGURATION"

  local metadata_enabled=true
  if [[ "$PROFILE_METADATA_EXTRACTION" == "0" || "$PROFILE_METADATA_EXTRACTION" == "false" ]]; then
    metadata_enabled=false
  fi

  cat > "$APP_DIR/dist/app-settings.json" <<EOF
{
  "profileMetadataExtraction": $metadata_enabled,
  "maxConsoleMemoryLines": $MAX_CONSOLE_MEMORY_LINES
}
EOF
  chown "$APP_USER:$APP_GROUP" "$APP_DIR/dist/app-settings.json"
}

install_service() {
  log "Installing $SERVICE_NAME.service"
  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=SoulEcho Astera demo
After=network-online.target ollama.service
Wants=network-online.target ollama.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=HOST=$SOULECHO_HOST
Environment=PORT=$SOULECHO_PORT
Environment=SOULECHO_BASE_PATH=$SOULECHO_BASE_PATH
Environment=OLLAMA_URL=$OLLAMA_URL
Environment=OLLAMA_MODEL=$OLLAMA_MODEL
Environment=ANIMAVISAGE_URL=$ANIMAVISAGE_URL
Environment=ANIMAVISAGE_FOLDER=$ANIMAVISAGE_FOLDER
Environment=ANIMAVISAGE_REQUEST_TIMEOUT_MS=$ANIMAVISAGE_REQUEST_TIMEOUT_MS
Environment=PROFILE_METADATA_EXTRACTION=$PROFILE_METADATA_EXTRACTION
Environment=MAX_CONSOLE_MEMORY_LINES=$MAX_CONSOLE_MEMORY_LINES
ExecStart=/usr/bin/npm run demo:preview -- --host $SOULECHO_HOST --port $SOULECHO_PORT --base $SOULECHO_BASE_PATH $DEMO_CONFIGURATION
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME.service"
  systemctl restart "$SERVICE_NAME.service"
}

check_health() {
  local url="http://$SOULECHO_HOST:$SOULECHO_PORT$SOULECHO_BASE_PATH"
  local attempt

  log "Checking SoulEcho preview at $url"
  for attempt in {1..30}; do
    if curl -fsS "$url" >/dev/null; then
      return
    fi
    sleep 0.5
  done

  systemctl --no-pager --full status "$SERVICE_NAME.service" || true
  journalctl -u "$SERVICE_NAME.service" -n 80 --no-pager || true
  fail "SoulEcho preview did not become healthy at $url"
}

print_summary() {
  log "SoulEcho service ready"
  echo "Service: $SERVICE_NAME.service"
  echo "Local URL: http://$SOULECHO_HOST:$SOULECHO_PORT/"
  echo "Public base path: $SOULECHO_BASE_PATH"
  echo "Logs: journalctl -u $SERVICE_NAME.service -f"
}

require_user
install_packages
install_node_runtime
if [[ "$RUN_OLLAMA_SETUP" == "1" ]]; then
  OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}" \
  OLLAMA_MODEL="$OLLAMA_MODEL" \
    "$SCRIPT_DIR/setup-ollama-linux.sh"
fi
prepare_project
install_service
check_health
print_summary
