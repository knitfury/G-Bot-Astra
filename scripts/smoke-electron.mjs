import { _electron as electron } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
const data=await fs.mkdtemp(path.join(os.tmpdir(),"gbot-electron-"));
const args=[path.resolve("."),`--user-data-dir=${data}`,...(process.env.GBOT_HEADLESS==="1"?["--no-sandbox","--ozone-platform=headless","--disable-gpu"]:[])];
const app=await electron.launch({args,timeout:60000,env:{...process.env,NODE_ENV:"production"}});
try{
 const page=await app.firstWindow({timeout:60000});
 page.on("pageerror",e=>console.error("renderer error:",e.message));
 await page.getByRole("button",{name:"Open local workspace"}).waitFor({timeout:60000});
 const isolation=await page.evaluate(()=>({node:typeof window.require,bridge:!!window.gbot}));
 if(isolation.node!=="undefined"||!isolation.bridge)throw Error("Renderer isolation failed");
 const forbidden=await page.evaluate(()=>window.gbot.call("shell.exec",["anything"]));if(forbidden.ok)throw Error("IPC allowlist bypass");
 await page.getByRole("button",{name:"Open local workspace"}).click();
 await page.getByRole("heading",{name:"What can we get done?"}).waitFor();
 await fs.mkdir("test-results-electron",{recursive:true});await page.screenshot({path:"test-results-electron/workspace.png"});
 await page.goto(new URL("/settings",page.url()).href);await page.getByRole("radio",{name:"blue",exact:true}).check();await page.getByRole("radio",{name:"dark",exact:true}).check();await page.screenshot({path:"test-results-electron/settings-dark.png",animations:"disabled"});
 await page.reload();await page.locator('html[data-color="blue"][data-appearance="dark"]').waitFor();
 const persisted=await page.evaluate(()=>localStorage.getItem("gbot-workspace-v1"));if(persisted)throw Error("Desktop preferences leaked into browser persistence");
 await page.getByRole("button",{name:"About",exact:true}).click();await page.getByRole("button",{name:"Check for updates",exact:true}).click();await page.getByRole("alert").waitFor();
 await page.screenshot({path:"test-results-electron/update-state.png",animations:"disabled"});
 console.log("Electron smoke passed: production renderer, isolated Node access, IPC rejection, local profile, native preference persistence, update prerequisite state.");
}finally{await app.close();}
