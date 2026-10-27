#!/bin/zsh
set -e
TASK_ROOT='/Users/cd2015-cebios/Documents/agent-overlay'
exec /usr/bin/open -n -a "${TASK_ROOT}/desktop/node_modules/electron/dist/Electron.app" --args "${TASK_ROOT}/desktop"
