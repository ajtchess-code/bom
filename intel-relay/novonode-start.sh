#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
npm ci --ignore-scripts
npm run build
exec npm start
