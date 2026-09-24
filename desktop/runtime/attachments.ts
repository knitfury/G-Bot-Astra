import {Worker} from "node:worker_threads";
import {join} from "node:path";
import { randomUUID } from "node:crypto";
import type { Attachment } from "../../src/types/domain";
import { DomainError } from "./errors";
export class Attachments {
  private content = new Map<
    string,
    { text?: string; image?: { mime: string; data: string } }
  >();
  clear() { this.content.clear(); }
  remove(id:string) { this.content.delete(id); }
  async ingestFile(name:string,type:string,bytes:Uint8Array):Promise<Attachment> {
    if(bytes.length>50*1024*1024)throw new DomainError("CAPABILITY","Maximum file size is 50 MB.");
    if(/\.(png|jpe?g|webp)$/i.test(name)) {
      const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
      const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=Buffer.from(bytes.subarray(0,4)).toString()==="RIFF"&&Buffer.from(bytes.subarray(8,12)).toString()==="WEBP";
      if(!png&&!jpg&&!webp)throw new DomainError("CAPABILITY","Image content does not match a supported format.");
      const mime=png?"image/png":jpg?"image/jpeg":"image/webp",id=randomUUID();
      if(this.content.size>=20)this.content.delete(this.content.keys().next().value!);
      this.content.set(id,{image:{mime,data:Buffer.from(bytes).toString("base64")}});
      return {id,name:name.slice(0,240),kind:"image",mime,size:bytes.length,status:"ready"};
    }
    if(!/\.(pdf|docx|xlsx|txt|md|csv)$/i.test(name))return {id:randomUUID(),name,kind:"file",mime:type,size:bytes.length,status:"unsupported",error:"Use PDF, DOCX, TXT, MD, CSV, XLSX, PNG, JPEG or WebP."};
    const text=await new Promise<string>((resolve,reject)=>{
      const worker=new Worker(join(__dirname,"extract-worker.cjs"),{workerData:{name,bytes},resourceLimits:{maxOldGenerationSizeMb:256}});
      const timer=setTimeout(()=>{void worker.terminate();reject(new DomainError("CAPABILITY","Extraction timed out. Try a smaller document."));},30000);
      worker.once("message",(result:{ok:boolean;text?:string;error?:string})=>{clearTimeout(timer);void worker.terminate();if(result.ok&&result.text)resolve(result.text);else reject(new DomainError("CAPABILITY",result.error??"Extraction failed."));});
      worker.once("error",()=>{clearTimeout(timer);reject(new DomainError("CAPABILITY","Extraction failed safely. Try another document."));});
      worker.once("exit",code=>{clearTimeout(timer);if(code!==0)reject(new DomainError("CAPABILITY","Extraction stopped. Try a smaller document."));});
    });
    const id=randomUUID();if(this.content.size>=20)this.content.delete(this.content.keys().next().value!);
    // Chunks retain document order and avoid unbounded provider input. User gets an explicit excerpt marker.
    const chunks=text.match(/[\s\S]{1,16000}/g)??[];const selected=chunks.slice(0,12).join("\n");
    this.content.set(id,{text:selected+(chunks.length>12?"\n[Context excerpt: remaining document text was not sent. Attach a narrower excerpt for additional content.]":"")});
    return {id,name:name.slice(0,240),kind:"file",mime:type||"application/octet-stream",size:bytes.length,status:"ready"};
  }
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
