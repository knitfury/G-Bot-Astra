import { randomUUID } from "node:crypto";
import type { Attachment } from "../../src/types/domain";
import { DomainError } from "./errors";
export class Attachments {
  private content = new Map<
    string,
    { text?: string; image?: { mime: string; data: string } }
  >();
  ingest(name: string, type: string, bytes: Uint8Array): Attachment {
    if (bytes.byteLength > 10 * 1024 * 1024)
      throw new DomainError("CAPABILITY", "Maximum file size is 10 MB.");
    if (this.content.size >= 20)
      this.content.delete(this.content.keys().next().value!);
    const a: Attachment = {
      id: randomUUID(),
      name: name.slice(0, 240),
      size: bytes.length,
      mime: type,
      kind: type.startsWith("image/") ? "image" : "file",
      status: "ready",
    };
    const png =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
    if (png || jpg || webp) {
      if (bytes.length > 4 * 1024 * 1024)
        throw new DomainError(
          "CAPABILITY",
          "Image limit is 4 MB. Resize this image first.",
        );
      a.kind = "image";
      a.mime = png ? "image/png" : jpg ? "image/jpeg" : "image/webp";
      const data = Buffer.from(bytes).toString("base64");
      this.content.set(a.id, { image: { mime: a.mime, data } });
      if (bytes.length < 500_000) a.preview = `data:${a.mime};base64,${data}`;
      return a;
    }
    if (!/\.(txt|csv|md)$/i.test(name)) {
      a.status = "unsupported";
      a.error =
        "Use text, CSV, Markdown, PNG, JPEG or WebP. PDF/DOCX extraction is not supported yet.";
      return a;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new DomainError(
        "CAPABILITY",
        "Save this text file as UTF-8 and attach it again.",
      );
    }
    if (text.length > 200_000)
      throw new DomainError(
        "CAPABILITY",
        "Text attachment exceeds 200,000 characters. Attach an excerpt.",
      );
    if (this.content.size >= 100)
      this.content.delete(this.content.keys().next().value!);
    this.content.set(a.id, { text });
    return a;
  }
  url(value: string): Attachment {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password)
      throw new DomainError(
        "INVALID_ARGUMENTS",
        "Use a public HTTPS link without embedded credentials.",
      );
    return {
      id: randomUUID(),
      kind: "URL",
      name: u.hostname,
      url: u.href,
      mime: "text/uri-list",
      size: 0,
      status: "ready",
    };
  }
  async context(list: Attachment[]) {
    if (list.length > 5)
      throw new DomainError("CAPABILITY", "Attach at most five files.");
    let text = "";
    const images: { mime: string; data: string }[] = [];
    for (const a of list) {
      if (a.status !== "ready")
        throw new DomainError(
          "CAPABILITY",
          "Remove unsupported attachments first.",
        );
      if (a.kind === "URL") {
        text += `\nUser supplied link (not fetched): ${this.url(a.url ?? "").url}`;
        continue;
      }
      const item = this.content.get(a.id);
      if (!item)
        throw new DomainError(
          "CAPABILITY",
          "Reattach this file after restarting G-Bot.",
        );
      if (item.image) images.push(item.image);
      if (item.text)
        text += `\nUntrusted attachment ${a.name}:\n${item.text}\nEnd attachment.`;
    }
    return { text, images };
  }
}
