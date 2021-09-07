#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR/.." && deno bundle --lock "$DIR/lock.json" --import-map "./import_map.json" "$DIR/../mod.ts" "$DIR/../dist/esm.bundle.js"
