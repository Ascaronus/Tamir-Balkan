import { readFile } from "node:fs/promises"
import ts from "typescript"

// Test-only loader: Node 20 cannot load TypeScript source directly.
// Production code continues to be compiled by Next.js and Medusa.
export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) {
    return nextLoad(url, context)
  }
  const source = await readFile(new URL(url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      sourceMap: false,
    },
    fileName: new URL(url).pathname,
  })
  return { format: "module", source: outputText, shortCircuit: true }
}

export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context) }
  catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error
    // Next.js ships extensionless subpaths such as next/headers that only resolve
    // through require or the Next bundler; these tests import the sources as ESM.
    if (!/\.[a-z]+$/i.test(specifier)) {
      for (const suffix of [".ts", ".js"]) {
        try { return await nextResolve(specifier + suffix, context) } catch { /* try the next suffix */ }
      }
    }
    throw error
  }
}
