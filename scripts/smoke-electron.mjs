import {_electron as electron} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'gbot-electron-'));
const packaged=process.argv.includes('--packaged');
const executablePath=packaged?process.platform==='win32'?path.resolve('release/win-unpacked/G-Bot.exe'):path.resolve(`release/mac${process.arch==='arm64'?'-arm64':''}/G-Bot.app/Contents/MacOS/G-Bot`):undefined;
const args=[...(packaged?[]:[path.resolve('.')]),`--user-data-dir=${data}`];
const launch=()=>electron.launch({executablePath,args,timeout:60000,env:{...process.env,NODE_ENV:'production'}});
const app=await launch();
try{
 const page=await app.firstWindow({timeout:60000});await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:60000});
 const isolation=await page.evaluate(()=>({node:typeof window.require,bridge:!!window.gbot}));if(isolation.node!=='undefined'||!isolation.bridge)throw Error('Renderer isolation failed');
 for(const [op,args] of [['shell.exec',['anything']],['entitlements.change',['business']],['auth.demo',[]]]){const result=await page.evaluate(([op,args])=>window.gbot.call(op,args),[op,args]);if(result.ok)throw Error(`Production boundary bypass: ${op}`);}
 const prefs=JSON.stringify({state:{color:'blue',appearance:'dark',reducedMotion:true,drafts:{test:'private-native-draft'}},version:1});
 const saved=await page.evaluate(value=>window.gbot.call('desktop.savePreferences',[value]),prefs);if(!saved.ok)throw Error('OS-protected preferences could not be saved');
 await page.reload();await page.locator('html[data-color="blue"][data-appearance="dark"]').waitFor();
 const disk=await fs.readFile(path.join(data,'real-v1','preferences.json'),'utf8');if(disk.includes('private-native-draft')||JSON.parse(disk).version!==2)throw Error('Native preferences were not encrypted');
 const workspace=await fs.readFile(path.join(data,'real-v1','workspace.json'),'utf8');if(JSON.parse(workspace).version!==2)throw Error('Workspace not encrypted');
 const demoWindow=app.waitForEvent('window');await page.getByRole('button',{name:'Explore Demo Mode',exact:true}).click();const demo=await demoWindow;await demo.getByRole('button',{name:'Explore the demo',exact:true}).click();await demo.getByRole('heading',{name:'What can we get done?'}).waitFor();
 if(await demo.evaluate(()=>!!window.gbot))throw Error('Demo obtained native bridge');await demo.locator('.record-detail').first().waitFor();
 await fs.mkdir('test-results-electron',{recursive:true});await demo.screenshot({path:`test-results-electron/${packaged?'packaged-':''}demo-workspace.png`});await page.screenshot({path:`test-results-electron/${packaged?'packaged-':''}production-signin.png`});
 const unchanged=await fs.readFile(path.join(data,'real-v1','workspace.json'),'utf8');if(unchanged!==workspace)throw Error('Demo modified real workspace');
 console.log('Native isolation, production entitlement rejection, encrypted storage, separate Demo and business panes passed. Live login is an external acceptance gate.');
}finally{await app.close();}
const restarted=await launch();try{const page=await restarted.firstWindow({timeout:60000});await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:60000});await page.locator('html[data-color="blue"][data-appearance="dark"]').waitFor();const r=await page.evaluate(()=>window.gbot.call('desktop.readPreferences',[]));if(!r.ok||!r.value.includes('private-native-draft'))throw Error('Encrypted preferences did not survive restart');console.log('Encrypted native restart persistence passed.');}finally{await restarted.close();}
