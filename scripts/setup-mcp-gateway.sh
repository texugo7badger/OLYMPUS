#!/usr/bin/env bash
#
# setup-mcp-gateway.sh — Installs mcp-gateway (Rust) + generates config.toml.
#
# mcp-gateway multiplexes multiple MCP servers into 4 meta-tools
# (list_servers, list_tools, call_tool, get_tool_schema).
# 95% context savings when fronting many MCPs.
#
# Usage:
#   bash scripts/setup-mcp-gateway.sh
#   bash scripts/setup-mcp-gateway.sh --skip-install
#   bash scripts/setup-mcp-gateway.sh --force
#
set -euo pipefail

SKIP_INSTALL=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    --force) FORCE=true ;;
  esac
done

CONFIG_DIR="${HOME}/.config/mcp-gateway"
CONFIG_FILE="${CONFIG_DIR}/config.toml"

if ! command -v cargo &>/dev/null; then
  if [[ "$SKIP_INSTALL" == "false" ]]; then
    echo "Cargo not found. Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "${HOME}/.cargo/env"
    echo "✓ Rust installed"
  fi
fi

if [[ "$SKIP_INSTALL" == "false" ]]; then
  if ! command -v mcp-gateway &>/dev/null; then
    echo "Installing mcp-gateway via cargo (~5 min)..."
    cargo install mcp-gateway
    echo "✓ mcp-gateway installed: $(which mcp-gateway)"
  fi
fi

if [[ -f "$CONFIG_FILE" && "$FORCE" != "true" ]]; then
  echo "Config exists: $CONFIG_FILE (use --force to overwrite)"
else
  echo "Generating config: $CONFIG_FILE"
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" << 'TOML'
[server]

[[upstream]]
name = "github"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github@latest"]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "${GITHUB_PERSONAL_ACCESS_TOKEN}" }

[[upstream]]
name = "context7"
command = "npx"
args = ["-y", "@upstash/context7-mcp@latest"]
env = {}

[[upstream]]
name = "filesystem"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem@latest", "${PROJECT_ROOT}"]
env = {}

[[upstream]]
name = "memory"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-memory@latest"]
env = { MEMORY_FILE_PATH = "${HOME}/OLYMPUS-VAULT/05_Auto_Learning/kg-memory.json" }
TOML
  echo "✓ Config generated: $CONFIG_FILE"
fi

echo
echo "✓ mcp-gateway setup complete"
echo
echo ".mcp.json entry:"
echo '  "mcp-gateway": {'
echo '    "command": "mcp-gateway",'
echo "    \"args\": [\"--config\", \"$CONFIG_FILE\"],"
echo '    "env": {}'
echo '  }'
