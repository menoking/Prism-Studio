import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),started=Date.now();
const setup=spawn(process.execPath,[path.join(root,'scripts/setup-test.mjs'),'--reset'],{cwd:root,stdio:'inherit',windowsHide:true});
await new Promise((resolve,reject)=>{setup.on('exit',code=>code===0?resolve():reject(new Error('Screenshot fixture setup failed')));setup.on('error',reject);});
await fs.copyFile(path.join(root,'scripts/screenshots-harness.cjs'),path.join(root,'.test-vault/.obsidian/plugins/prism-native-harness/main.js'));
spawn(process.env.OBSIDIAN_EXE||'D:/Obsidian/Obsidian.exe',[`--user-data-dir=${path.join(root,'.test-profile')}`],{cwd:root,stdio:'ignore',windowsHide:true});
const output=path.join(root,'verification/screenshots-results.json');
let report;
for(const end=Date.now()+90000;Date.now()<end;){try{const r=JSON.parse(await fs.readFile(output,'utf8'));if(Date.parse(r.started)>=started&&r.finished){report=r;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!report||report.error){console.error(report?.error||'Screenshot session did not finish');process.exitCode=1;}
else console.log(`Captured ${report.screenshots.length} actual Obsidian screenshots in docs/screenshots.`);
