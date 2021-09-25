import { grantOrThrow } from "deno/permissions/mod.ts";
import { basename, dirname, fromFileUrl, join } from "deno/path/mod.ts";
import { valid } from "semver";

await grantOrThrow(
  { name: "env", variable: "VERSION" },
  { name: "env", variable: "SCOPE" },
);

const version = Deno.env.get("VERSION");
if (!version) {
  throw new TypeError(`VERSION environment variable is missing`);
}
if (!valid(version)) {
  throw new TypeError(`${version} isn't a valid semver version`);
}

const scope = Deno.env.get("SCOPE");
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
  main: `dist/${name}.cjs.js`,
  module: `dist/${name}.esm.js`,
  types: `dist/${name}.d.ts`,
  type: "module",
  repository: {
    type: "git",
    url: `github:Eyal-Shalev/${name}`,
  },
  engines: {
    node: ">=14",
  },
  exports: {
    ".": {
      require: `./dist/${name}.cjs.js`,
      import: `./dist/${name}.esm.js`,
    },
  },
};

await Deno.writeTextFile(
  join(rootDir, "package.json"),
  JSON.stringify(data, null, "\t"),
  { create: true },
);
