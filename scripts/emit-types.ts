import * as path from "deno/path/mod.ts";
import * as fs from "deno/fs/mod.ts";
import { grantOrThrow } from "deno/permissions/mod.ts";

const mainPath = path.resolve(
  path.join(path.fromFileUrl(import.meta.url), "../.."),
);
const rootPath = path.join(mainPath, "src");
const distPath = path.join(mainPath, "dist");
const distTypesPath = path.join(distPath, "types");
const importMapPath = path.join(mainPath, "scripts/import_map.json");

grantOrThrow(
  { name: "write", path: distPath },
  { name: "read", path: rootPath },
);

const glob = fs.expandGlob("**/*.ts", {
  root: rootPath,
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
  const relPath = path.relative(rootPath, filePath);
  const relJSPath = relPath.replace(/\.ts$/, "");

  let tail;
  for (const cur of relJSPath.split("/").reverse()) {
    tail = tail ? `${cur}/${tail}` : cur;
    origModuleNames.push(tail);
  }

  const absolutePath = path.join(distTypesPath, relPath);
  sources[absolutePath] = await Deno.readTextFile(filePath);
}

const moduleNames = [...origModuleNames.map((x) => `./${x}`)];
moduleNames.push(...origModuleNames.map((x) => `../${x}`));
moduleNames.push(...origModuleNames.map((x) => `../../${x}`));

const { diagnostics, files: origFiles } = await Deno.emit(
  path.join(distTypesPath, "mod.ts"),
  {
    compilerOptions: {
      emitDeclarationOnly: true,
      declaration: true,
    },
    sources,
    importMapPath,
  },
);

console.assert(
  diagnostics.length === 0,
  "Build failed",
  JSON.stringify(diagnostics, null, "\t"),
);

/**
 * Replaces absolute file URLs with relative paths.
 */
function replaceUrls(contents: string): string {
  moduleNames.forEach((moduleName) => {
    contents = contents.replaceAll(
      path.toFileUrl(path.join(distTypesPath, moduleName)).toString(),
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

const files = Object.fromEntries(
  Object.entries(origFiles).map(([origFileUrl, origContents]) => {
    const origFilePath = path.fromFileUrl(origFileUrl);
    const origRelPath = path.relative(distTypesPath, origFilePath);

    const relPath = origRelPath.replace(/\.ts\.d\.ts$/, ".d.ts");
    const contents = fixDeclarationFile(replaceUrls(origContents));

    return [relPath, contents];
  }),
);

await Deno.remove(distTypesPath, { recursive: true }).catch(() => {});

Object.entries(files).map(async ([relPath, contents]) => {
  const filePath = path.join(distTypesPath, relPath);
  await Deno.mkdir(path.dirname(filePath), { recursive: true });
  try {
    return await Deno.writeTextFile(filePath, contents, { create: true });
  } catch (error) {
    console.error(error, { filePath, contents });
    Deno.exit(1);
  }
});
