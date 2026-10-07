import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const binary=process.env.OBSIDIAN_EXE||'D:/Obsidian/Obsidian.exe';
const appearance=process.argv.includes('--appearance');
const material=process.argv.includes('--material');
const dashboard=process.argv.includes('--dashboard');
const media=process.argv.includes('--media');
const targetMedia=process.argv.includes('--target-media');
const typography=process.argv.includes('--typography');
await fs.access(binary);const started=Date.now();
const setup=spawn(process.execPath,[path.join(root,'scripts/setup-test.mjs'),'--reset'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,PRISM_TEST_SUITE:typography?'typography':targetMedia?'target-media':media?'media':dashboard?'dashboard':material?'material':appearance?'appearance':'full',PRISM_TEST_FAILED_ONLY:process.argv.includes('--failed-only')?'1':'0'}});
await new Promise((resolve,reject)=>{setup.on('exit',code=>code===0?resolve():reject(new Error(`Fixture setup failed: ${code}`)));setup.on('error',reject);});
const app=spawn(binary,[`--user-data-dir=${path.join(root,'.test-profile')}`,'--force-renderer-accessibility'],{cwd:root,stdio:'ignore',windowsHide:true});
await fs.writeFile(path.join(root,'.test-process.json'),JSON.stringify({pid:app.pid,binary,profile:path.join(root,'.test-profile'),started},null,2));
const deadline=Date.now()+90000;const output=path.join(root,typography?'verification/typography-results.json':targetMedia?'verification/target-media-results.json':media?'verification/media-results.json':dashboard?'verification/dashboard-results.json':material?'verification/material-results.json':appearance?'verification/appearance-results.json':'verification/native-results.json');
console.log('Running native tests in the isolated .test-vault. On the first run, trust only this locally created test vault.');
let report;
while(Date.now()<deadline){try{const value=JSON.parse(await fs.readFile(output,'utf8'));if(Date.parse(value.started)>=started && (value.finished||value.fatal)){report=value;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!report){console.error('Native tests did not finish. The isolated app may be waiting for the initial plugin trust prompt.');process.exitCode=1;}
else{for(const check of report.checks)console.log(`${check.pass?'PASS':'FAIL'} ${check.name}${check.error?`\n  ${check.error}`:''}`);if(report.fatal)console.error(report.fatal);if(report.errors?.length)console.error(report.errors);console.log(`${report.checks.filter(c=>c.pass).length}/${report.checks.length} passed. Screenshots: verification/.`);process.exitCode=report.pass?0:1;}
