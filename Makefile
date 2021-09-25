export LICENSE_BANNER := $(file < LICENSE_BANNER)

check-npm:
	npm --version

check-deno:
	deno --version

check-esbuild:
	esbuild --version

all: clean build build-min

fmt: check-deno
	deno fmt --ignore=dist,package.json

fmt-check: check-deno
	deno fmt --check --ignore=dist,package.json

lint: check-deno
	deno lint --ignore=dist,package.json

test: check-deno
	deno test --lock "scripts/tests-lock.json" --import-map "./import_map.json" --doc .

package-json: check-deno
	deno run --lock scripts/package-json-lock.json --import-map import_map.json --allow-env="SCOPE,VERSION" --allow-write="./package.json" scripts/package-json.ts

build: build-esm build-cjs build-iife

build-esm: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.esm.js mod.ts
	
build-cjs: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.cjs.js mod.ts --format=cjs
	
build-iife: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.iife.js mod.ts --format=iife --global-name=async_channels

build-min: build-esm-min build-cjs-min build-iife-min

build-esm-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.esm.min.js mod.ts
	
build-cjs-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.cjs.min.js mod.ts --format=cjs
	
build-iife-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.iife.min.js mod.ts --format=iife --global-name=async_channels

install: install-esbuild

install-esbuild: check-npm
	npm i -g esbuild

clean:
	rm -f dist/*.js dist/*.d.ts

clearscr:
	clear
