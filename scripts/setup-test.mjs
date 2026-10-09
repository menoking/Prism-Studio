import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const vault=path.join(root,'.test-vault');const profile=path.join(root,'.test-profile');
const pluginPath=path.join(vault,'.obsidian','plugins','prism-studio');
await fs.mkdir(pluginPath,{recursive:true});await fs.mkdir(profile,{recursive:true});
if(process.argv.includes('--reset')){
  const removeFiles=async directory=>{
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(entry.name==='.obsidian')continue;const file=path.resolve(directory,entry.name);if(!file.startsWith(vault+path.sep))throw new Error('Reset target outside isolated vault');if(entry.isDirectory())await removeFiles(file);else if(entry.name.startsWith('Native ')||file===path.join(vault,'Prism','Actions','Now.md')||file.startsWith(path.join(vault,'Prism','Exports')+path.sep))await fs.unlink(file);}
  };await removeFiles(vault);
}
for(const name of ['main.js','manifest.json','styles.css'])await fs.copyFile(path.join(root,name),path.join(pluginPath,name));
await fs.cp(path.join(root,'fonts'),path.join(pluginPath,'fonts'),{recursive:true});
const write=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof data==='string'?data:JSON.stringify(data,null,2));};
await write(path.join(profile,'obsidian.json'),{vaults:{prismtest:{path:vault,ts:Date.now(),open:true}}});
await write(path.join(vault,'.obsidian','app.json'),{livePreview:true,readableLineLength:true});
await write(path.join(vault,'.obsidian','appearance.json'),{theme:'moonstone',cssTheme:'',baseFontSize:16});
if(process.argv.includes('--reset'))await write(path.join(vault,'.obsidian','workspace.json'),{
  main:{id:'prism-main',type:'split',direction:'vertical',children:[{id:'prism-tabs',type:'tabs',children:[{id:'prism-welcome',type:'leaf',state:{type:'markdown',state:{file:'Welcome.md',mode:'preview'}}}]}]},
  left:{id:'prism-left',type:'split',direction:'horizontal',width:240,children:[{id:'prism-left-tabs',type:'tabs',children:[{id:'prism-files',type:'leaf',state:{type:'file-explorer',state:{sortOrder:'alphabetical'}}}]}]},
  right:{id:'prism-right',type:'split',direction:'horizontal',width:240,collapsed:true,children:[]},active:'prism-welcome',lastOpenFiles:[]
});
const blueTopazSource=process.env.PRISM_THEME_SOURCE;
if(blueTopazSource&&await fs.stat(path.join(blueTopazSource,'theme.css')).catch(()=>false)){
  const destination=path.join(vault,'.obsidian','themes','Blue Topaz');await fs.mkdir(destination,{recursive:true});
  for(const name of ['theme.css','manifest.json'])await fs.copyFile(path.join(blueTopazSource,name),path.join(destination,name));
}
const harnessPath=path.join(vault,'.obsidian','plugins','prism-native-harness');await fs.mkdir(harnessPath,{recursive:true});
const readingFocus=process.env.PRISM_TEST_SUITE==='reading-focus';
const suiteHarness=readingFocus?'reading-focus-harness.cjs':process.env.PRISM_TEST_SUITE==='window-pin'?'window-pin-harness.cjs':process.env.PRISM_TEST_SUITE==='typography'?'typography-harness.cjs':process.env.PRISM_TEST_SUITE==='target-media'?'target-media-harness.cjs':process.env.PRISM_TEST_SUITE==='media'?'media-harness.cjs':process.env.PRISM_TEST_SUITE==='dashboard'?'dashboard-harness.cjs':process.env.PRISM_TEST_SUITE==='material'?'material-harness.cjs':process.env.PRISM_TEST_SUITE==='appearance'?'appearance-harness.cjs':'native-harness.cjs';
await fs.copyFile(path.join(root,'scripts',suiteHarness),path.join(harnessPath,'main.js'));
await write(path.join(harnessPath,'suite.json'),{failedOnly:process.env.PRISM_TEST_FAILED_ONLY==='1'});
await write(path.join(harnessPath,'manifest.json'),{id:'prism-native-harness',name:'Prism Native Test Harness',version:'1.0.0',minAppVersion:'1.5.0',author:'Local tests',description:'Runs only in .test-vault',isDesktopOnly:true});
if(readingFocus){
  if(!process.env.PRISM_REFERENCE_VAULT||!process.env.PRISM_REFERENCE_NOTE)throw new Error('Reading focus test requires --vault-path and --note-path');
  const sourceVault=path.resolve(process.env.PRISM_REFERENCE_VAULT),sourceNote=path.resolve(sourceVault,process.env.PRISM_REFERENCE_NOTE);
  if(!sourceNote.startsWith(sourceVault+path.sep))throw new Error('Reference note must be inside the reference vault');
  const dataview=path.join(vault,'.obsidian','plugins','dataview');await fs.mkdir(dataview,{recursive:true});
  for(const name of ['main.js','manifest.json','styles.css'])await fs.copyFile(path.join(sourceVault,'.obsidian','plugins','dataview',name),path.join(dataview,name));
  await write(path.join(dataview,'data.json'),{enableDataviewJs:true,enableInlineDataviewJs:true});
  await fs.copyFile(sourceNote,path.join(vault,'Native Dataview Focus.md'));
}
await write(path.join(vault,'.obsidian','community-plugins.json'),readingFocus?['dataview','prism-studio','prism-native-harness']:['prism-studio','prism-native-harness']);
await write(path.join(vault,'.obsidian','core-plugins.json'),['file-explorer','global-search','switcher','graph','backlink','properties','page-preview','templates','note-composer','command-palette','editor-status','bookmarks','outline','word-count']);
await write(path.join(vault,'Welcome.md'),`---
tags: [knowledge, prism]
---
# 棱镜里的知识

让阅读更轻盈，让行动更清晰。

> [!tip] 柔光与秩序
> 主题覆盖原生编辑器、侧栏、标签页和窗口。内容始终保存在 Markdown 中。

## 从想法到行动

\`\`\`mermaid
flowchart LR
  A[收集想法] --> B[整理知识]
  B --> C[安排任务]
  C --> D[记录与复盘]
  D --> A
\`\`\`

浅蓝玻璃让窗口背后的桌面颜色透进来。[[Reading/Research Notes|研究笔记]]可以放在独立的浮动窗口里，在阅读时来回参照。

## 快速开始

- 在左侧功能栏打开 **棱镜工作台**。
- 在任务页添加任务，安排项目、截止日期和周期。
- 通过命令面板切换配色、浮动笔记或快速收集。

| 区域 | 用途 |
| --- | --- |
| Tempo | 任务与下一步 |
| 工作台 | 笔记整理与复核 |
| Pulse | 真实活动与专注记录 |

\`\`\`typescript
const knowledge = { capture: true, review: 'weekly' };
// 把知识的积累，变成行动的开始。
\`\`\`
`);
await write(path.join(vault,'Reading','Research Notes.md'),`---
status: review
tags: [research, reading]
project: Knowledge Garden
---
# Reading with intention

Good notes connect **questions**, **evidence**, and **next actions**.

## A loop for learning

\`\`\`mermaid
flowchart LR
  P[Question] --> M[Read]
  M --> R[Reflect]
  R --> J[Connect]
  J --> P
\`\`\`

> [!abstract] One thought at a time
> Keep a question beside the text. Explain it in your own words, then connect it to what you already know.

### Learning curve

The benefit comes from a repeated practice, rather than a single session.

$$K(t) = K_{max}(1-e^{-t/\\tau})$$

| Step | Outcome |
| --- | --- |
| Capture | A clear observation |
| Reflect | An explanation |
| Connect | A reusable idea |

## Next actions

- [ ] Summarize the central claim 📅 2026-10-04 ⏫
- [ ] Compare the method with previous work 🔼
- [x] Capture the original source

Back to [[Welcome]].
`);
await write(path.join(vault,'Prism','Inbox','一闪而过的想法.md'),`---\nstatus: inbox\ntags: [capture]\n---\n# 一闪而过的想法\n\n先收集，再整理。\n`);
await write(path.join(vault,'Projects','知识花园.md'),`---\nstatus: project\nproject: Knowledge Garden\ntags: [project]\n---\n# 知识花园\n\n把阅读、创作与下一步连接起来。\n`);
// Fixtures are labelled demonstration tasks; activity history remains empty until real events.
const tasks=[
  ['整理本周阅读笔记','today','high','research'],['给工作区留一点空白','today','none',''],
  ['比较两种实验方法','today','medium','research'],['把观察写成一个小结','today','low','garden'],
  ['下次阅读的三个问题','next','medium','research'],['建立论文索引','inbox','none','research'],
  ['记录一闪而过的灵感','inbox','none','garden'],['整理知识目录','anytime','low','garden'],
  ['等待读书会反馈','waiting','none','research'],['探索新的知识结构','someday','none','garden']
].map(([title,lane,priority,projectId],i)=>({id:`fixture-${i}`,title,description:'演示任务，可自由编辑。',lane,priority,projectId,sprintId:'',due:'',notePath:i===0?'Reading/Research Notes.md':'',createdAt:Date.now()+i,inProgress:i===0}));
if(process.argv.includes('--reset') || !await fs.stat(path.join(pluginPath,'data.json')).catch(()=>false))await write(path.join(pluginPath,'data.json'),{version:1,settings:{homeOnStartup:true},tasks,projects:[{id:'research',name:'研究与阅读',color:'#719cb8'},{id:'garden',name:'知识花园',color:'#b88b9d'}],sprints:[],activity:{},drafts:{}});
console.log(JSON.stringify({vault,profile,pluginPath},null,2));
