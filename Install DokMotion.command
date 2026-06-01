#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  DokMotion – Mac Installer
#  Double-click this file to install the DokMotion panel for After Effects.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PLUGIN_ID="dk.tv2dok.dokmotion"
INSTALL_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/$PLUGIN_ID"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║        DokMotion  Installer          ║${RESET}"
echo -e "${BOLD}${CYAN}║        TV2 Documentary Tools         ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}"
echo ""

# ── Check After Effects is closed ─────────────────────────────────────────────
if pgrep -xq "After Effects" 2>/dev/null; then
  echo -e "${YELLOW}⚠  After Effects er åben.${RESET}"
  echo "   Luk After Effects før installation og tryk [Return] for at fortsætte,"
  echo "   eller tryk [Ctrl+C] for at annullere."
  read -r
  if pgrep -xq "After Effects" 2>/dev/null; then
    echo -e "${RED}✗  After Effects er stadig åben. Afslut og kør installeren igen.${RESET}"
    echo ""; read -rp "Tryk [Return] for at lukke..." _
    exit 1
  fi
fi

# ── Locate plugin source folder ───────────────────────────────────────────────
# The .command file lives inside the DokMotion folder — that folder IS the plugin.
SRC_DIR="$SCRIPT_DIR"

if [[ ! -f "$SRC_DIR/CSXS/manifest.xml" ]]; then
  echo -e "${RED}✗  Kan ikke finde plugin-filerne ved siden af denne installer.${RESET}"
  echo "   Sørg for at 'Install DokMotion.command' ligger i DokMotion-mappen."
  echo ""; read -rp "Tryk [Return] for at lukke..." _
  exit 1
fi

# Read version from version.json if jq available, else grep
VERSION="ukendt"
if [[ -f "$SRC_DIR/version.json" ]]; then
  if command -v python3 &>/dev/null; then
    VERSION=$(python3 -c "import json,sys; d=json.load(open('$SRC_DIR/version.json')); print(d.get('version','?'))" 2>/dev/null || echo "ukendt")
  fi
fi

echo -e "  Installerer ${BOLD}DokMotion v${VERSION}${RESET}..."
echo -e "  Destination: ${CYAN}$INSTALL_DIR${RESET}"
echo ""

# ── Create CEP extensions directory if needed ─────────────────────────────────
mkdir -p "$HOME/Library/Application Support/Adobe/CEP/extensions"

# ── Back up existing installation ─────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  BACKUP="${INSTALL_DIR}.backup_$(date +%Y%m%d_%H%M%S)"
  echo -e "  ${YELLOW}▸ Eksisterende installation fundet — laver backup...${RESET}"
  mv "$INSTALL_DIR" "$BACKUP"
  echo -e "    Backup gemt: $(basename "$BACKUP")"
fi

# ── Copy plugin files ─────────────────────────────────────────────────────────
echo -e "  ${CYAN}▸ Kopierer filer...${RESET}"
cp -R "$SRC_DIR" "$INSTALL_DIR"

# Remove the installer script itself from the installed copy (not needed there)
rm -f "$INSTALL_DIR/Install DokMotion.command"

# ── Enable unsigned CEP extensions (required for non-signed plugins) ──────────
echo -e "  ${CYAN}▸ Aktiverer CEP debug-tilstand (nødvendig for ikke-signerede plugins)...${RESET}"
defaults write com.adobe.CSXS.11 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.10 PlayerDebugMode 1 2>/dev/null || true
defaults write com.adobe.CSXS.9  PlayerDebugMode 1 2>/dev/null || true

# ── Verify ────────────────────────────────────────────────────────────────────
if [[ -f "$INSTALL_DIR/CSXS/manifest.xml" ]]; then
  echo ""
  echo -e "${GREEN}${BOLD}✓  DokMotion v${VERSION} er installeret!${RESET}"
  echo ""
  echo "  Næste skridt:"
  echo "  1. Åbn After Effects"
  echo "  2. Gå til  Vindue → Extensions → DokMotion"
  echo ""
else
  echo -e "${RED}✗  Noget gik galt — manifest.xml ikke fundet efter kopiering.${RESET}"
  echo ""; read -rp "Tryk [Return] for at lukke..." _
  exit 1
fi

read -rp "  Tryk [Return] for at lukke..." _
