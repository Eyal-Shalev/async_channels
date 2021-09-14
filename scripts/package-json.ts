import { basename, dirname, fromFileUrl, join } from "deno/path/mod.ts";
import { valid } from "semver";

const version = Deno.env.get("VERSION") || null;
if (!valid(version)) {
  throw new TypeError(`${version} isn't a valid semver version`);
}

const scope = Deno.env.get("SCOPE") || "";
if (!scope) {
  throw new TypeError(`SCOPE environment variable is missing`);
}

const rootDir = dirname(join(fromFileUrl(import.meta.url), ".."));

const name = basename(rootDir);

const data = {
  name: `@${scope.toLowerCase()}/${name.toLowerCase()}`,
  version,
  description:
    "Inspired by Go & Clojure Channels, async_channels provides channels as an asynchronous communication method between asynchronous functions.",
  keywords: ["async", "channel", "channels", "await"],
  homepage: `https://github.com/Eyal-Shalev/${name}`,
  bugs: {
    url: `https://github.com/Eyal-Shalev/${name}/issues`,
  },
  license: "GPL-3.0-only",
  author: `Eyal Shalev <eyalsh@gmail.com> (https://github.com/Eyal-Shalev)`,
  main: "dist/cjs.bundle.js",
  module: "dist/esm/mod.js",
  types: "dist/esm/mod.d.ts",
  repository: {
    type: "git",
    url: `github:Eyal-Shalev/${name}`,
  },
  engines: {
    node: ">=14",
  },
  exports: {
    ".": {
      require: "./dist/cjs.bundle.js",
      import: "./dist/es.bundle.js",
    },
  },
};

await Deno.writeTextFile(
  join(rootDir, "package.json"),
  JSON.stringify(data, null, "\t"),
  { create: true },
);
