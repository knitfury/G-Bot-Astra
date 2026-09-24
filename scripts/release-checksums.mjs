import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=(await readdir('release')).filter(f=>/\.(exe|dmg|zip)$/.test(f));
if(!files.length)throw Error('No installers found.');
const lines=[];for(const f of files)lines.push(`${createHash('sha256').update(await readFile(`release/${f}`)).digest('hex')}  ${f}`);
await writeFile('release/SHA256SUMS.txt',lines.join('\n')+'\n');console.log(`Checksums created for ${files.length} installers. No files published.`);
