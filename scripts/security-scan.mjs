import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n');let findings=0;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/,/\bghp_[A-Za-z0-9]{30,}/,/\bAIza[A-Za-z0-9_-]{30,}/];
for(const f of files){if(/package-lock\.json$|\.(png|webp|jpg)$/.test(f)||f=== 'scripts/security-scan.mjs')continue;let text;try{text=readFileSync(f,'utf8');}catch{continue;}if(patterns.some(p=>p.test(text))){console.error(`Potential credential in ${f}; value not printed.`);findings++;}}
if(findings)process.exitCode=1;else console.log('Tracked-source credential pattern scan passed.');
