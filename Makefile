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

check-genhtml:
	genhtml -v

all: clean build build-min build-types

fmt: check-deno
	deno fmt src

fmt-check: check-deno
	deno fmt --check src

lint: check-deno
	deno lint src

test: check-deno
	deno test --unstable --lock=scripts/test-lock.json --import-map scripts/import_map.json --doc src --coverage=coverage/data

test-watch:check-deno
	deno test --unstable --lock=scripts/test-lock.json --import-map scripts/import_map.json --doc src --watch

coverage: test
	deno coverage --unstable --exclude="test(_utils)?\.(js|mjs|ts|jsx|tsx)$$" coverage/data --lcov > coverage/profile.lcov

coverage-html: coverage check-genhtml
	genhtml -o coverage/html coverage/profile.lcov

coverage-serve: coverage-html check-deno
	deno run --allow-net="0.0.0.0:4507" --allow-read="." https://deno.land/std/http/file_server.ts coverage/html

benchmark: check-deno
	@for f in $(shell ls src/*_bench.ts); do deno run --lock=scripts/bench-lock.json --import-map scripts/import_map.json $${f}; done

package-json: check-deno
	deno run --lock scripts/package-json-lock.json --import-map scripts/import_map.json --allow-env="SCOPE,VERSION" --allow-write="./package.json" scripts/package-json.ts

build-types: emit-types bundle-types

emit-types: check-deno
	deno run --lock=scripts/emit-types-lock.json --import-map scripts/import_map.json --allow-write=dist --allow-read=src --unstable scripts/emit-types.ts

bundle-types: check-rollup
	rollup dist/types/mod.d.ts --file "dist/async_channels.d.ts" --plugin dts

build: build-esm build-cjs build-iife

build-esm: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.esm.js --format="esm" src/mod.ts
	
build-cjs: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.cjs.js --format=cjs src/mod.ts
	
build-iife: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --outfile=dist/async_channels.iife.js --format=iife --global-name=async_channels src/mod.ts

build-min: build-esm-min build-cjs-min build-iife-min

build-esm-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.esm.min.js --format="esm" src/mod.ts
	
build-cjs-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.cjs.min.js --format=cjs src/mod.ts
	
build-iife-min: check-esbuild
	esbuild --banner:js="$$LICENSE_BANNER" --bundle --minify --outfile=dist/async_channels.iife.min.js --format=iife --global-name=async_channels src/mod.ts

post-build-test: check-node check-npm
	node -e 'import("./dist/async_channels.esm.js").catch(e=>console.error(e)).then(ac => console.log(ac))'
	node -e 'console.log(require("./dist/async_channels.cjs.js"))'

install: install-esbuild install-rollup

install-rollup: check-npm
	npm i -g rollup rollup-plugin-dts typescript

install-esbuild: check-npm
	npm i -g esbuild

clean:
	rm -rf dist coverage

clearscr:
	clear
