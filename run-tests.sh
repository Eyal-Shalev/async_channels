#!/usr/bin/env sh
deno test --lock test_lock.json --import-map import_map.json .
