export LICENSE_BANNER := $(file < LICENSE_BANNER)

check-npm:
	npm --version

check-node:
	node --version

check-deno:
	deno --version

check-esbuild:
	esbuild --version

check-nvm:
	. ${NVM_DIR}/nvm.sh && nvm --version

check-genhtml:
	genhtml -v

all: clean build

fmt: check-deno
	deno fmt src

fmt-check: check-deno
	deno fmt --check src

lint: check-deno
	deno lint src

test: check-deno
	deno test --quiet --shuffle --unstable --reload=file://./src --lock=scripts/test-lock.json --import-map scripts/import_map.json --doc src --coverage=coverage/data

test-watch:check-deno
	deno test --quiet --shuffle --unstable --reload=file://./src --lock=scripts/test-lock.json --import-map scripts/import_map.json --doc src --watch

coverage: test
	deno coverage --unstable --exclude="test(_utils)?\.(js|mjs|ts|jsx|tsx)$$" coverage/data --lcov > coverage/profile.lcov

coverage-html: coverage check-genhtml
	genhtml -o coverage/html coverage/profile.lcov

coverage-serve: coverage-html check-deno
	deno run --allow-net="0.0.0.0:4507" --allow-read="." https://deno.land/std/http/file_server.ts coverage/html

benchmark-write: check-deno
	deno bench --unstable --no-check --quiet --import-map scripts/import_map.json > benchmark.out

benchmark: benchmark-write
	cat benchmark.out

benchmark-txt: benchmark-write
	cat benchmark.out | ansi2txt > benchmark.txt

benchmark-html: benchmark-write
	cat benchmark.out | ansi2html > benchmark.html

build: build-npm build-iife build-iife-min

build-npm: check-deno
	deno run --import-map scripts/import_map.json --lock scripts/build-npm-lock.json -A scripts/build-npm.ts

build-iife: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.iife.js --format=iife --global-name=async_channels src/mod.ts

build-iife-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.iife.min.js --format=iife --global-name=async_channels src/mod.ts

install-nvm:
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

install-node: check-nvm
	. ${NVM_DIR}/nvm.sh && nvm install --lts

install: install-esbuild

install-esbuild: check-npm
	npm i -g esbuild

clean:
	rm -rf dist coverage benchmark.*

clear:
	clear
