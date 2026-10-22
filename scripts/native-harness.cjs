/* Runs inside a dedicated Obsidian test vault. Never shipped in the release. */
const {Plugin, MarkdownView}=require('obsidian');
const fs=require('fs');const path=require('path');
module.exports=class PrismNativeHarness extends Plugin{
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),1000));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();
    if(path.basename(base)!=='.test-vault')throw new Error('Harness refused: expected dedicated .test-vault');
    const out=path.join(path.dirname(base),'verification');fs.mkdirSync(out,{recursive:true});
    const report={appVersion:this.app.getVersion?.()||require('obsidian').apiVersion,started:new Date().toISOString(),checks:[],screenshots:[],errors:[],artifacts:Object.fromEntries(['main.js','manifest.json','styles.css'].map(name=>[name,require('crypto').createHash('sha256').update(fs.readFileSync(path.join(base,'.obsidian','plugins','prism-studio',name))).digest('hex')]))};
    const save=()=>fs.writeFileSync(path.join(out,'native-results.json'),JSON.stringify(report,null,2));
    const errors=[];
    const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn,timeout=6000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await wait(80);}throw new Error('Timed out waiting for app state');};
    const check=async(name,run)=>{const before=errors.length;try{await run();report.checks.push({name,pass:true});}catch(error){const settings=this.app.setting;report.checks.push({name,pass:false,error:String(error),stack:error.stack,diagnostic:name.startsWith('Settings')?{headings:[...document.querySelectorAll('h2')].map(el=>({text:el.textContent,parent:el.parentElement.className})),settingKeys:Object.keys(settings||{}),activeTab:settings?.activeTab?.id,lastTabId:settings?.lastTabId,pluginTabs:settings?.pluginTabs?.map(t=>({id:t.id,name:t.name,connected:t.containerEl?.isConnected,root:t.containerEl?.getRootNode()?.constructor?.name,html:t.containerEl?.innerHTML.slice(0,600)})),container:{connected:settings?.containerEl?.isConnected,root:settings?.containerEl?.getRootNode()?.constructor?.name,owner:settings?.containerEl?.ownerDocument===document,html:settings?.containerEl?.outerHTML.slice(0,3000)},modalHtml:[...document.querySelectorAll('.modal')].map(el=>el.outerHTML.slice(0,12000))}:undefined});closeModals();if(name.startsWith('Settings'))settings.close();}finally{const added=errors.length-before;if(added){if(!report.errorGrowth)report.errorGrowth=[];report.errorGrowth.push({name,added});}}save();};
    const click=(selector,label)=>{const el=[...document.querySelectorAll(selector)].find(el=>el.getAttribute('aria-label')===label||el.textContent.trim()===label);assert(el,`Missing control: ${label}`);el.click();return el;};
    const closeModals=()=>document.querySelectorAll('.modal-container .modal-header-button').forEach(el=>el.click());
    const input=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    let prism;
    try{
      const remote=require('@electron/remote');const win=remote.getCurrentWindow();
      win.show();win.setFullScreen(false);win.unmaximize();win.setBounds({x:80,y:25,width:1280,height:900});await wait(300);
      const screenshot=async(name,target=win)=>{document.querySelectorAll('.notice').forEach(el=>el.remove());const otherLeaves=[];this.app.workspace.iterateAllLeaves(leaf=>{if(leaf!==this.app.workspace.activeLeaf && ['markdown','empty','prism-studio-view'].includes(leaf.view.getViewType()))otherLeaves.push(leaf);});for(const leaf of otherLeaves)leaf.detach();await wait(500);const image=await target.capturePage();assert(!image.isEmpty(),'Screenshot was empty');fs.writeFileSync(path.join(out,`${name}.png`),image.toPNG());report.screenshots.push(`${name}.png`);save();};
      await until(()=>this.app.plugins.getPlugin('prism-studio'));prism=this.app.plugins.getPlugin('prism-studio');
      window.__prismNativeTesting=true;
      const onError=event=>errors.push(event.message||String(event.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
      await check('Native startup: registered commands, skin, home and live vault lists',async()=>{
        await prism.openStudio('home');await wait(600);
        assert(document.body.classList.contains('prism-skin'),'Skin not enabled');assert(document.querySelector('.prism-home-grid'),'Home missing');
        assert(document.querySelector('.prism-view').textContent.includes('知识花园'),'Real note/project list missing');
        assert(this.app.commands.commands['prism-studio:float-note'],'Floating command missing');
        await screenshot('01-home-light');
      });
      await check('Task UI: creation, dates, priorities, validation, editing and persistence',async()=>{
        await prism.openStudio('tasks');prism.newTask('today');await wait(100);
        const title=document.querySelector('.prism-task-title');assert(title,'Task modal missing');
        click('.prism-modal button','创建任务');assert(document.querySelector('.prism-task-title'),'Empty task should not save');
        input(title,'Native verification task');input(document.querySelector('.prism-task-description'),'A real task created through the task modal.');
        const selects=document.querySelectorAll('.prism-modal select:not([aria-hidden])');selects[1].value='research';selects[1].dispatchEvent(new Event('change'));selects[2].value='high';selects[2].dispatchEvent(new Event('change'));
        input(document.querySelector('.prism-modal input[type="date"]'),new Date().toLocaleDateString('sv-SE'));
        click('.prism-modal button','创建任务');await until(()=>prism.data.tasks.some(t=>t.title==='Native verification task'));
        const task=prism.data.tasks.find(t=>t.title==='Native verification task');assert(task.priority==='high'&&task.projectId==='research'&&task.due,'Task metadata not saved');
        await wait(300);assert(document.querySelector(`[data-task-id="${task.id}"]`),'Created task absent from real UI');
        prism.editTask(task);await wait(80);input(document.querySelector('.prism-task-title'),'Native task edited');click('.prism-modal button','保存任务');await until(()=>prism.data.tasks.find(t=>t.id===task.id)?.title==='Native task edited');
        await until(()=>!document.querySelector('.prism-task-title'));await prism.writeQueue;
        const saved=JSON.parse(fs.readFileSync(path.join(base,'.obsidian','plugins','prism-studio','data.json'),'utf8'));assert(saved.tasks.some(t=>t.title==='Native task edited'),'Data not written to disk');
        await screenshot('02-tasks-light');
      });
      await check('Task UI: completion, reopen, filtering, undo and seven-column drag/drop board',async()=>{
        const task=prism.data.tasks.find(t=>t.title==='Native task edited');await wait(150);
        const checkbox=document.querySelector(`[data-task-id="${task.id}"] input`);checkbox.click();await until(()=>prism.data.tasks.find(t=>t.id===task.id)?.lane==='done');
        await prism.undo();assert(prism.data.tasks.find(t=>t.id===task.id).lane==='today','Undo did not restore task');
        await wait(200);const search=document.querySelector('[data-prism-search]');input(search,'Native task');await wait(250);assert(document.querySelectorAll('.prism-task-list .prism-task-row').length===1,'Task search filter failed');input(document.querySelector('[data-prism-search]'),'');await wait(250);
        click('.prism-view button','看板');await wait(100);assert(document.querySelectorAll('.prism-board-column').length===7,'Expected 7 lanes');
        const drop=new DataTransfer();drop.setData('application/prism-task',task.id);document.querySelector('[data-lane="next"]').dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));await until(()=>prism.data.tasks.find(t=>t.id===task.id)?.lane==='next');
        await screenshot('03-board-light');click('.prism-view button','列表');
      });
      await check('Markdown tasks: import idempotence, checked writeback, moved lines, undo and conflict safety',async()=>{
        const fixture=await this.app.vault.create('Native task source.md','# Tasks\n\n- [ ] Native linked task 📅 2026-10-04 ⏫\n- [x] Source completed\n');
        await prism.importTasks(fixture);const count=prism.data.tasks.length;await prism.importTasks(fixture);assert(prism.data.tasks.length===count,'Repeated import duplicated tasks');
        const linked=prism.data.tasks.find(t=>t.title==='Native linked task');assert(linked.source,'Missing source metadata');
        await this.app.vault.modify(fixture,'# Inserted line\n'+await this.app.vault.read(fixture));
        await prism.setComplete(linked.id,true);assert((await this.app.vault.read(fixture)).includes('- [x] Native linked task'),'Moved checkbox not updated');
        await prism.undo();assert((await this.app.vault.read(fixture)).includes('- [ ] Native linked task'),'Undo did not restore checkbox');
        await prism.setComplete(linked.id,true);await prism.setComplete(linked.id,false);assert((await this.app.vault.read(fixture)).includes('- [ ] Native linked task'),'Reopen after undo failed');
        const external=(await this.app.vault.read(fixture)).replace('Native linked task','Externally changed task');await this.app.vault.modify(fixture,external);assert(await prism.setComplete(linked.id,true)===false,'Source conflict accepted');assert(await this.app.vault.read(fixture)===external,'Source conflict changed file');
        await prism.importTasks(fixture);assert(prism.data.tasks.filter(t=>t.source?.path===fixture.path).length===2,'Reimport after source edit duplicated task');
        const duplicate=await this.app.vault.create('Native duplicate tasks.md','- [ ] Repeated title\n- [ ] Repeated title\n');await prism.importTasks(duplicate);await this.app.vault.modify(duplicate,'# Added header\n'+await this.app.vault.read(duplicate));await prism.importTasks(duplicate);assert(prism.data.tasks.filter(t=>t.source?.path===duplicate.path).length===2,'Moved duplicate source lines produced extra tasks');await this.app.vault.modify(duplicate,'# No tasks remain\n');await prism.importTasks(duplicate);assert(!prism.data.tasks.some(t=>t.source?.path===duplicate.path),'Deleted source tasks remain after import');
      });
      await check('Project and Sprint controls: save, assign, progress and safe deletion',async()=>{
        prism.manage('projects');await wait(100);click('.prism-modal button','添加项目');const inputs=document.querySelectorAll('.prism-manage-row input[type="text"]');input(inputs[inputs.length-1],'Native project');click('.prism-modal button','保存');await until(()=>prism.data.projects.some(p=>p.name==='Native project'));
        prism.manage('sprints');await wait(100);click('.prism-modal button','添加周期');await wait(80);const name=document.querySelector('.prism-sprint-form input[type="text"]');input(name,'Native Sprint');click('.prism-modal button','保存');await until(()=>prism.data.sprints.some(s=>s.name==='Native Sprint'));
        const task=prism.data.tasks.find(t=>t.title==='Native task edited');prism.editTask(task);await wait(80);const choices=[...document.querySelectorAll('.prism-modal select:not([aria-hidden])')];const project=prism.data.projects.find(p=>p.name==='Native project');const sprint=prism.data.sprints.find(s=>s.name==='Native Sprint');choices[1].value=project.id;choices[1].dispatchEvent(new Event('change'));choices[3].value=sprint.id;choices[3].dispatchEvent(new Event('change'));click('.prism-modal button','保存任务');await until(()=>prism.data.tasks.find(t=>t.id===task.id)?.sprintId===sprint.id);
        await prism.setProjects(prism.data.projects.filter(p=>p.id!==project.id));assert(!prism.data.tasks.find(t=>t.id===task.id).projectId,'Deleting project left dangling assignment');await prism.setSprints(prism.data.sprints.filter(s=>s.id!==sprint.id));assert(!prism.data.tasks.find(t=>t.id===task.id).sprintId,'Deleting sprint left dangling assignment');
      });
      await check('Capture and daily notes: native files, unique names, metadata and reopen',async()=>{
        this.app.commands.executeCommandById('prism-studio:quick-capture');await wait(100);input(document.querySelector('.prism-task-title'),'Native capture');input(document.querySelector('.prism-task-description'),'A captured idea with [[Welcome]].');click('.prism-modal button','保存笔记');await until(()=>this.app.vault.getAbstractFileByPath('Prism/Inbox/Native capture.md'));
        const capture=this.app.vault.getAbstractFileByPath('Prism/Inbox/Native capture.md');assert((await this.app.vault.read(capture)).includes('status: inbox'),'Capture frontmatter missing');
        await prism.uniqueNote('Prism/Inbox','Native capture','Duplicate title remains independent.');assert(this.app.vault.getAbstractFileByPath('Prism/Inbox/Native capture 2.md'),'Unique filename collision');
        await prism.dailyNote();const count=this.app.vault.getMarkdownFiles().length;await prism.dailyNote();assert(count===this.app.vault.getMarkdownFiles().length,'Repeated daily note duplicated file');
      });
      await check('Content workflow: generate linked next actions, avoid duplicates and open Now',async()=>{
        await wait(300);const count=prism.data.tasks.length;await prism.generateActions();assert(prism.data.tasks.length>count,'No actions generated from real pending notes');await prism.undo();assert(prism.data.tasks.length===count,'Undo generator did not restore task list');const undoneNow=this.app.vault.getAbstractFileByPath('Prism/Actions/Now.md');if(undoneNow)assert(!(await this.app.vault.read(undoneNow)).includes('下一批行动'),'Undo generator left generated Markdown rows');await prism.generateActions();const after=prism.data.tasks.length;await prism.generateActions();assert(prism.data.tasks.length===after,'Generator created duplicate actions');
        const generated=prism.data.tasks.find(t=>t.autoAction);assert(generated?.source?.path==='Prism/Actions/Now.md','Generated action not linked to Now');await prism.setComplete(generated.id,true);const now=this.app.vault.getAbstractFileByPath('Prism/Actions/Now.md');assert((await this.app.vault.read(now)).includes(`- [x] ${generated.title}`),'Generated action checkbox did not sync');await prism.openNow();assert(this.app.workspace.getActiveFile()?.path===now.path,'Now command did not open the file');
      });
      await check('Activity: actual create/modify events, word growth, rewrite, heatmap and focus record',async()=>{
        const file=await this.app.vault.create('Native activity.md','Hello knowledge\n');const day=new Date().toLocaleDateString('sv-SE');await until(()=>prism.data.activity[day]?.notes[file.path]?.created);
        await this.app.vault.modify(file,'Hello knowledge grows\n');await until(()=>prism.data.activity[day].notes[file.path].added>=3);await this.app.vault.modify(file,'Hello wisdom grows\n');await until(()=>prism.data.activity[day].notes[file.path].revised>=1);
        assert(prism.data.activity[day].notes[file.path].added===3,'Activity appended word count wrong');
        prism.toggleFocus();prism.tickTime=Date.now()-15000;prism.lastEdit=Date.now();prism.tick();assert(prism.data.activity[day].focusSeconds>0&&prism.data.activity[day].seconds>0,'Activity timer failed');prism.toggleFocus();
        await prism.openStudio('pulse');await wait(250);assert(document.querySelectorAll('.prism-heatmap-cells button').length>=365,'Annual heatmap missing');const cell=document.querySelector(`[data-day="${day}"]`);cell.click();assert(document.querySelector('.prism-pulse-detail').textContent.includes('Native activity.md'),'Activity detail absent');
        await screenshot('04-pulse-light');
        click('.prism-view button','4 周');assert(document.querySelectorAll('.prism-heatmap-cells button').length<=35,'Heatmap range not reduced');click('.prism-view button','52 周');
      });
      await check('Floating notes: native Markdown, layers, drag, resize, edit/save, conflict guard and draft recovery',async()=>{
        await prism.openStudio('home');const welcome=this.app.vault.getAbstractFileByPath('Welcome.md'),research=this.app.vault.getAbstractFileByPath('Reading/Research Notes.md');await prism.floats.open(welcome);await prism.floats.open(research);assert(document.querySelectorAll('.prism-floating').length===2,'Floating windows missing');
        prism.floats.arrange();await wait(300);document.querySelectorAll('.prism-floating button').forEach(el=>{if(el.textContent.trim()==='允许')el.click();});await wait(300);assert(document.querySelector('.prism-floating .markdown-rendered h1'),'Native Markdown preview missing');await screenshot('05-floating-light');
        const front=document.querySelector('.prism-floating.is-front'),header=front.querySelector('.prism-floating-header');const oldLeft=parseFloat(front.style.left);header.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:200,clientY:180}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:245,clientY:210}));window.dispatchEvent(new PointerEvent('pointerup'));assert(parseFloat(front.style.left)>oldLeft,'Floating drag failed');
        assert(getComputedStyle(front).resize==='both','Floating resize disabled');front.style.width='580px';assert(front.getBoundingClientRect().width===580,'Resize sizing failed');
        front.querySelector('[aria-label="最小化 / 还原"]').click();assert(front.classList.contains('is-minimized'),'Minimize failed');front.querySelector('[aria-label="最小化 / 还原"]').click();
        front.querySelector('[aria-label="阅读 / 编辑"]').click();await until(()=>front.querySelector('textarea'));const editor=front.querySelector('textarea');const original=await this.app.vault.read(research);input(editor,original+'\nNative floating save.\n');front.querySelector('.prism-floating-edit-bar button').click();await until(()=>!prism.data.drafts[research.path]);assert((await this.app.vault.read(research)).includes('Native floating save.'),'Floating edit not saved');
        input(editor,editor.value+'\nRecovered draft.\n');await this.app.vault.modify(research,(await this.app.vault.read(research))+'\nExternal edit.\n');front.querySelector('.prism-floating-edit-bar button').click();await wait(200);assert(!(await this.app.vault.read(research)).includes('Recovered draft.'),'Concurrent file overwrite');assert(prism.data.drafts[research.path],'Draft not preserved');
        prism.floats.closeAll(true);await prism.floats.open(research);document.querySelector('.prism-floating [aria-label="阅读 / 编辑"]').click();await until(()=>document.querySelector('.prism-floating textarea'));assert(document.querySelector('.prism-floating textarea').value.includes('Recovered draft.'),'Draft recovery failed');
        document.querySelector('.prism-floating [aria-label="关闭"]').click();assert(document.querySelector('.prism-modal h2').textContent.includes('放弃'),'Dirty close not confirmed');click('.prism-modal button','确认');await until(()=>!document.querySelector('.prism-floating'));assert(!prism.data.drafts[research.path],'Discarded draft remains');
      });
      await check('Native editor skin: reading/source views, light/dark and palette settings',async()=>{
        const file=this.app.vault.getAbstractFileByPath('Reading/Research Notes.md');const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'},active:true});await wait(650);
        assert(leaf.view instanceof MarkdownView,'Not real native Markdown view');const style=getComputedStyle(leaf.view.containerEl.querySelector('.markdown-preview-view'));assert(style.backgroundColor==='rgba(0, 0, 0, 0)','Native reading pane opaque');await screenshot('06-native-reading-light');
        await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'source'},active:true});await wait(250);assert(leaf.view.containerEl.querySelector('.cm-editor'),'Native source editor missing');
        await prism.openStudio('home');document.body.removeClass('theme-light');document.body.addClass('theme-dark');await wait(200);assert(getComputedStyle(document.querySelector('.prism-view')).getPropertyValue('--prism-ink').trim()==='#e2eaf1','Dark skin tokens missing');await screenshot('07-home-dark');
        await prism.openStudio('tasks');await screenshot('08-tasks-dark');
        await prism.updateSettings({palette:'lagoon',blur:28,radius:18});assert(document.querySelector('#prism-dynamic-skin').textContent.includes('165 219 207'),'Palette not applied');await screenshot('09-lagoon-dark');
        await prism.updateSettings({palette:'blue',blur:20,radius:14});document.body.removeClass('theme-dark');document.body.addClass('theme-light');
        await prism.updateSettings({enabled:false});assert(!document.body.classList.contains('prism-skin'),'Disable skin failed');await prism.updateSettings({enabled:true});
      });
      await check('Responsive narrow layout and keyboard focus',async()=>{
        win.setSize(760,900);await prism.openStudio('home');await wait(300);const grid=document.querySelector('.prism-home-grid');assert(getComputedStyle(grid).gridTemplateColumns.split(' ').length===1,'Narrow home grid did not collapse');await screenshot('10-home-narrow');
        await prism.openStudio('tasks');await wait(200);assert(getComputedStyle(document.querySelector('.prism-task-sidebar')).display==='none','Narrow task sidebar did not collapse');const control=document.querySelector('.prism-view button');control.focus();assert(document.activeElement===control,'Keyboard focus failed');await screenshot('11-tasks-narrow');win.setSize(1280,900);
      });
      await check('Settings UI, activity opt-out, wallpaper validation and Blue Topaz coexistence',async()=>{
        await prism.openStudio('home');click('.prism-view button','皮肤设置');await until(()=>this.app.setting.activeTab?.id==='prism-studio' && this.app.setting.activeTab.containerEl.isConnected && this.app.setting.activeTab.containerEl.querySelector('.setting-item-heading .setting-item-name')?.textContent==='外观与工作台');
        const settings=this.app.setting.activeTab.containerEl,settingsDoc=settings.ownerDocument;assert(settings.querySelectorAll('input[type="range"]').length===8,'Missing appearance controls');assert(settingsDoc.body.classList.contains('prism-skin'),'Settings window skin missing');const palette=settings.querySelector('select:not([aria-hidden])');palette.value='sunset';palette.dispatchEvent(new Event('change'));await until(()=>prism.data.settings.palette==='sunset');const settingsWindow=settingsDoc.defaultView.require('@electron/remote').getCurrentWindow();await screenshot('13-settings-light',settingsWindow);
        const recording=[...settings.querySelectorAll('.setting-item')].find(el=>el.querySelector('.setting-item-name')?.textContent==='记录本地活动');recording.querySelector('.checkbox-container').click();await until(()=>!prism.data.settings.recordActivity);const off=await this.app.vault.create('Native unrecorded.md','Unrecorded while opted out.');await wait(250);const day=new Date().toLocaleDateString('sv-SE');assert(!prism.data.activity[day]?.notes[off.path],'Activity opt-out ignored');recording.querySelector('.checkbox-container').click();await until(()=>prism.data.settings.recordActivity);this.app.setting.close();
        await prism.updateSettings({palette:'blue',backgroundPath:'https://example.invalid/image.png'});assert(document.querySelector('#prism-dynamic-skin').textContent.includes('--prism-wallpaper:none'),'External background URL accepted');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64');await this.app.vault.createBinary('Native wallpaper.png',png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength));await prism.updateSettings({backgroundPath:'Native wallpaper.png'});assert(document.querySelector('#prism-dynamic-skin').textContent.includes('--prism-wallpaper:url('),'Vault image background not applied');await prism.updateSettings({backgroundPath:''});
        if(fs.existsSync(path.join(base,'.obsidian','themes','Blue Topaz','theme.css'))){await this.app.customCss.setTheme('Blue Topaz');await wait(600);await prism.openStudio('home');assert(document.body.classList.contains('prism-skin'),'Blue Topaz disabled skin');assert(getComputedStyle(document.querySelector('.prism-view')).getPropertyValue('--prism-ink').trim()==='#263843','Blue Topaz replaced palette');await screenshot('14-blue-topaz-light');report.themeCompatibility='Blue Topaz 2026081501';await this.app.customCss.setTheme('');await wait(300);}
      });
      await check('Native popout windows inherit and update the skin',async()=>{
        const leaf=this.app.workspace.openPopoutLeaf();await leaf.openFile(this.app.vault.getAbstractFileByPath('Welcome.md'));await until(()=>leaf.view.containerEl.ownerDocument!==document && leaf.view.containerEl.ownerDocument.body.classList.contains('prism-skin'));const doc=leaf.view.containerEl.ownerDocument;assert(doc.querySelector('#prism-dynamic-skin'),'Popout dynamic stylesheet missing');await prism.updateSettings({palette:'lagoon'});assert(doc.querySelector('#prism-dynamic-skin').textContent.includes('165 219 207'),'Popout palette did not update');await prism.updateSettings({palette:'blue'});leaf.detach();await prism.openStudio('home');
      });
      await check('Export includes Markdown tasks and real project headings',async()=>{await prism.exportTasks();const files=this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('Prism/Exports/'));assert(files.length,'Export file absent');const content=await this.app.vault.read(files[files.length-1]);assert(content.includes('- [ ]')&&content.includes('## 研究与阅读'),'Markdown export missing tasks/project headings');});
      await check('Glass: native compositor, transparent backing, blue-only tint and reversible settings',async()=>{
        assert(document.documentElement.classList.contains('prism-native-glass'),prism.glass.status.get(document)||'Native glass unavailable');
        // Electron's getter omits alpha on this installer. Verify the native composite below.
        assert(getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)','Body blocks the compositor');
        const css=fs.readFileSync(path.join(base,'.obsidian','plugins','prism-studio','styles.css'),'utf8');assert(!css.includes('--prism-pink')&&!css.includes('--prism-yellow')&&!css.includes('radial-gradient'),'Artificial wallpaper colors remain');
        report.nativeGlass={status:prism.glass.status.get(document),background:win.getBackgroundColor(),os:require('os').release(),electron:process.versions.electron};
        report.nativeGlass.layers=[...document.querySelectorAll('html,body,.app-container,.horizontal-main-container,.workspace,.workspace-split,.workspace-tabs,.workspace-tab-container,.workspace-leaf-content,.view-content,.markdown-source-view,.cm-scroller')].map(el=>({class:el.className,background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage,opacity:getComputedStyle(el).opacity}));
        await prism.updateSettings({nativeGlass:false});assert(!document.documentElement.classList.contains('prism-native-glass'),'Glass not restored');
        await prism.updateSettings({nativeGlass:true,intensity:35,opacity:42});assert(document.documentElement.classList.contains('prism-native-glass'),'Glass not re-enabled');
        report.nativeGlass.views=(win.contentView?.children||[]).map(v=>({name:v.constructor.name,color:v.getBackgroundColor?.(),methods:Object.getOwnPropertyNames(Object.getPrototypeOf(v)),webContents:v.webContents?.id}));
        const backing=new remote.BrowserWindow({show:false,frame:false,...win.getBounds(),backgroundColor:'#b0d893',webPreferences:{contextIsolation:true,nodeIntegration:false}});
        try{
          const desktopCapturer=remote.require('electron').desktopCapturer;assert(desktopCapturer,'Native composite capture unavailable');
          const capture=async(name,color)=>{
            backing.setBackgroundColor(color);await backing.loadURL('data:text/html,'+encodeURIComponent(`<html><body style="margin:0;background:${color};height:100vh"></body></html>`));backing.setAlwaysOnTop(true);backing.showInactive();win.setAlwaysOnTop(true);win.show();win.moveTop();win.focus();await wait(1400);
            assert(win.isFocused()&&win.isAlwaysOnTop(),'Controlled window not in foreground');
            const bounds=win.getBounds(),display=remote.screen.getDisplayMatching(bounds);
            const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
            assert(win.isFocused(),'Foreground changed during controlled capture; discarded');
            const source=sources.find(s=>s.display_id===String(display.id))||sources[0];assert(source&&!source.thumbnail.isEmpty(),'Owned window composite not captured');
            const sizeFull=source.thumbnail.getSize(),sx=sizeFull.width/display.bounds.width,sy=sizeFull.height/display.bounds.height;
            const x=Math.max(0,Math.round((bounds.x-display.bounds.x)*sx)),y=Math.max(0,Math.round((bounds.y-display.bounds.y)*sy));
            const own=source.thumbnail.crop({x,y,width:Math.min(sizeFull.width-x,Math.round(bounds.width*sx)),height:Math.min(sizeFull.height-y,Math.round(bounds.height*sy))});
            report.nativeGlass.focused=true;
            const png=own.toPNG();fs.writeFileSync(path.join(out,`${name}.png`),png);report.screenshots.push(`${name}.png`);
            const bitmap=own.toBitmap(),size=own.getSize();let rgb=[0,0,0],count=0;
            for(let y=Math.floor(size.height*.74);y<Math.floor(size.height*.8);y++)for(let x=Math.floor(size.width*.12);x<Math.floor(size.width*.17);x++){const p=(y*size.width+x)*4;rgb[0]+=bitmap[p+2];rgb[1]+=bitmap[p+1];rgb[2]+=bitmap[p];count++;}
            return rgb.map(v=>v/count);
          };
          const green=await capture('19-native-glass-green','#8cd690'),pink=await capture('20-native-glass-pink','#e5a8cf');
          const difference=green.reduce((sum,v,i)=>sum+Math.abs(v-pink[i]),0);report.nativeGlass.composite={green,pink,difference};assert(difference>12,`Native glass does not expose the controlled background: RGB delta ${difference}`);
        }finally{win.setAlwaysOnTop(false);backing.close();}
      });
      let mediaFile,mediaLeaf;
      await check('Reading rail: real heading ticks, hover title, click, drag, keyboard and source mode',async()=>{
        for(let i=1;i<=3;i++)await this.app.vault.create(`Native media ${i}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420"><rect width="800" height="420" rx="18" fill="${['#e7f3fb','#dae9f2','#cee4ef'][i-1]}"/><text x="40" y="56" font-family="Segoe UI" font-size="27" fill="#24475c">${['Evidence','Learning curve','Connected knowledge'][i-1]}</text><path d="M60 90V350H750" fill="none" stroke="#91b5ce" stroke-width="2"/><polyline points="60,310 160,${250-i*20} 260,270 360,${220-i*22} 460,180 560,${180-i*20} 680,110 750,90" fill="none" stroke="${['#4681a9','#338f9c','#497fc3'][i-1]}" stroke-width="6"/><text x="60" y="390" font-family="Segoe UI" font-size="16" fill="#658297">Prism reading fixture ${i} / 3</text></svg>`);
        const para='Notes connect questions, evidence, and next actions. The reading experience follows the document, and every section remains a real Markdown heading.\n\n';
        mediaFile=await this.app.vault.create('Native glass and media.md',`# Glass and reading\n\n${para.repeat(3)}## Single image\n\n![[Native media 1.svg]]\n\n${para.repeat(2)}## Automatic image stack\n\n![[Native media 1.svg]]\n\n![[Native media 2.svg]]\n\n![[Native media 3.svg]]\n\n## Explicit scroll deck\n\n\`\`\`prism-deck\n![[Native media 1.svg]]\n![[Native media 2.svg]]\n![[Native media 3.svg]]\n\`\`\`\n\n## Closing section\n\n${para.repeat(7)}`);
        mediaLeaf=this.app.workspace.getLeaf('tab');await mediaLeaf.openFile(mediaFile);await mediaLeaf.setViewState({type:'markdown',state:{file:mediaFile.path,mode:'preview'},active:true});this.app.workspace.setActiveLeaf(mediaLeaf,{focus:true});await wait(800);
        const scroll=mediaLeaf.view.containerEl.querySelector('.markdown-preview-view');prism.reading.refresh();await wait(200);
        const rail=[...document.querySelectorAll('.prism-reading-rail')].find(el=>!el.hidden&&el.querySelector('[aria-label="Closing section"]'));assert(rail,'Reading heading rail missing');
        assert(rail.querySelectorAll('.prism-rail-scale').length===51,'Ruler scale missing');const r=rail.getBoundingClientRect();rail.dispatchEvent(new PointerEvent('pointermove',{clientX:r.right-3,clientY:r.top+r.height*.8}));await wait(100);assert(rail.querySelector('.prism-rail-tooltip').classList.contains('is-visible'),'Hover tooltip hidden');assert(/section|deck|stack/.test(rail.querySelector('.prism-rail-tooltip').textContent),'Hover tooltip does not show a heading');await screenshot('15-reading-ruler');
        rail.querySelector('[aria-label="Closing section"]').click();await wait(180);assert(scroll.scrollTop>500,'Heading click did not scroll');
        rail.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await wait(100);assert(scroll.scrollTop===0,'Home key failed');
        const t=rail.querySelector('.prism-rail-thumb').getBoundingClientRect();rail.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:r.right-2,clientY:t.top+4,pointerId:42}));window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.right-2,clientY:r.top+r.height*.6,pointerId:42}));window.dispatchEvent(new PointerEvent('pointerup',{pointerId:42}));await wait(150);assert(scroll.scrollTop>300,'Rail dragging failed');
        await prism.updateSettings({readingRail:false});assert(!document.querySelector('.prism-reading-rail'),'Disabled rails remain');assert(!scroll.classList.contains('prism-scroll-managed'),'Native scrollbar not restored');await prism.updateSettings({readingRail:true});
        await mediaLeaf.setViewState({type:'markdown',state:{file:mediaFile.path,mode:'source'},active:true});await wait(400);prism.reading.refresh();await wait(100);const source=mediaLeaf.view.containerEl.querySelector('.cm-scroller');assert(source.classList.contains('prism-scroll-managed'),'Source scrollbar not enhanced');
        await mediaLeaf.setViewState({type:'markdown',state:{file:mediaFile.path,mode:'preview'},active:true});await wait(600);
      });
      await check('Reading images: perspective motion, auto grouping, sticky stack, explicit deck and static fallback',async()=>{
        assert(mediaFile&&mediaLeaf,'Reading fixture missing');const scroll=mediaLeaf.view.containerEl.querySelector('.markdown-preview-view');
        scroll.scrollTop=0;await wait(300);prism.media.refresh();await wait(200);const decks=[...scroll.querySelectorAll('.prism-deck')];if(!decks.length)report.mediaDOM=scroll.innerHTML;assert(decks.some(el=>el.dataset.prismExplicit!=='true'),'Automatic deck missing');
        const img=scroll.querySelector('.prism-image-motion');assert(img,'Single image motion missing');scroll.scrollTop=0;await wait(100);const before=getComputedStyle(img).transform;scroll.scrollTop=240;await wait(150);assert(getComputedStyle(img).transform!==before,'Single image does not react to scroll');
        const deck=decks.find(el=>el.dataset.prismAuto==='true'),cards=deck.querySelectorAll('.prism-deck-card');if(cards.length!==3)report.deckCount=deck.outerHTML;assert(cards.length===3,`Auto stack did not keep all three images: ${cards.length}`);assert(getComputedStyle(deck.querySelector('.prism-deck-stage')).position==='sticky','Image stage not sticky');
        const start=deck.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop-24,step=parseFloat(deck.style.getPropertyValue('--prism-deck-step'));
        scroll.scrollTop=start;await wait(200);const transforms=[...cards].map(el=>getComputedStyle(el).transform);await screenshot('16-deck-start');
        scroll.scrollTop=start+step*.82;await wait(200);report.deckDebug={start,step,top:scroll.scrollTop,progress:deck.dataset.progress,connected:deck.isConnected,cardTransforms:[...cards].map(el=>getComputedStyle(el).transform)};assert(Number(deck.dataset.progress)>.7,'Deck scroll progress not updated');assert(getComputedStyle(cards[0]).transform!==transforms[0]&&getComputedStyle(cards[1]).transform!==transforms[1],'Images do not stack in response to scrolling');await screenshot('17-deck-transition');
        scroll.scrollTop=deck.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop-24+step*2;await wait(200);report.deckLast={top:scroll.scrollTop,progress:deck.dataset.progress,connected:deck.isConnected,caption:deck.querySelector('.prism-deck-caption')?.textContent,height:scroll.scrollHeight,deckTop:deck.getBoundingClientRect().top};assert(deck.querySelector('.prism-deck-caption').textContent.startsWith('3 / 3'),'Last card not reached');await screenshot('18-deck-stacked');
        await prism.updateSettings({imageMotion:false});assert(decks.filter(el=>el.isConnected).every(el=>el.classList.contains('is-static')),'Reduced motion setting does not flatten decks');assert(!scroll.querySelector('.prism-image-motion'),'Standalone motion remains disabled');
        await prism.updateSettings({imageDecks:false});assert(!scroll.querySelector('.prism-deck-stage'),'Deck stage not removed');assert((await this.app.vault.read(mediaFile)).match(/!\[\[/g).length===7,'Source image count changed on cleanup');
        await prism.updateSettings({imageMotion:true,imageDecks:true});await wait(200);assert(scroll.querySelector('.prism-deck-stage'),'Decks not restored after toggling');
        await this.app.workspace.openLinkText(`${mediaFile.path}#Explicit scroll deck`,mediaFile.path,false);await wait(600);assert(scroll.querySelector('[data-prism-explicit] .prism-deck-stage'),'Explicit deck missing after native heading navigation');
        await prism.floats.open(mediaFile);await wait(600);assert(document.querySelector('.prism-floating .prism-deck-stage'),'Floating note deck missing');prism.floats.closeAll(true);
        assert((await this.app.vault.read(mediaFile)).includes('## Automatic image stack'),'Source document changed');
      });
      await check('Titlebar drag band stays above tiled tabs and clears native window buttons',async()=>{
        const band=document.querySelector('.prism-titlebar-drag');assert(band,'Titlebar drag band missing');
        const style=getComputedStyle(band),box=band.getBoundingClientRect();
        const region=style.getPropertyValue('-webkit-app-region')||style.webkitAppRegion||'';
        report.dragDebug={region,height:box.height,right:box.right,width:box.width,tabGap:getComputedStyle(document.querySelector('.workspace .mod-root .workspace-tab-header-container-inner')).gap};
        assert(!region||region==='drag',`Drag band is not a drag region: ${region}`);
        assert(box.height>=10,'Drag band is thinner than the default');
        const controls=document.querySelector('.titlebar-button-container.mod-right');
        if(controls){const c=controls.getBoundingClientRect();assert(box.right<=c.left+1,`Drag band overlaps window controls: ${box.right} > ${c.left}`);}
        assert(box.top===0,'Drag band is not flush with the window top');
        const probe=document.elementFromPoint(box.left+box.width/2,2);
        assert(probe===band||band.contains(probe),`Drag band is covered by ${probe&&(probe.className||probe.tagName)}`);
        const closeButton=document.querySelector('.titlebar-button.mod-close');
        if(closeButton){const r=closeButton.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);assert(hit===closeButton||closeButton.contains(hit),`Close button is covered by ${hit&&(hit.className||hit.tagName)}`);}
        const inner=document.querySelector('.workspace .mod-root .workspace-tab-header-container-inner');
        assert(parseFloat(getComputedStyle(inner).gap)>=6,'Tab gaps are not enabled by default');
        await prism.updateSettings({titlebarDragHeight:14});await wait(150);
        assert(document.querySelector('.prism-titlebar-drag').getBoundingClientRect().height===14,'Custom drag height ignored');
        await prism.updateSettings({titlebarDragHeight:0});await wait(150);
        assert(!document.querySelector('.prism-titlebar-drag'),'Disabled drag band still mounted');
        await prism.updateSettings({titlebarDragHeight:10,tabGap:false});await wait(150);
        assert(document.querySelector('.prism-titlebar-drag'),'Drag band did not come back');
        assert(getComputedStyle(inner).gap==='normal'||parseFloat(getComputedStyle(inner).gap)===0,'Tab gaps remain after disabling');
        await prism.updateSettings({tabGap:true});await wait(150);
        assert(parseFloat(getComputedStyle(inner).gap)>=6,'Tab gaps did not return');
      });
      await check('Plugin reload restores persisted tasks, and unload removes skin and floating views',async()=>{
        await this.app.plugins.disablePlugin('prism-studio');assert(!document.body.classList.contains('prism-skin'),'Skin remains after unload');assert(!document.querySelector('#prism-dynamic-skin'),'Dynamic CSS remains after unload');assert(!document.querySelector('.prism-floating'),'Floating windows remain after unload');
        assert(!document.querySelector('.prism-reading-rail'),'Reading rails remain after unload');assert(!document.querySelector('.prism-image-motion,.prism-deck-stage'),'Media effects remain after unload');assert(!document.documentElement.classList.contains('prism-native-glass'),'Native glass remains after unload');assert(!document.querySelector('.prism-titlebar-drag'),'Titlebar drag band remains after unload');
        await this.app.plugins.enablePlugin('prism-studio');await until(()=>this.app.plugins.getPlugin('prism-studio'));prism=this.app.plugins.getPlugin('prism-studio');assert(prism.data.tasks.some(t=>t.title==='Native task edited'),'Tasks lost on reload');await prism.openStudio('home');await wait(250);await screenshot('12-final-home');
      });
      closeModals();window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.errors=errors;report.finished=new Date().toISOString();report.pass=report.checks.every(c=>c.pass)&&!errors.length;
      report.environment={vault:base,windowSize:win.getSize(),host:require('electron').ipcRenderer?'Electron':'unknown',isolated:true};save();
      if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);
    }catch(error){report.fatal={error:String(error),stack:error.stack};report.pass=false;save();}
  }
};
