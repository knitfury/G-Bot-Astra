import { appendFile, mkdir, rename, stat, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { SafeTelemetry } from "./telemetry";
import type { ErrorCode } from "./errors";
// Intentionally accepts no free-form messages, request arguments, headers or payloads.
export class Diagnostics {
  private queue = Promise.resolve();
  constructor(private directory: string,private telemetry?:SafeTelemetry) {}
  record(
    event:
      "ipc_failure" | "storage_failure" | "update_state" | "startup_failure",
    code: ErrorCode | "UPDATE",
  ) {
    this.queue = this.queue
      .then(async () => {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const file = join(this.directory, "diagnostics.jsonl");
        const size = await stat(file)
          .then((s) => s.size)
          .catch(() => 0);
        if(size){
          const cutoff=Date.now()-30*86400000;
          const rows=(await readFile(file,"utf8")).split("\n").filter(line=>{try{return Date.parse(JSON.parse(line).time)>=cutoff;}catch{return false;}});
          await writeFile(file,rows.join("\n")+(rows.length?"\n":""),{mode:0o600});
        }
        if (size > 1_000_000) await rename(file, file + ".previous");
        const previous = await readFile(file+".previous","utf8").catch(()=>"");
        if(previous){
          const rows=previous.split("\n").filter(line=>{try{return Date.parse(JSON.parse(line).time)>=Date.now()-30*86400000;}catch{return false;}});
          if(rows.length)await writeFile(file+".previous",rows.join("\n")+"\n",{mode:0o600});
          else await unlink(file+".previous");
        }
        this.telemetry?.record(event==="storage_failure"?"storage":event==="update_state"?"update":"desktop",event==="update_state"?"success":"failure");
        await appendFile(
          file,
          JSON.stringify({ time: new Date().toISOString(), event, code }) +
            "\n",
          { mode: 0o600 },
        );
      })
      .catch(() => {
        /* Diagnostics must not block the user or leak original errors. */
      });
    return this.queue;
  }
}
