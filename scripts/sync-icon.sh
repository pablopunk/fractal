#!/usr/bin/env bash
set -euo pipefail

SRC="resources/icon.icon"
DST="build/icon.icon"

if [[ ! -d "$SRC" ]]; then
  echo "Error: missing $SRC" >&2
  exit 1
fi

rm -rf "$DST"
mkdir -p build
cp -R "$SRC" "$DST"

echo "✓ Synced $SRC -> $DST"
