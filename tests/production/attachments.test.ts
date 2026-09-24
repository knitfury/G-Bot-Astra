import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import ExcelJS from "exceljs";
import { Attachments } from "../../desktop/runtime/attachments";
let directory: string, files: Attachments;
before(async () => {
  // Keep the worker under the project so native module resolution matches production.
  directory = await mkdtemp(resolve(".attachment-test-"));
  const workerPath = join(directory, "extract-worker.cjs");
  await build({
    entryPoints: ["desktop/runtime/extract-worker.ts"],
    outfile: workerPath,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
  });
  files = new Attachments(workerPath);
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});
function zip(name: string, text: string) {
  const n = Buffer.from(name),
    data = Buffer.from(text);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50);
  h.writeUInt16LE(20, 4);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(data.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(n.length, 26);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(data.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(c.length + n.length, 12);
  end.writeUInt32LE(h.length + n.length + data.length, 16);
  return Buffer.concat([h, n, data, c, n, end]);
}
function pdf() {
  const stream = "BT /F1 12 Tf 20 100 Td (Invoice 456) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}
test("production worker extracts PDF, DOCX, XLSX and UTF-8 text formats", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Stock").addRow(["SKU", 123]);
  const samples: [string, Uint8Array, string][] = [
    ["invoice.pdf", pdf(), "Invoice 456"],
    [
      "letter.docx",
      zip(
        "word/document.xml",
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Customer letter</w:t></w:r></w:p></w:body></w:document>',
      ),
      "Customer letter",
    ],
    ["stock.xlsx", new Uint8Array(await workbook.xlsx.writeBuffer()), "123"],
    ...["txt", "md", "csv"].map(
      (ext) =>
        [
          `notes.${ext}`,
          Buffer.from("Customer,quantity\nExample,42"),
          "Example,42",
        ] as [string, Uint8Array, string],
    ),
  ];
  for (const [name, bytes, expected] of samples) {
    const item = await files.ingestFile(name, "", bytes);
    assert.equal(item.status, "ready");
    assert.ok((await files.context([item])).text.includes(expected), name);
  }
});
test("attachment limits, corruption, excerpt notices and cache removal fail safely", async () => {
  await assert.rejects(
    files.ingestFile("big.txt", "", new Uint8Array(50 * 1024 * 1024 + 1)),
    /50 MB/,
  );
  for (const ext of ["pdf", "docx", "xlsx"])
    await assert.rejects(
      files.ingestFile(`broken.${ext}`, "", Buffer.from("not a document")),
      /extract/i,
    );
  await assert.rejects(
    files.ingestFile("invalid.txt", "", new Uint8Array([255, 254])),
    /extract/i,
  );
  const long = await files.ingestFile(
    "long.md",
    "",
    Buffer.from("a".repeat(200000)),
  );
  assert.match((await files.context([long])).text, /Context excerpt/);
  files.remove(long.id);
  await assert.rejects(files.context([long]), /Reattach/);
  assert.equal(
    (await files.ingestFile("macro.exe", "", Buffer.from("x"))).status,
    "unsupported",
  );
  for (const [name, bytes, mime] of [
    ["a.png", [137, 80, 78, 71], "image/png"],
    ["b.jpg", [255, 216, 255], "image/jpeg"],
    ["c.webp", Array.from(Buffer.from("RIFF0000WEBP")), "image/webp"],
  ] as const) {
    const item = await files.ingestFile(name, "", new Uint8Array(bytes));
    assert.equal((await files.context([item])).images[0].mime, mime);
  }
  await assert.rejects(
    files.ingestFile("fake.png", "", Buffer.from("fake")),
    /Image content/,
  );
  files.clear();
});
