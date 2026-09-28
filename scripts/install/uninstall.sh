#!/usr/bin/env bash
#
# OLYMPUS v0.0.1 Uninstaller — Linux
#
# Three modes:
#   1) Quick    — remove build artifacts only (keep source + deps + vault + .olympus)
#   2) Full     — remove node_modules + build artifacts (keep source + vault + .olympus + .env)
#   3) Complete — remove EVERYTHING except source + vault (also removes .env + .olympus)
#
# License: AGPL-3.0-or-later (OLYMPUS original code)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
. "$SCRIPT_DIR/common.sh"

print_banner "OLYMPUS v0.0.1 Uninstaller"

OLYMPUS_SRC="$(detect_olympus_root)" || die "This uninstaller must be run from the OLYMPUS repository."
log "Running from OLYMPUS source: $OLYMPUS_SRC"

VAULT="$(vault_dir)"
OLYMPUS_HOME="$(olympus_home_dir)"

declare -a TARGETS_QUICK=(
  "$OLYMPUS_SRC/.opencode/dist"
  "$OLYMPUS_SRC/.opencode/olympus/dist"
  "$OLYMPUS_SRC/dist-electron-tsc"
  "$OLYMPUS_SRC/.next"
)

declare -a TARGETS_FULL=(
  "$OLYMPUS_SRC/node_modules"
  "$OLYMPUS_SRC/.opencode/node_modules"
  "$OLYMPUS_SRC/package-lock.json"
  "$OLYMPUS_SRC/bun.lock"
)

declare -a TARGETS_COMPLETE=(
  "$OLYMPUS_SRC/.env"
)

echo ''
echo -e "${BOLD}This will remove (depending on mode):${RESET}"
echo ''

echo -e "  ${BOLD}Quick uninstall${RESET} ${DIM}(build artifacts only)${RESET}"
for t in "${TARGETS_QUICK[@]}"; do
  if [ -e "$t" ]; then
    size=$(dir_size_mb "$t")
    echo -e "    ${GRAY}—${RESET} ${t#$OLYMPUS_SRC/}  ${DIM}(${size} MB)${RESET}"
  fi
done

echo ''
echo -e "  ${BOLD}Full uninstall${RESET} ${DIM}(Quick + node_modules + lockfiles)${RESET}"
for t in "${TARGETS_FULL[@]}"; do
  if [ -e "$t" ]; then
    size=$(dir_size_mb "$t")
    echo -e "    ${GRAY}—${RESET} ${t#$OLYMPUS_SRC/}  ${DIM}(${size} MB)${RESET}"
  fi
done

echo ''
echo -e "  ${BOLD}Complete uninstall${RESET} ${DIM}(Full + .env + ~/.olympus)${RESET}"
for t in "${TARGETS_COMPLETE[@]}"; do
  if [ -e "$t" ]; then echo -e "    ${GRAY}—${RESET} ${t#$OLYMPUS_SRC/}"; fi
done
echo -e "    ${GRAY}—${RESET} $OLYMPUS_HOME  ${DIM}(OLYMPUS home config)${RESET}"

echo ''
echo -e "${GREEN}This will${RESET} ${BOLD}NOT${RESET} ${GREEN}remove (preserved in ALL modes):${RESET}"
echo -e "  ${GRAY}—${RESET} Your vault at ${GREEN}$VAULT${RESET}  ${DIM}(preserved — contains your brain)${RESET}"
echo -e "  ${GRAY}—${RESET} Your OpenCode credentials ${DIM}(~/.config/opencode/)${RESET}"
echo -e "  ${GRAY}—${RESET} Your git history"
echo -e "  ${GRAY}—${RESET} Your source code"
echo ''

echo -e "${BOLD}Options:${RESET}"
echo -e "  ${GOLD}1)${RESET} Quick uninstall    ${DIM}(build artifacts — keep source + deps + vault + .olympus)${RESET}"
echo -e "  ${GOLD}2)${RESET} Full uninstall     ${DIM}(Quick + node_modules — keep source + vault + .olympus + .env)${RESET}"
echo -e "  ${GOLD}3)${RESET} Complete uninstall ${DIM}(Full + .env + ~/.olympus — keep only source + vault)${RESET}"
echo -e "  ${GOLD}4)${RESET} Cancel"
echo ''
printf "  ${BOLD}Choice (1-4):${RESET} "
read -r choice

case "$choice" in
  1)
    TARGETS=("${TARGETS_QUICK[@]}")
    MODE="Quick"
    REMOVE_OLYMPUS_HOME=0
    ;;
  2)
    TARGETS=("${TARGETS_QUICK[@]}" "${TARGETS_FULL[@]}")
    MODE="Full"
    REMOVE_OLYMPUS_HOME=0
    ;;
  3)
    TARGETS=("${TARGETS_QUICK[@]}" "${TARGETS_FULL[@]}" "${TARGETS_COMPLETE[@]}")
    MODE="Complete"
    REMOVE_OLYMPUS_HOME=1
    echo ''
    warn "You chose Complete uninstall — this will delete:"
    info "  — your .env file"
    info "  — your $OLYMPUS_HOME directory (config + launch script)"
    info "  Your vault at $VAULT is still preserved."
    if ! confirm "Are you absolutely sure?" "n"; then
      log "Cancelled."
      exit 0
    fi
    ;;
  4|"")
    log "Cancelled."
    exit 0
    ;;
  *)
    die "Invalid choice: $choice"
    ;;
esac

echo ''
step "OLYMPUS ${MODE} Uninstall"

removed_count=0
missing_count=0
for t in "${TARGETS[@]}"; do
  if [ -e "$t" ] || [ -L "$t" ]; then
    log "Removing ${t#$OLYMPUS_SRC/}..."
    rm -rf "$t"
    if [ ! -e "$t" ]; then
      ok "removed ${t#$OLYMPUS_SRC/}"
      removed_count=$((removed_count + 1))
    else
      warn "could not remove ${t#$OLYMPUS_SRC/} (may be locked)"
    fi
  else
    missing_count=$((missing_count + 1))
  fi
done

if [ "$REMOVE_OLYMPUS_HOME" -eq 1 ]; then
  if [ -d "$OLYMPUS_HOME" ]; then
    log "Removing $OLYMPUS_HOME..."
    rm -rf "$OLYMPUS_HOME"
    ok "removed $OLYMPUS_HOME"
    removed_count=$((removed_count + 1))
  fi
fi

echo ''
echo -e "${BOLD}${GOLD}  ┌──────────────────────────────────────────────────────────┐${RESET}"
echo -e "${BOLD}${GOLD}  │${RESET}  ${BOLD}Uninstall complete.${RESET}                                  ${BOLD}${GOLD}│${RESET}"
echo -e "${BOLD}${GOLD}  └──────────────────────────────────────────────────────────┘${RESET}"
echo ''

ok "OLYMPUS ${MODE} uninstall finished."
echo -e "  ${GRAY}Removed:        ${removed_count} item(s)${RESET}"
[ "$missing_count" -gt 0 ] && echo -e "  ${GRAY}Already absent: ${missing_count} item(s)${RESET}"
echo ''
echo -e "  ${GREEN}Your vault at $VAULT is preserved.${RESET}"
echo -e "  ${GREEN}Your source code at $OLYMPUS_SRC is preserved.${RESET}"
[ "$MODE" = "Complete" ] && warn "  Your .env + $OLYMPUS_HOME were deleted (Complete mode)."
echo ''
echo -e "  ${BOLD}To reinstall:${RESET}"
echo -e "    ${GREEN}bash scripts/install/install.sh${RESET}"
echo ''
