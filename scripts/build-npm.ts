import { build, emptyDir } from "dnt";
import { grantOrThrow } from "deno/permissions/mod.ts";
import {
  basename,
  dirname,
  fromFileUrl,
  join,
  relative,
} from "deno/path/mod.ts";
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

await emptyDir("./dist/npm");

await build({
  entryPoints: ["./src/mod.ts"],
  outDir: "./dist/npm",
  shims: {
    deno: "dev",
    timers: true,
  },
  package: {
    name: `@${scope.toLowerCase()}/${name.toLowerCase()}`,
    version,
    description:
      "Inspired by Go & Clojure Channels, async_channels provides channels as an asynchronous communication method between asynchronous functions.",
    keywords: ["async", "channel", "channels", "await"],
    homepage: `https://github.com/Eyal-Shalev/${name}`,
    bugs: {
      url: `https://github.com/Eyal-Shalev/${name}/issues`,
    },
    license: "GPL-3.0-or-later",
    author: `Eyal Shalev <eyalsh@gmail.com> (https://github.com/Eyal-Shalev)`,
    repository: {
      type: "git",
      url: `git+https://github.com/Eyal-Shalev/${name}.git`,
    },
  },
  importMap: relative(Deno.cwd(), join(rootDir, "scripts", "import_map.json")),
});

// post build steps
Deno.copyFileSync("LICENSE", "dist/npm/LICENSE");
Deno.copyFileSync("README.md", "dist/npm/README.md");
