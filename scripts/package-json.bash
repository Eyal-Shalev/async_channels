#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR/.." && deno run --lock-write --lock "$DIR/package-json-lock.json" --import-map "./import_map.json" --allow-env="SCOPE,VERSION" --allow-write="./package.json" "$DIR/package-json.ts"
