#!/usr/bin/env bash
#
# OLYMPUS v0.0.1 Installer — Linux (other platforms: use WSL)
#
# 6-step flow with progress bars:
#   1. Check prerequisites (Node 18+, npm, Git, C/C++ compiler, OpenCode CLI)
#   2. Install npm dependencies (includes OpenCode CLI as local devDependency)
#   3. Build TypeScript (ECC plugin + OLYMPUS overlay + Symphony + Electron)
#   4. Create ~/.olympus/ + ~/OLYMPUS-VAULT/
#   5. Detect external editors (Zed, VSCode, VSCodium, Cursor)
#   6. OpenCode authorization instructions
#
# License: AGPL-3.0-or-later (OLYMPUS original code)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
. "$SCRIPT_DIR/common.sh"

print_banner "OLYMPUS v0.0.1 Installer"

info "Interactive installer — asks before destructive steps."
info "API keys are configured from OpenCode (not here)."
echo ''

OLYMPUS_SRC="$(detect_olympus_root)" || die "This installer must be run from the OLYMPUS repository.
Clone first: git clone https://github.com/texugo7badger/olympus.git && cd olympus && bash scripts/install/install.sh"

log "Running from OLYMPUS source: $OLYMPUS_SRC"
print_platform_summary

# ============================================================================
# Step 1/6: Prerequisites
# ============================================================================
step_progress "Checking prerequisites" 1 6

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is not installed. Install Node.js 18+ from https://nodejs.org/ (v22 LTS recommended)"
fi
NODE_VER=$(node --version)
NODE_MAJOR=$(node_major_version)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  die "Node.js $NODE_VER detected — needs 18+. Install from https://nodejs.org/"
fi
ok "Node.js $NODE_VER"
warn_node_24

PM="$(detect_pkg_manager)" || die "No package manager found (need npm, bun, pnpm, or yarn)."
ok "$PM $( $PM --version 2>/dev/null || echo '?')"

if command -v git >/dev/null 2>&1; then
  ok "git $(git --version 2>/dev/null | head -n1 | sed 's/git version //')"
else
  die "Git is not installed. Install from https://git-scm.com/"
fi

if command -v clang >/dev/null 2>&1; then
  ok "clang (native module compilation available)"
elif command -v gcc >/dev/null 2>&1; then
  ok "gcc (native module compilation available)"
else
  warn "No C/C++ compiler found (clang or gcc)."
  info "  node-pty will use N-API prebuilt binaries (less reliable)."
  info "  Install build-essential: sudo apt-get install build-essential"
fi

if find_opencode "$OLYMPUS_SRC"; then
  ok "OpenCode CLI detected ($OPENCODE_VERSION, $OPENCODE_SOURCE)"
else
  warn "OpenCode CLI not detected."
  info "  It will be installed automatically by 'npm install' (Step 2)."
fi

# ============================================================================
# Step 2/6: npm install
# ============================================================================
step_progress "Installing npm dependencies" 2 6

	info "  Running: $PM install  in  $OLYMPUS_SRC"
	if confirm "  Continue?" "y"; then
	  echo ""
	  info "Installing dependencies — this may take 2-5 minutes."
	  info "npm's progress spinner appears during the download phase."
	  echo ""
	  # Run npm directly in a subshell so output streams live.
	  # Force TTY-like behavior for npm's progress bar.
	  (cd "$OLYMPUS_SRC" && npm_config_progress=true npm_config_color=always "$PM" install --no-audit --no-fund)
	  _npm_exit=$?
	  if [ "$_npm_exit" -eq 0 ]; then
	    ok "Dependencies installed"
	    # Ensure Electron binary is downloaded (separate step)
	    _electron_pkg="$OLYMPUS_SRC/node_modules/electron/package.json"
	    _electron_bin="$OLYMPUS_SRC/node_modules/electron/dist/electron"
	    if [ -f "$_electron_pkg" ] && [ ! -f "$_electron_bin" ]; then
	      _install_script="$OLYMPUS_SRC/node_modules/electron/install.js"
	      if [ -f "$_install_script" ]; then
	        echo ""
	        info "Electron binary not found — downloading (~150 MB)..."
	        (cd "$OLYMPUS_SRC" && node "$_install_script")
	        if [ -f "$_electron_bin" ]; then
	          ok "Electron binary downloaded"
	        fi
	      fi
	    fi
	  else
	    warn "npm install exited with code $_npm_exit — see output above."
	  fi
  if [ -z "$OPENCODE_BIN" ]; then
    if find_opencode "$OLYMPUS_SRC"; then
      ok "OpenCode CLI now detected ($OPENCODE_VERSION, $OPENCODE_SOURCE)"
    fi
  fi
else
  warn "Skipping — 'olympus dev' will not work until dependencies are installed."
fi

# ============================================================================
# Step 3/6: Build TypeScript
# ============================================================================
step_progress "Building TypeScript" 3 6

info "  Compiling: ECC plugin + OLYMPUS overlay + Symphony + Electron main process"
if confirm "  Continue?" "y"; then
  compile_plugins "$OLYMPUS_SRC" || warn "Some plugins failed to compile (see above). OLYMPUS will still launch."
  compile_electron "$OLYMPUS_SRC"
else
  warn "Skipping TypeScript compilation — hooks + tools will not fire until built."
fi

# ============================================================================
# Step 4/6: Create OLYMPUS home + vault
# ============================================================================
step_progress "Creating OLYMPUS home + vault" 4 6

	create_olympus_home
	create_vault "$OLYMPUS_SRC"
	create_sub_agent_instincts "$OLYMPUS_SRC"
	apply_default_strategy "$OLYMPUS_SRC"

	# LLM API keys (GO plan + free-tier Groq/OpenRouter) are NOT configured
	# here -- they are authorized inside OpenCode via `olympus opencode`
	# (Step 6). OLYMPUS never injects or stores LLM keys itself.

info "Launch via: ${GREEN}npm run dev${RESET}"

# ============================================================================
# Step 5/6: Detect external editors
# ============================================================================
step_progress "Detecting external editors" 5 6

detect_editors "$OLYMPUS_SRC"

# ============================================================================
# Step 6/6: OpenCode authorization
# ============================================================================
step_progress "OpenCode authorization" 6 6

print_opencode_auth_instructions

# ============================================================================
# Done
# ============================================================================
echo ''
echo ''
echo -e "${BOLD}${GOLD}  ┌──────────────────────────────────────────────────────────┐${RESET}"
echo -e "${BOLD}${GOLD}  │${RESET}  ${BOLD}Installation complete!${RESET}                              ${BOLD}${GOLD}│${RESET}"
echo -e "${BOLD}${GOLD}  └──────────────────────────────────────────────────────────┘${RESET}"
echo ''

ok "OLYMPUS v0.0.1 is installed."

echo ''
echo -e "  ${BOLD}To launch:${RESET}"
echo -e "    ${GREEN}cd $OLYMPUS_SRC${RESET}"
echo -e "    ${GREEN}npm run dev${RESET}       ${DIM}# or: olympus dev${RESET}"
echo ''
echo -e "  ${BOLD}To verify:${RESET}"
echo -e "    ${GREEN}node scripts/olympus-doctor.js${RESET}"
echo ''
echo -e "  ${BOLD}To uninstall:${RESET}"
echo -e "    ${GREEN}bash scripts/install/uninstall.sh${RESET}"
echo ''

if confirm "  Run the health check now?" "y"; then
  run_doctor "$OLYMPUS_SRC"
fi

echo ''
log "Godspeed. The gods await."
