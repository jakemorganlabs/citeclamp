// Purpose: let `node --experimental-strip-types` resolve local `.ts` modules imported with `.js` specifiers.
// Flow:
// 1. Node's type-stripping mode does not rewrite `.js` import specifiers to `.ts` files.
// 2. tsconfig uses NodeNext, so every relative import in src, scripts, and tests ends in `.js`.
// 3. This hook intercepts a relative `.js` specifier and returns the matching `.ts` file when it exists.
// 4. Anything else falls through to the default resolver.
// Usage: node --experimental-strip-types --import ./scripts/ts-register.mjs src/server.ts
// Requires Node >= 22.15 for module.registerHooks. The hook runs in-thread and synchronously.
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";

function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && specifier.endsWith(".js") && context.parentURL) {
    const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    try {
      if (statSync(fileURLToPath(candidate)).isFile()) {
        return { url: candidate.href, shortCircuit: true };
      }
    } catch {
      // no .ts source next to the specifier; fall through
    }
  }
  return nextResolve(specifier, context);
}

registerHooks({ resolve });
