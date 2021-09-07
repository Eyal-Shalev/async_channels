import { basename, dirname, fromFileUrl, join } from "deno/path/mod.ts";
import { valid } from "semver";

const rootDir = dirname(join(fromFileUrl(import.meta.url), ".."));
const name = basename(rootDir);

const packageJson = (version: string) => {
  if (!valid(version)) {
    throw new TypeError(`${version} isn't a valid semver version`);
  }

  const base = {
    name,
    description:
      "Inspired by Go & Clojure Channels, async-channels provides channels as an asynchronous communication method between asynchronous functions.",
    keywords: ["async", "channel", "channels", "await"],
    homepage: `https://github.com/Eyal-Shalev/${name}`,
    bugs: {
      url: `https://github.com/Eyal-Shalev/${name}/issues`,
    },
    license: "GPL-3.0-only",
    author: "Eyal Shalev <eyalsh@gmail.com> (https://github.com/Eyal-Shalev)",
    // files: [],
    main: "dist/cjs.bundle.js",
    module: "dist/es.bundle.js",
    repository: {
      type: "git",
      url: `github:Eyal-Shalev/${name}`,
    },
    engines: {
      node: ">=14",
    },
  };

  return JSON.stringify({ ...base, version }, null, "\t");
};

await Deno.writeTextFile(
  join(rootDir, "package.json"),
  packageJson("1.0.0"),
  { create: true },
);
