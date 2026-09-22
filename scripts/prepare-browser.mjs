// Optional Linux fallback when the Playwright browser CDN is unavailable.
// Extract a Chromium build distributed through npm without changing file owners.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(os.tmpdir(), "gbot-browser");
fs.mkdirSync(output, { recursive: true });
const packageRoot = path.dirname(
  path.dirname(fileURLToPath(import.meta.resolve("@sparticuz/chromium"))),
);
for (const name of ["chromium", "fonts.tar", "swiftshader.tar"]) {
  const target = path.join(output, name);
  fs.writeFileSync(
    target,
    zlib.brotliDecompressSync(
      fs.readFileSync(path.join(packageRoot, "bin", name + ".br")),
    ),
  );
  if (name.endsWith(".tar"))
    execFileSync("tar", ["--no-same-owner", "-xf", target, "-C", output]);
}
fs.chmodSync(path.join(output, "chromium"), 0o755);
console.log("Chromium prepared. Run:");
console.log(
  `GBOT_BROWSER_EXECUTABLE=${path.join(output, "chromium")} npm run test:e2e`,
);
