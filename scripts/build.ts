console.time("build"); // Start timer before imports

import * as flags from "deno/flags/mod.ts";
import * as path from "deno/path/mod.ts";
import * as fs from "deno/fs/mod.ts";

const { debug: debugEnabled, time: _timeEnabled } = flags.parse(Deno.args, {
  boolean: ["debug", "time"],
});
function debug(...args: unknown[]) {
  if (!debugEnabled) return;
  console.debug(...args);
}

const mainPath = path.resolve(
  path.join(path.fromFileUrl(import.meta.url), "../.."),
);
const distPath = path.join(mainPath, "dist");
const distESMPath = path.join(distPath, "esm");
const importMapPath = path.join(mainPath, "import_map.json");

Deno.permissions.request({ name: "write", path: distPath })
  .then(({ state }) => state)
  .then((state) => state === "granted" || Promise.reject());
Deno.permissions.request({ name: "read", path: mainPath })
  .then(({ state }) => state)
  .then((state) => state === "granted" || Promise.reject());

const glob = fs.expandGlob("**/*.ts", {
  root: mainPath,
  globstar: true,
  exclude: [
    "**/*_test.ts",
    "dist",
    "examples",
    "scripts",
    "internal/test_utils.ts",
  ],
});

const origModuleNames: string[] = [];
const sources: Record<string, string> = {};

for await (const file of glob) {
  const filePath = path.resolve(file.path);
  const relPath = path.relative(mainPath, filePath);
  const relJSPath = relPath.replace(/\.ts$/, "");

  let tail;
  for (const cur of relJSPath.split("/").reverse()) {
    tail = tail ? `${cur}/${tail}` : cur;
    origModuleNames.push(tail);
  }

  const absolutePath = path.join(distESMPath, relPath);
  sources[absolutePath] = await Deno.readTextFile(filePath);
}

const moduleNames = [...origModuleNames.map((x) => `./${x}`)];
moduleNames.push(...origModuleNames.map((x) => `../${x}`));
moduleNames.push(...origModuleNames.map((x) => `../../${x}`));

debug({ sources, moduleNames });

const { diagnostics, files: origFiles } = await Deno.emit(
  path.join(distESMPath, "mod.ts"),
  {
    compilerOptions: {
      declaration: true,
      removeComments: true,
      sourceMap: true,
    },
    sources,
    importMapPath,
  },
);

console.assert(diagnostics.length === 0, "Build failed", { diagnostics });

/**
 * Replaces absolute file URLs with relative paths.
 */
function replaceUrls(contents: string): string {
  moduleNames.forEach((moduleName) => {
    contents = contents.replaceAll(
      path.toFileUrl(path.join(distESMPath, moduleName)).toString(),
      `${moduleName}`,
    );
  });
  return contents;
}

function fixDeclarationFile(contents: string): string {
  moduleNames.forEach((moduleName) => {
    contents = contents.replaceAll(
      `name="${moduleName}.ts"`,
      `name="${moduleName}"`,
    );
    contents = contents.replaceAll(
      `from "${moduleName}.ts"`,
      `from "${moduleName}.d.ts"`,
    );
  });
  return contents;
}

function fixJavaScriptFile(contents: string): string {
  moduleNames.forEach((moduleName) => {
    contents = contents.replaceAll(
      `from "${moduleName}.ts"`,
      `from "${moduleName}.js"`,
    );
  });
  return contents;
}
function fixMappingFile(contents: string): string {
  moduleNames.forEach((moduleName) => {
    contents = contents.replaceAll(
      `"${moduleName}.ts"`,
      `"${moduleName}.js"`,
    );
  });
  return contents;
}

const files = Object.fromEntries(
  Object.entries(origFiles).map(([origFileUrl, origContents]) => {
    const origFilePath = path.fromFileUrl(origFileUrl);
    const origRelPath = path.relative(distESMPath, origFilePath);
    const moduleName = origRelPath
      .replace(/\.map$/, "")
      .replace(/\.ts\.js$/, "")
      .replace(/\.ts\.d\.ts$/, "");
    let relPath: string;
    let contents = replaceUrls(origContents);

    switch (true) {
      case origRelPath.endsWith(".js.map"):
        relPath = `${moduleName}.js.map`;
        contents = fixMappingFile(contents);
        break;

      case origRelPath.endsWith(".d.ts"):
        relPath = `${moduleName}.d.ts`;
        contents = fixDeclarationFile(contents);
        break;

      case origRelPath.endsWith(".js"):
        relPath = `${moduleName}.js`;
        contents = fixJavaScriptFile(contents);
        break;

      default:
        throw new Error(`Invalid file url, got: ${origFileUrl}`);
    }

    return [relPath, contents];
  }),
);

debug({ files });

try {
  await Deno.remove(distESMPath, { recursive: true });
} catch {
  // Do nothing;
}

Object.entries(files).map(async ([relPath, contents]) => {
  const filePath = path.join(distESMPath, relPath);
  await Deno.mkdir(path.dirname(filePath), { recursive: true });
  try {
    return await Deno.writeTextFile(filePath, contents, { create: true });
  } catch (error) {
    console.assert(false, error, { filePath, contents });
  }
});
