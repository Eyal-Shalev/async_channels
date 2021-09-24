#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR/.." && deno run --unstable --lock "$DIR/build-lock.json" --import-map "./import_map.json" --allow-write="./dist" --allow-read="." "$DIR/build.ts" "$@"
