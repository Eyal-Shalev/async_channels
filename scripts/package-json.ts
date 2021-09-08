import { basename, dirname, fromFileUrl, join } from "deno/path/mod.ts";
import { valid } from "semver";

const version = Deno.env.get("VERSION") || null;
if (!valid(version)) {
  throw new TypeError(`${version} isn't a valid semver version`);
}

const rootDir = dirname(join(fromFileUrl(import.meta.url), ".."));

const name = basename(rootDir);
const userName = "Eyal-Shalev";
const repo = `${userName}/${name}`;

const data = {
  name: `@${repo.toLowerCase()}`,
  version,
  description:
    "Inspired by Go & Clojure Channels, async-channels provides channels as an asynchronous communication method between asynchronous functions.",
  keywords: ["async", "channel", "channels", "await"],
  homepage: `https://github.com/${repo}`,
  bugs: {
    url: `https://github.com/${repo}/issues`,
  },
  license: "GPL-3.0-only",
  author: `Eyal Shalev <eyalsh@gmail.com> (https://github.com/${userName})`,
  // files: [],
  main: "dist/cjs.bundle.js",
  module: "dist/es.bundle.js",
  repository: {
    type: "git",
    url: `github:${repo}`,
  },
  engines: {
    node: ">=14",
  },
};

await Deno.writeTextFile(
  join(rootDir, "package.json"),
  JSON.stringify(data, null, "\t"),
  { create: true },
);
