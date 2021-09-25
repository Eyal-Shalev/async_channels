export LICENSE_BANNER := $(file < LICENSE_BANNER)

check-npm:
	npm --version

check-node:
	node --version

check-deno:
	deno --version

check-esbuild:
	esbuild --version

check-rollup:
	rollup --version
	npm list -g typescript || npm list typescript
	npm list -g rollup-plugin-dts || npm list rollup-plugin-dts

all: clean build build-min build-types

fmt: check-deno
	deno fmt --ignore="dist,package.json"

fmt-check: check-deno
	deno fmt --check --ignore="dist,package.json"

lint: check-deno
	deno lint --ignore="dist,package.json"

test: check-deno
	deno test --lock "scripts/tests-lock.json" --import-map scripts/import_map.json --doc .

package-json: check-deno
	deno run --lock scripts/package-json-lock.json --import-map scripts/import_map.json --allow-env="SCOPE,VERSION" --allow-write="./package.json" scripts/package-json.ts

build-types: emit-types bundle-types

emit-types: check-deno
	deno run --lock=scripts/emit-types-lock.json --import-map scripts/import_map.json --allow-write=dist --allow-read="." --unstable scripts/emit-types.ts

bundle-types: check-rollup
	rollup dist/types/mod.d.ts --file "dist/async_channels.d.ts" --plugin dts

build: build-esm build-cjs build-iife

build-esm: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.esm.mjs --format="esm" mod.ts
	
build-cjs: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.cjs.js --format=cjs mod.ts
	
build-iife: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.iife.js --format=iife --global-name=async_channels mod.ts

build-min: build-esm-min build-cjs-min build-iife-min

build-esm-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.esm.min.mjs --format="esm" mod.ts
	
build-cjs-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.cjs.min.js --format=cjs mod.ts
	
build-iife-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.iife.min.js --format=iife --global-name=async_channels mod.ts

post-build-test: check-node check-npm
	node -e 'import("./dist/async_channels.esm.mjs").catch(e=>console.error(e)).then(ac => console.log(ac))'
	node -e 'console.log(require("./dist/async_channels.cjs.js"))'
	npm publish --dry-run

install: install-esbuild install-rollup

install-rollup: check-npm
	npm i -g rollup rollup-plugin-dts typescript

install-esbuild: check-npm
	npm i -g esbuild

clean:
	rm -rf dist

clearscr:
	clear
