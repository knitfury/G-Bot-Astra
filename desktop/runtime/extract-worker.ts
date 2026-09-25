import { parentPort, workerData } from "node:worker_threads";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
async function extract() {
  const { name, bytes } = workerData as { name: string; bytes: Uint8Array };
  const buffer = Buffer.from(bytes);
  let text = "";
  if (/\.pdf$/i.test(name)) {
    const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdf.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: false,
      disableFontFace: true,
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 2000) throw Error("Document has too many pages");
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i),
          content = await page.getTextContent();
        text +=
          content.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
        if (text.length > 2_000_000) throw Error("Extracted text too large");
        page.cleanup();
      }
    } finally {
      await task.destroy();
    }
  } else if (/\.docx$/i.test(name)) {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (/\.xlsx$/i.test(name)) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    for (const sheet of book.worksheets) {
      text += `\nSheet: ${sheet.name}\n`;
      sheet.eachRow((row) => {
        text +=
          row.values instanceof Array
            ? row.values
                .map((v) =>
                  typeof v === "object" && v !== null
                    ? "result" in v
                      ? String(v.result ?? "")
                      : "text" in v
                        ? String(v.text)
                        : ""
                    : String(v ?? ""),
                )
                .join("\t") + "\n"
            : "";
        if (text.length > 2_000_000) throw Error("Extracted text too large");
      });
    }
  } else {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  if (text.length > 2_000_000) throw Error("Extracted text too large");
  if (!text.trim())
    throw Error("No readable text. Scanned documents require a text layer.");
  return text;
}
void extract()
  .then((text) => parentPort?.postMessage({ ok: true, text }))
  .catch(() =>
    parentPort?.postMessage({
      ok: false,
      error:
        "Could not extract this document. It may be damaged, encrypted, scanned without text, or exceed safe parsing limits.",
    }),
  );
