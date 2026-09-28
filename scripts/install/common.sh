#!/usr/bin/env bash
#
# OLYMPUS Installer -- shared shell functions (Linux)
# Sourced by install.sh and uninstall.sh.
#
# Colors match bin/olympus.js truecolor scheme:
#   gold  #D4A574 · green #7BAE8E · cyan #6BAEB5 · gray #8B8B8B · red #C4756A
#
# License: AGPL-3.0-or-later (OLYMPUS original code)

# ─── Truecolor RGB escape sequences (fall back to no-color) ──────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RESET='\033[0m'
  BOLD='\033[1m'
  DIM='\033[2m'
  GOLD='\033[38;2;212;165;116m'
  GOLD_DIM='\033[38;2;212;165;116;2m'
  GREEN='\033[38;2;123;174;142m'
  CYAN='\033[38;2;107;174;181m'
  GRAY='\033[38;2;139;139;139m'
  RED='\033[38;2;196;117;106m'
else
  RESET=''; BOLD=''; DIM=''; GOLD=''; GOLD_DIM=''; GREEN=''; CYAN=''; GRAY=''; RED=''
fi

# ─── Logging primitives (match olympus dev style) ────────────────────────────
log()   { echo -e "${GOLD}olympus:${RESET} $*"; }
ok()    { echo -e "  ${GREEN}ok${RESET}  $*"; }
warn()  { echo -e "  ${GOLD}!${RESET}  $*"; }
err()   { echo -e "  ${RED}X${RESET}  $*" >&2; }
info()  { echo -e "  ${GRAY}$*${RESET}"; }
die()   { err "$*"; exit 1; }

# ─── Step header with animated progress indicator ─────────────────────────
# Usage: step_progress "Doing something" <current> <total>
step_progress() {
  local msg="$1"
  local cur="${2:-1}"
  local total="${3:-6}"
  local pct=$(( cur * 100 / total ))
  local filled=$(( pct / 5 ))
  local empty=$(( 20 - filled ))

  printf '\n'
  printf "${BOLD}${GOLD}  ["
  for ((i=0; i<filled; i++)); do printf '#'; done
  printf '>'
  for ((i=1; i<empty; i++)); do printf '·'; done
  printf "] %3d%%${RESET}  ${BOLD}%s${RESET}\n" "$pct" "$msg"
  printf "${DIM}${GRAY}  ${cur}/${total} ──────────────────────────────────────────${RESET}\n"
}

# Simple step (no progress — for single-step sequences like uninstall)
step() {
  echo ''
  echo -e "${BOLD}${GOLD}>${RESET} ${BOLD}$*${RESET}"
}

# ─── Banner (matches olympus dev style) ──────────────────────────────────────
print_banner() {
  local title="$1"
  local line="${GOLD_DIM}──────────────────────────────────────────────────${RESET}"
  echo ''
  echo -e "${line}"
  echo -e "${BOLD}${GOLD}  ${title}${RESET}"
  echo -e "${CYAN}  Low-cost. Excellent quality. Always free.${RESET}"
  echo -e "${line}"
  echo ''
}

# ─── Confirm prompt ──────────────────────────────────────────────────────────
confirm() {
  local prompt="$1"
  local default="${2:-y}"
  local hint
  if [ "$default" = "y" ]; then hint="(Y/n)"; else hint="(y/N)"; fi
  printf "  ${GRAY}%s %s ${RESET}" "$prompt" "$hint"
  if [ -t 0 ]; then
    read -r reply
  else
    reply="$default"
  fi
  [ -z "$reply" ] && reply="$default"
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# ─── Detect OLYMPUS source root ──────────────────────────────────────────────
detect_olympus_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  local candidate="$script_dir/../.."
  if [ -f "$candidate/package.json" ] && [ -f "$candidate/opencode.json" ]; then
    (cd "$candidate" && pwd)
    return 0
  fi
  candidate="$script_dir/.."
  if [ -f "$candidate/package.json" ] && [ -f "$candidate/opencode.json" ]; then
    (cd "$candidate" && pwd)
    return 0
  fi
  if [ -f "./package.json" ] && [ -f "./opencode.json" ]; then
    pwd
    return 0
  fi
  return 1
}

detect_platform()  { echo "linux-$(uname -m)"; }
detect_shell()     { basename "${SHELL:-/bin/bash}"; }

detect_pkg_manager() {
  for pm in npm bun pnpm yarn; do
    if command -v "$pm" >/dev/null 2>&1; then
      echo "$pm"
      return 0
    fi
  done
  return 1
}

version_ge() {
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

node_major_version() {
  node --version 2>/dev/null | sed -E 's/^v([0-9]+)\..*/\1/'
}

warn_node_24() {
  local major
  major="$(node_major_version)"
  if [ -n "$major" ] && [ "$major" -ge 24 ] 2>/dev/null; then
    warn "Node.js v$major detected — better-sqlite3 has no prebuilt binary."
    info "  Using --ignore-scripts fallback (semantic search disabled)."
    info "  For full compatibility: install Node.js 22 LTS (https://nodejs.org/)"
  fi
}

print_opencode_auth_instructions() {
  echo ''
  echo -e "${BOLD}${GOLD}  ── OpenCode Authorization ─────────────────────────────────────────${RESET}"
  echo ''
  echo -e "  ${GRAY}OLYMPUS runs on OpenCode. ALL LLM access — GO plan, Zen, AND${RESET}"
  echo -e "  ${GRAY}free-tier providers — is authorized inside OpenCode itself. OLYMPUS never${RESET}"
  echo -e "  ${GRAY}injects API keys; it reads them from OpenCode's own auth file.${RESET}"
  echo -e "  ${GRAY}Launch the local OpenCode CLI with the olympus command:${RESET}"
  echo ''
  echo -e "       ${GREEN}olympus opencode${RESET}"
  echo ''
  echo -e "  ${BOLD}Path A — GO Plan (paid subscription)${RESET}"
  echo -e "  ${GRAY}Sign in with your GO plan account via the built-in OAuth flow:${RESET}"
  echo ''
  echo -e "    ${GRAY}1.${RESET} Launch: ${GREEN}olympus opencode${RESET}"
  echo -e "    ${GRAY}2.${RESET} Sign in with your GO plan account ${BOLD}(opens your browser)${RESET}"
  echo -e "    ${GRAY}3.${RESET} Exit OpenCode ${DIM}(Ctrl+C or /exit)${RESET}"
  echo -e "    ${GRAY}4.${RESET} Restart OLYMPUS: ${GREEN}npm run dev${RESET}"
  echo ''
  echo -e "  ${BOLD}Path B — Zen Plan (pay-as-you-go, no request caps)${RESET}"
  echo -e "  ${GRAY}OpenCode Zen gives you the full 128-agent OLYMPUS on curated${RESET}"
  echo -e "  ${GRAY}models (opencode/<id>). Authorized inside OpenCode too:${RESET}"
  echo ''
  echo -e "    ${GRAY}1.${RESET} Launch: ${GREEN}olympus opencode${RESET}"
  echo -e "    ${GRAY}2.${RESET} Run ${GREEN}/connect${RESET} and select ${BOLD}OpenCode Zen${RESET}, paste your API key"
  echo -e "       ${DIM}(key: opencode.ai/zen — zero-retention, pay-as-you-go)${RESET}"
  echo -e "    ${GRAY}3.${RESET} Exit OpenCode ${DIM}(Ctrl+C or /exit)${RESET}"
  echo -e "    ${GRAY}4.${RESET} Restart OLYMPUS: ${GREEN}npm run dev${RESET}"
  echo ''
  echo -e "  ${BOLD}Path C — Free Tier (no plan needed)${RESET}"
  echo -e "  ${GRAY}Free-tier providers must ALSO be added inside OpenCode — their${RESET}"
  echo -e "  ${GRAY}authorization is handled there, not by the installer or the UI:${RESET}"
  echo ''
  echo -e "    ${GRAY}1.${RESET} Launch: ${GREEN}olympus opencode${RESET}"
  echo -e "    ${GRAY}2.${RESET} Open Settings and add ${BOLD}Groq${RESET} and/or ${BOLD}OpenRouter${RESET} as providers"
  echo -e "       ${DIM}(free keys: console.groq.com/keys · openrouter.ai/keys)${RESET}"
  echo -e "    ${GRAY}3.${RESET} Exit OpenCode ${DIM}(Ctrl+C or /exit)${RESET}"
  echo -e "    ${GRAY}4.${RESET} Restart OLYMPUS: ${GREEN}npm run dev${RESET}"
  echo ''
  echo -e "  ${DIM}${GRAY}Note: The OpenCode TUI is used for ALL three paths.${RESET}"
  echo -e "  ${DIM}${GRAY}To change keys later, run ${RESET}${DIM}olympus opencode${RESET}${DIM} → Settings.${RESET}"
  echo -e "  ${DIM}${GRAY}No global opencode install is needed — the olympus CLI uses the local one.${RESET}"
  echo -e "${BOLD}${GOLD}  ───────────────────────────────────────────────────────────────────${RESET}"
  echo ''
}


# ─── OpenCode CLI detection ──────────────────────────────────────────────────
OPENCODE_BIN=""
OPENCODE_SOURCE=""
OPENCODE_VERSION=""

find_opencode() {
  local root="$1"
  local local_bin="$root/node_modules/.bin/opencode"

  if [ -f "$local_bin" ] && [ -x "$local_bin" ]; then
    OPENCODE_BIN="$local_bin"
    OPENCODE_SOURCE="local (node_modules/.bin/)"
    OPENCODE_VERSION="$("$local_bin" --version 2>/dev/null | head -n1 || echo unknown)"
    return 0
  fi
  if command -v opencode >/dev/null 2>&1; then
    OPENCODE_BIN="opencode"
    OPENCODE_SOURCE="global (PATH)"
    OPENCODE_VERSION="$(opencode --version 2>/dev/null | head -n1 || echo unknown)"
    return 0
  fi
  return 1
}

has_opencode() { find_opencode "$1"; }

# ─── Vault / Olympus home ────────────────────────────────────────────────────
vault_dir()        { echo "${OLYMPUS_VAULT_DIR:-$HOME/OLYMPUS-VAULT}"; }
olympus_home_dir() { echo "${OLYMPUS_HOME_DIR:-$HOME/.olympus}"; }

dir_size_mb() {
  local dir="$1"
  if [ ! -d "$dir" ]; then echo "0"; return; fi
  du -m -s "$dir" 2>/dev/null | cut -f1
}

print_platform_summary() {
  log "Detected: Linux ($(uname -r), $(uname -m))"
  info "Shell: $(detect_shell)  ·  Package manager: $(detect_pkg_manager || echo none)"
}

# ─── Run command with elapsed-time tracking (foreground) ─────────────────
# Runs the command directly in the foreground so all stdout/stderr output
# streams in real time. Shows elapsed time when the command finishes.
#
# Usage:
#   run_with_timer "Label" command arg1 arg2 ...
run_with_timer() {
  local label="$1"
  shift

  echo ""
  info "Starting: $label"

  local start_time end_time elapsed
  start_time=$(date +%s)

  # Run directly — foreground, inherits TTY, all output shows in real time
  "${@}"
  local exit_code=$?

  end_time=$(date +%s)
  elapsed=$(( end_time - start_time ))
  local minutes=$((elapsed / 60))
  local seconds=$((elapsed % 60))
  local time_str
  if [ "$minutes" -gt 0 ]; then
    time_str="${minutes}m ${seconds}s"
  else
    time_str="${seconds}s"
  fi

  if [ "$exit_code" -eq 0 ]; then
    ok "$label  ${DIM}${GRAY}(${time_str})${RESET}"
  else
    warn "$label  ${DIM}${GRAY}(${time_str}, exit ${exit_code})${RESET}"
  fi

  return $exit_code
}

# ─── npm install ─────────────────────────────────────────────────────────────
npm_install_olympus() {
  local root="$1"
  local pm
  pm="$(detect_pkg_manager)" || die "No package manager found (need npm, bun, pnpm, or yarn)."
  local major
  major="$(node_major_version)"

  echo ""
  info "Installing dependencies — npm's progress bar shows live download status."
  info "The dependency tree resolution phase may take 15-30s with no output."
  echo ""

  local npm_opts=(--no-audit --no-fund)
  if [ "$pm" = "npm" ] && [ -n "$major" ] && [ "$major" -ge 24 ] 2>/dev/null; then
    warn "Using --ignore-scripts due to Node v$major (semantic search disabled)."
    npm_opts+=(--ignore-scripts)
  fi

  # Run npm directly in a foreground subshell so the user sees live output.
  (cd "$root" && run_with_timer "npm install" "$pm" install "${npm_opts[@]}")

  electron_ensure_binary "$root"
}

electron_ensure_binary() {
  local root="$1"
  local electron_pkg="$root/node_modules/electron/package.json"
  local electron_binary="$root/node_modules/electron/dist/electron"

  if [ ! -f "$electron_pkg" ]; then return 0; fi
  if [ -f "$electron_binary" ] && [ -x "$electron_binary" ]; then return 0; fi

  local install_script="$root/node_modules/electron/install.js"
  if [ -f "$install_script" ]; then
    log "Electron binary not found — downloading..."
    if (cd "$root" && node "$install_script" 2>&1); then
      if [ -f "$electron_binary" ] && [ -x "$electron_binary" ]; then
        ok "Electron binary downloaded"
      else
        warn "Electron download ran but binary not found at $electron_binary"
        info "  Run manually: node node_modules/electron/install.js"
      fi
    else
      warn "Electron download failed — run: node node_modules/electron/install.js"
    fi
  fi
}

# ─── TypeScript compilation (with live progress) ───────────────────────────
compile_plugins() {
  local root="$1"
  local had_failure=0

  echo ""
  info "Compiling TypeScript layers — tsc output shows real-time progress."

  log "ECC plugin..."
  if (cd "$root" && run_with_timer "ECC plugin" npx --no-install tsc --project .opencode/tsconfig.json); then
    ok "ECC plugin tsc passed"
  else
    if (cd "$root" && run_with_timer "ECC plugin (retry)" npx -y tsc --project .opencode/tsconfig.json); then
      ok "ECC plugin tsc passed (retry)"
    else
      warn "ECC plugin compile failed — OLYMPUS will still launch but hooks may not fire."
      had_failure=1
    fi
  fi

  log "OLYMPUS overlay + Symphony..."
  if (cd "$root" && run_with_timer "Overlay + Symphony" npx --no-install tsc --project .opencode/olympus/tsconfig.json); then
    ok "Overlay tsc passed"
  else
    if (cd "$root" && run_with_timer "Overlay + Symphony (retry)" npx -y tsc --project .opencode/olympus/tsconfig.json); then
      ok "Overlay tsc passed (retry)"
    else
      warn "OLYMPUS overlay compile failed — Symphony may not work."
      had_failure=1
    fi
  fi

  local post_compile="$root/scripts/olympus-overlay-postcompile.js"
  if [ -f "$post_compile" ]; then
    if node "$post_compile" 2>&1; then :; else
      warn "Overlay post-compile flattener reported an issue."
    fi
  fi

  local router_src="$root/.opencode/plugins/olympus-router/index.ts"
  if [ -f "$router_src" ]; then
    if grep -q 'from ".*\.ts"' "$router_src" 2>/dev/null; then
      warn "olympus-router source has .ts extension imports — will fail at runtime."
      had_failure=1
    else
      ok "olympus-router imports clean (no .ts extensions)"
    fi
  fi

  return $had_failure
}

compile_electron() {
  local root="$1"
  if [ -f "$root/package.json" ] && grep -q '"electron:compile"' "$root/package.json"; then
    log "Electron main process..."
    if (cd "$root" && run_with_timer "Electron compile" npm run electron:compile); then
      ok "Electron compiled"
    else
      warn "Electron compile failed — 'olympus dev' may not work."
      return 1
    fi
  else
    warn "No 'electron:compile' script in package.json — skipping."
  fi
  return 0
}

run_doctor() {
  local root="$1"
  if [ -f "$root/scripts/olympus-doctor.js" ]; then
    log "Running health check..."
    (cd "$root" && run_with_timer "Health check" node scripts/olympus-doctor.js) || warn "Some doctor checks failed — see output above."
  fi
}

# ─── Create ~/.olympus/ ──────────────────────────────────────────────────────
create_olympus_home() {
  local home_dir
  home_dir="$(olympus_home_dir)"

  if [ -d "$home_dir" ]; then
    ok "Using existing: $home_dir"
  else
    mkdir -p "$home_dir"
    ok "Created: $home_dir"
  fi

  local providers_file="$home_dir/llm-providers.json"
  if [ -f "$providers_file" ]; then
    ok "Using existing: $providers_file"
  else
    cat > "$providers_file" << 'EOF'
{
  "default": "opencode-go",
  "strategy": "go-balanced",
  "per_god_overrides": {}
}
EOF
    ok "Written: $providers_file (strategy=go-balanced)"
  fi

  info "API keys: managed via OpenCode (Settings → Providers), not the installer."
}

# ─── Create ~/OLYMPUS-VAULT/ ─────────────────────────────────────────────────
create_vault() {
  local root="$1"
  local seed_script="$root/scripts/seed-vault.py"
  local vault_root
  vault_root="$(vault_dir)"

  if [ -d "$vault_root" ]; then
    ok "Vault exists: $vault_root"
  else
    info "Vault not found — will create it."
  fi

  if [ ! -f "$seed_script" ]; then
    warn "seed-vault.py not found — skipping vault init."
    info "  Run manually: python3 scripts/seed-vault.py"
    return 1
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    warn "Python 3 not available — skipping vault init."
    info "  Install Python 3, then: python3 scripts/seed-vault.py"
    return 1
  fi

  log "Running seed-vault.py (idempotent)..."
  if (cd "$root" && python3 "$seed_script" 2>&1 | tail -5); then
    ok "Vault is complete at $vault_root"
  else
    warn "Vault seeding had issues — run: python3 \"$seed_script\""
  fi
}

# ─── Sub-agent instincts ─────────────────────────────────────────────────────
create_sub_agent_instincts() {
  local root="$1"
  local setup_script="$root/scripts/setup-sub-agent-instincts.js"

  if [ ! -f "$setup_script" ]; then
    warn "setup-sub-agent-instincts.js not found — skipping."
    return 1
  fi

  log "Creating sub-agent instinct dirs + seed instincts..."
  if (cd "$root" && node "$setup_script" 2>&1 | tail -6); then
    ok "Sub-agent instincts created (12 meta sub-agents)"
  else
    warn "Sub-agent instinct setup had issues."
    info "  Run manually: node scripts/setup-sub-agent-instincts.js"
  fi
}

# ─── Apply default LLM strategy ──────────────────────────────────────────────
apply_default_strategy() {
  local root="$1"
  local strategy_script="$root/scripts/apply-strategy.js"

  if [ ! -f "$strategy_script" ]; then
    warn "apply-strategy.js not found — skipping."
    return 1
  fi

  log "Applying default strategy (go-balanced)..."
  if (cd "$root" && node "$strategy_script" --strategy go-balanced 2>&1 | tail -3); then
    ok "Strategy: go-balanced"
  else
    warn "Strategy application had issues."
    info "  Run: node scripts/apply-strategy.js --strategy go-balanced"
  fi
}

# ─── Detect external editors ─────────────────────────────────────────────────
detect_editors() {
  local root="$1"
  local detect_script="$root/scripts/detect-editors.js"

  if [ ! -f "$detect_script" ]; then
    warn "detect-editors.js not found — skipping editor detection."
    info "  The Editor Bridge tab will detect editors on first launch."
    return 1
  fi

  log "Detecting installed external editors..."
  if (cd "$root" && node "$detect_script" 2>&1); then
    ok "Editor detection complete → ~/.olympus/editor-config.json"
  else
    warn "Editor detection had issues — will retry on first launch."
    info "  Run manually: node scripts/detect-editors.js"
  fi
}
