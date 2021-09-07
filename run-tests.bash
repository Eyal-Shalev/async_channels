#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR" && deno test --lock "$DIR/test_lock.json" --import-map "$DIR/import_map.json" --doc .
