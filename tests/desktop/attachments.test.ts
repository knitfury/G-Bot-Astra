import test from "node:test";
import assert from "node:assert/strict";
import { Attachments } from "../../desktop/runtime/attachments";
import { Diagnostics } from "../../desktop/runtime/diagnostics";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("attachments validate encodings, images, size, unsupported formats and explicit URL context", async () => {
  const files = new Attachments();
  const text = files.ingest(
    "notes.txt",
    "text/plain",
    new TextEncoder().encode("business context"),
  );
  assert.match((await files.context([text])).text, /business context/);
  assert.throws(
    () => files.ingest("notes.txt", "text/plain", new Uint8Array([255, 255])),
    /UTF-8/,
  );
  assert.equal(
    files.ingest("report.pdf", "application/pdf", new Uint8Array([1])).status,
    "unsupported",
  );
  const png = files.ingest(
    "photo.png",
    "image/png",
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.equal((await files.context([png])).images[0].mime, "image/png");
  assert.throws(
    () =>
      files.ingest("large.png", "image/png", new Uint8Array(11 * 1024 * 1024)),
    /10 MB/,
  );
  assert.match(
    (await files.context([files.url("https://example.com/help")])).text,
    /not fetched/,
  );
  assert.throws(
    () => files.url("https://user:password@example.com"),
    /credentials/,
  );
  await assert.rejects(() => new Attachments().context([text]), /Reattach/);
});
test("structured diagnostics accept fixed codes, persist locally and exclude arbitrary payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gbot-diagnostics-"));
  await new Diagnostics(dir).record("ipc_failure", "PROVIDER_AUTH");
  const row = JSON.parse(
    await readFile(join(dir, "diagnostics.jsonl"), "utf8"),
  );
  assert.deepEqual(Object.keys(row).sort(), ["code", "event", "time"]);
  assert.equal(row.code, "PROVIDER_AUTH");
});
