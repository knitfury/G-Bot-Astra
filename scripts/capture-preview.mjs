import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "-p",
    "3101",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
server.stderr.on("data", (d) => process.stderr.write(d));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3101")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error(
      "Preview server did not become ready. Run npm run build first.",
    );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.GBOT_BROWSER_EXECUTABLE
      ? {
          executablePath: process.env.GBOT_BROWSER_EXECUTABLE,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const output = "docs/screenshots";
  fs.mkdirSync(output, { recursive: true });
  await page.goto("http://127.0.0.1:3101");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await page.locator(".left .record-detail").waitFor();
  await page.locator(".right .record-detail").waitFor();
  await page.screenshot({ path: output + "/workspace.png" });
  await page
    .getByRole("textbox", { name: "Message G-Bot" })
    .fill("Find Maya's latest email, check stock and send a response.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Approve & send" }).waitFor();
  await page.screenshot({ path: output + "/approval.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("heading", { name: "What can we get done?" }).waitFor();
  await page.waitForFunction(
    () => document.querySelector(".message-scroll")?.scrollTop === 0,
  );
  await page.screenshot({ path: output + "/mobile.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Saved three reviewed UI screenshots. No browser runtime errors.",
  );
} finally {
  await browser?.close();
  server.kill();
}
