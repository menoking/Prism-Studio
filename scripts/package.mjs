import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const release=path.join(root,'release');const folder=path.join(release,'prism-studio');
await fs.mkdir(folder,{recursive:true});const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const checksums={};
const copyAsset=async file=>{
  const source=path.join(root,file);const destination=path.join(folder,file);
  if((await fs.stat(source)).isDirectory()){
    await fs.mkdir(destination,{recursive:true});
    for(const name of (await fs.readdir(source)).sort())await copyAsset(path.join(file,name));
  }else{
    const content=await fs.readFile(source);await fs.writeFile(destination,content);
    checksums[file.split(path.sep).join('/')]=crypto.createHash('sha256').update(content).digest('hex');
  }
};
for(const file of ['main.js','manifest.json','styles.css','README.md','VIDEO-IMPLEMENTATION.md','Prism Studio 使用教程.md','FONTS.md','fonts','docs'])await copyAsset(file);
await fs.copyFile(path.join(root,'scripts/install.ps1'),path.join(release,'Install-Prism.ps1'));
await fs.writeFile(path.join(release,'SHA256.json'),JSON.stringify(checksums,null,2));
// Powershell receives fixed strings through an encoded script, not interpolated shell arguments.
const quote=value=>`'${value.replaceAll("'","''")}'`;
const zip=path.join(release,`prism-studio-${manifest.version}.zip`);
const script=`$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath ${quote(folder)} -DestinationPath ${quote(zip)} -Force`;
const result=spawnSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8'});
if(result.status!==0)throw new Error(result.stderr||result.error?.message||'Archive creation failed');
console.log(`Release ready: ${zip}`);
console.log(`Plugin files: ${folder}`);
