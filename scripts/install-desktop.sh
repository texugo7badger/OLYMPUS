#!/usr/bin/env bash
# install-desktop.sh — v0.0.62: one command to make OLYMPUS open like an app.
#
# It writes a launcher that runs the CLI (which adds --no-sandbox on Linux),
# a .desktop entry with the themed icon, and refreshes the applications
# database. No root, no AppImage, no build required.
set -euo pipefail
ROOT="${OLYMPUS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
mkdir -p "$BIN" "$APPS" "$HOME/.olympus"
cat > "$BIN/olympus-desktop" <<LAUNCH
#!/usr/bin/env bash
set -e
export OLYMPUS_WINDOWED=1
cd "$ROOT"
exec node "$ROOT/bin/olympus.js" dev >> "\$HOME/.olympus/desktop-launch.log" 2>&1
LAUNCH
chmod +x "$BIN/olympus-desktop"
ln -sf "$ROOT/bin/olympus.js" "$BIN/olympus" 2>/dev/null || true
ICON="$HOME/.olympus/theme-icon.png"
[ -f "$ICON" ] || ICON="$ROOT/public/logo.png"
cat > "$APPS/olympus.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=OLYMPUS
Comment=Ten gods, one living machine
Exec=$BIN/olympus-desktop
Path=$ROOT
StartupWMClass=olympus
Icon=$ICON
Terminal=false
Categories=Development;Utility;
StartupNotify=true
DESKTOP
update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "OLYMPUS desktop entry installed: $APPS/olympus.desktop"
echo "Launcher: $BIN/olympus-desktop (log: ~/.olympus/desktop-launch.log)"
