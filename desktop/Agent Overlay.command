#!/bin/zsh
set -e
DESKTOP="${0:A:h}"
exec /usr/bin/open -n -a "${DESKTOP}/node_modules/electron/dist/Electron.app" --args "${DESKTOP}"
