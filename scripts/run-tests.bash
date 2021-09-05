#!/usr/bin/env bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.." && deno test --lock "$SCRIPT_DIR/test_lock.json" --import-map import_map.json .