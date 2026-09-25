import { mkdir, writeFile } from "node:fs/promises";
const publicNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_GBOT_ENVIRONMENT",
  "GBOT_CONTROL_PLANE_URL",
  "GBOT_LICENSE_PUBLIC_KEYS",
  "GBOT_CATALOG_PUBLIC_KEYS",
  "GBOT_UPDATE_PUBLIC_KEYS",
  "GBOT_RELEASE_MANIFEST_URL",
  "GBOT_SENTRY_DSN",
];
await mkdir("desktop-dist", { recursive: true });
await writeFile(
  "desktop-dist/public-config.json",
  JSON.stringify(
    Object.fromEntries(
      publicNames
        .filter((name) => process.env[name])
        .map((name) => [name, process.env[name]]),
    ),
    null,
    2,
  ),
);
import { build } from "esbuild";
await build({
  entryPoints: ["desktop/main.ts"],
  outfile: "desktop-dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["desktop/preload.ts"],
  outfile: "desktop-dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
console.log("Desktop main and sandboxed preload compiled.");

await build({
  entryPoints: ["desktop/runtime/extract-worker.ts"],
  outfile: "desktop-dist/extract-worker.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
});
