import { App, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, normalizePath, type DropdownComponent } from 'obsidian';
import { Activity, Data, DEFAULT_SETTINGS, Lane, Project, Sprint, Task, completeTask, emptyActivity, emptyFileStats, localDay, markdownTaskLines, normalizeData, sanitizeFolder, stripControlChars, wordDelta } from './model';
import { STUDIO_VIEW, StudioView } from './view';
import { CaptureModal, NotePicker, TaskModal, ManageModal, HomeLayoutModal } from './modals';
import { FloatingNotes } from './floating';
import { NativeGlass } from './glass';
import { WindowPin } from './window-pin';
import { TitlebarDrag } from './titlebar-drag';
import { ReadingEnhancements } from './reading';
import { MediaEffects } from './media';
import { PALETTES, PALETTE_OPTIONS, MATERIAL_OPTIONS, tokenDeclarations } from './appearance';
import { UI_FONTS, NOTE_FONTS, UI_FONT_OPTIONS, NOTE_FONT_OPTIONS, NOTE_FONT_SIZE_MIN, NOTE_FONT_SIZE_MAX, adjustNoteFontSize, fontFaceRules, noteFontFamily, typographyRules } from './typography';

type Snapshot = Pick<Data,'tasks'|'projects'|'sprints'> & {counts:Record<string,number>;syncedIds:string[];fileChange?:{path:string;before:string;after:string;created:boolean}};
export default class PrismPlugin extends Plugin {
  data!: Data;
  floats!: FloatingNotes;
  glass=new NativeGlass();
  windowPin=new WindowPin();
  titlebarDrag=new TitlebarDrag();
  reading!: ReadingEnhancements;
  media!: MediaEffects;
  private subscribers=new Set<()=>void>();
  private documents=new Set<Document>();
  private writeQueue: Promise<void>=Promise.resolve();
  private history: Snapshot[]=[];
  private taskLocks=new Set<string>();
  private generatingActions=false;
  private baselines=new Map<string,string>();
  private fileQueue=new Map<string,Promise<void>>();
  private lastEdit=0;
  private lastSession=0;
  private tickTime=Date.now();
  private active=true;
  focusStarted=0;
  focusSeconds=0;
  status!: HTMLElement;

  async onload(): Promise<void> {
    this.data=normalizeData(await this.loadData() as Partial<Data>|null|undefined);
    this.reading=new ReadingEnhancements(this);this.media=new MediaEffects(this);
    this.floats=new FloatingNotes(this);
    this.registerView(STUDIO_VIEW,leaf=>new StudioView(leaf,this));
    this.addRibbonIcon('panels-top-left','Prism Studio',()=>void this.openStudio('home'));
    this.addRibbonIcon('layers','Prism Studio · 浮动笔记',()=>new NotePicker(this.app,file=>void this.floats.open(file)).open());
    this.addCommand({id:'open-home',name:'打开内容工作台',callback:()=>void this.openStudio('home')});
    this.addCommand({id:'customize-home',name:'自定义工作台组件',callback:()=>new HomeLayoutModal(this).open()});
    this.addCommand({id:'open-tasks',name:'打开任务管理',callback:()=>void this.openStudio('tasks')});
    this.addCommand({id:'open-pulse',name:'打开活动统计',callback:()=>void this.openStudio('pulse')});
    this.addCommand({id:'new-task',name:'新建任务',callback:()=>this.newTask()});
    this.addCommand({id:'quick-capture',name:'快速收集笔记',callback:()=>new CaptureModal(this).open()});
    this.addCommand({id:'daily-note',name:'打开今天的日记',callback:()=>void this.dailyNote()});
    this.addCommand({id:'generate-actions',name:'从待整理与复核笔记生成下一批行动',callback:()=>void this.generateActions()});
    this.addCommand({id:'open-now',name:'打开 Now 行动清单',callback:()=>void this.openNow()});
    this.addCommand({id:'float-note',name:'浮动显示当前笔记',checkCallback:checking=>{
      const file=this.app.workspace.getActiveFile();if(!file || file.extension!=='md')return false;
      if(!checking)void this.floats.open(file);return true;
    }});
    this.addCommand({id:'choose-floating-note',name:'选择浮动笔记',callback:()=>new NotePicker(this.app,file=>void this.floats.open(file)).open()});
    this.addCommand({id:'arrange-floating-notes',name:'层叠排列浮动笔记',callback:()=>this.floats.arrange()});
    this.addCommand({id:'close-floating-notes',name:'关闭所有浮动笔记',callback:()=>this.floats.closeAll()});
    this.addCommand({id:'toggle-skin',name:'切换柔光主题皮肤',callback:()=>void this.updateSettings({enabled:!this.data.settings.enabled})});
    this.addCommand({id:'toggle-window-pin',name:'切换窗口置顶',checkCallback:checking=>{
      if(!Platform.isDesktopApp)return false;
      if(!checking)this.windowPin.toggle(activeDocument);return true;
    }});
    this.addCommand({id:'cycle-palette',name:'切换主题配色',callback:()=>this.cyclePalette()});
    this.addCommand({id:'restore-glass',name:'重置玻璃参数',callback:()=>void this.restoreGlass()});
    this.addCommand({id:'import-tasks',name:'从当前笔记导入 Markdown 任务',checkCallback:checking=>{
      const file=this.app.workspace.getActiveFile();if(!file || file.extension!=='md')return false;
      if(!checking)void this.importTasks(file);return true;
    }});
    this.addCommand({id:'export-tasks',name:'导出任务到 Markdown',callback:()=>void this.exportTasks()});
    this.addCommand({id:'toggle-focus',name:'开始或结束专注记录',callback:()=>this.toggleFocus()});
    this.addSettingTab(new PrismSettings(this.app,this));
    this.status=this.addStatusBarItem();this.updateStatus();
    this.status.addClass('prism-status');this.registerDomEvent(this.status,'click',()=>void this.openStudio('pulse'));
    this.applySkin(document);
    this.registerEvent(this.app.workspace.on('window-open',(_win,win)=>this.applySkin(win.document)));
    this.registerEvent(this.app.workspace.on('layout-change',()=>this.app.workspace.iterateAllLeaves(leaf=>this.applySkin(leaf.view.containerEl.ownerDocument))));
    this.registerEvent(this.app.workspace.on('css-change',()=>this.refreshSkin()));
    this.registerEvent(this.app.workspace.on('editor-change',()=>{
      if(!this.data.settings.recordActivity)return;
      const now=Date.now();this.lastEdit=now;
      if(now-this.lastSession>5*60*1000){this.today().sessions++;void this.save();}
      this.lastSession=now;
    }));
    this.registerEvent(this.app.vault.on('create',file=>{if(file instanceof TFile && file.extension==='md')void this.trackFile(file,true);}));
    this.registerEvent(this.app.vault.on('modify',file=>{if(file instanceof TFile && file.extension==='md')void this.trackFile(file,false);}));
    this.registerEvent(this.app.workspace.on('file-open',file=>{if(file instanceof TFile && file.extension==='md')this.trackOpen(file);}));
    this.registerEvent(this.app.metadataCache.on('changed',()=>this.notify()));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
      const baseline=this.baselines.get(oldPath);if(baseline!==undefined){this.baselines.set(file.path,baseline);this.baselines.delete(oldPath);}
      for(const task of this.data.tasks){if(task.notePath===oldPath)task.notePath=file.path;if(task.source?.path===oldPath)task.source.path=file.path;}
      for(const day of Object.values(this.data.activity))if(day.notes[oldPath]){day.notes[file.path]=day.notes[oldPath];delete day.notes[oldPath];}
      if(this.data.fileStats[oldPath]){this.data.fileStats[file.path]=this.data.fileStats[oldPath];delete this.data.fileStats[oldPath];}
      if(this.data.drafts[oldPath]){this.data.drafts[file.path]=this.data.drafts[oldPath];delete this.data.drafts[oldPath];}
      void this.save();this.notify();
    }));
    this.registerEvent(this.app.vault.on('delete',file=>{this.baselines.delete(file.path);delete this.data.fileStats[file.path];this.notify();}));
    this.registerInterval(window.setInterval(()=>this.tick(),15000));
    this.app.workspace.onLayoutReady(()=>{
      void this.initializeBaselines();
      if(this.data.settings.homeOnStartup)void this.openStudio('home');
    });
  }
  onunload(): void {
    this.active=false;
    this.floats.closeAll(true);
    this.reading.destroy();this.media.destroy();this.glass.destroy();this.windowPin.destroy();this.titlebarDrag.destroy();
    for(const doc of this.documents){doc.body.classList.remove('prism-skin','prism-note-wheel-zoom','prism-media-decks');delete doc.body.dataset.prismMaterial;delete doc.body.dataset.prismPalette;doc.getElementById('prism-dynamic-skin')?.remove();doc.getElementById('prism-font-faces')?.remove();}
    this.documents.clear();this.subscribers.clear();
  }
  async initializeBaselines(): Promise<void> {
    const files=this.app.vault.getMarkdownFiles();
    // Small batches avoid saturating a large vault. Never replace a baseline updated by an event.
    for(let i=0;i<files.length && this.active;i+=12)await Promise.all(files.slice(i,i+12).map(async file=>{
      try{const content=await this.app.vault.cachedRead(file);if(!this.baselines.has(file.path))this.baselines.set(file.path,content);}catch{/* File can disappear during startup. */}
    }));
  }
  async trackFile(file:TFile,created:boolean): Promise<void> {
    const previous=this.fileQueue.get(file.path)||Promise.resolve();
    const work=previous.catch(()=>undefined).then(async()=>{
      if(!this.active)return;
      const content=await this.app.vault.read(file);
      const before=this.baselines.get(file.path);
      this.baselines.set(file.path,content);
      let bumped=false;
      if(!created && before!==undefined && content!==before){
        const stats=this.data.fileStats[file.path] ||= emptyFileStats();
        stats.edits++;stats.lastEdited=Date.now();bumped=true;
      }
      if(!this.data.settings.recordActivity || (!created && before===undefined)){if(bumped){await this.save();this.notify();}return;}
      const delta=wordDelta(before??'',content);
      const day=this.today();
      const entry=day.notes[file.path] ||= {added:0,revised:0,created:false,edits:0};
      entry.added+=delta.added;entry.revised+=delta.revised;entry.created ||= created;
      if(content!==before)entry.edits++;
      const oldLinks=(before||'').match(/\[\[[^\]]+\]\]/g)||[];
      const newLinks=content.match(/\[\[[^\]]+\]\]/g)||[];
      day.links+=Math.max(0,newLinks.length-oldLinks.length);
      await this.save();this.notify();
    }).catch(error=>console.warn('Prism: activity recording skipped',error));
    this.fileQueue.set(file.path,work);await work;if(this.fileQueue.get(file.path)===work)this.fileQueue.delete(file.path);
  }
  today(): Activity {return this.data.activity[localDay()] ||= emptyActivity();}
  trackOpen(file:TFile): void {
    const stats=this.data.fileStats[file.path] ||= emptyFileStats();
    stats.opens++;stats.lastOpened=Date.now();
    void this.save();this.notify();
  }
  tick(): void {
    const now=Date.now(),elapsed=Math.min(15,(now-this.tickTime)/1000);this.tickTime=now;
    if(this.data.settings.recordActivity && !document.hidden){
      let changed=false;
      if(now-this.lastEdit<60000){this.today().seconds+=elapsed;changed=true;}
      if(this.focusStarted){this.today().focusSeconds+=elapsed;this.focusSeconds+=elapsed;changed=true;}
      if(changed){void this.save();this.notify();}
    }
    this.updateStatus();
  }
  toggleFocus(): void {
    if(!this.data.settings.recordActivity){new Notice('请先在设置中开启活动记录。');return;}
    this.focusStarted=this.focusStarted?0:Date.now();this.focusSeconds=0;this.tickTime=Date.now();
    this.updateStatus();this.notify();new Notice(this.focusStarted?'专注记录已开始，窗口隐藏时暂停计时。':'专注记录已结束。');
  }
  updateStatus(): void {this.status.setText(this.focusStarted?`Prism Studio · 专注 ${Math.floor(this.focusSeconds/60)} 分钟`:'Prism Studio');}
  subscribe(callback:()=>void):()=>void {this.subscribers.add(callback);return ()=>this.subscribers.delete(callback);}
  notify(): void {for(const callback of this.subscribers)callback();}
  async save(): Promise<void> {
    const snapshot=JSON.parse(JSON.stringify(this.data)) as Data;
    const job=this.writeQueue.catch(()=>undefined).then(()=>this.saveData(snapshot));this.writeQueue=job;
    try{await job;}catch(error){new Notice('Prism 保存失败，请检查知识库是否可写。');console.error(error);throw error;}
  }
  async updateSettings(values: Partial<Data['settings']>): Promise<void> {
    this.data.settings=normalizeData({settings:{...this.data.settings,...values}}).settings;
    if(!this.data.settings.recordActivity)this.focusStarted=0;
    this.refreshSkin();await this.save();this.notify();this.updateStatus();
    this.media.refresh();this.reading.refresh();
  }
  private attachNoteWheelZoom(doc:Document):void {
    const onWheel=(event:WheelEvent)=>{
      if(!this.data.settings.noteWheelZoom || !event.ctrlKey || event.altKey || event.shiftKey || !event.deltaY)return;
      const target=event.target as Element|null;
      if(!target?.closest?.('.workspace-leaf-content[data-type="markdown"]'))return;
      if(!target.closest('.markdown-source-view .cm-scroller, .markdown-reading-view .markdown-preview-view'))return;
      event.preventDefault();
      const size=adjustNoteFontSize(this.data.settings.fontSize,event.deltaY);
      if(size!==this.data.settings.fontSize)void this.updateSettings({fontSize:size});
    };
    doc.addEventListener('wheel',onWheel,{capture:true,passive:false});
    this.register(()=>doc.removeEventListener('wheel',onWheel,true));
  }
  applySkin(doc:Document): void {
    if(!doc.defaultView || doc.defaultView.closed)return;
    this.windowPin.attach(doc);
    if(!this.documents.has(doc)){this.documents.add(doc);this.attachNoteWheelZoom(doc);}
    doc.body.classList.toggle('prism-skin',this.data.settings.enabled);
    doc.body.classList.toggle('prism-note-wheel-zoom',this.data.settings.noteWheelZoom && !this.data.settings.enabled);
    doc.body.classList.toggle('prism-media-decks',this.data.settings.imageDecks);
    const s=this.data.settings;
    doc.body.classList.toggle('prism-tab-gap',s.tabGap);
    this.titlebarDrag.attach(doc,s.titlebarDragHeight);
    doc.body.dataset.prismMaterial=s.material;doc.body.dataset.prismPalette=s.palette;
    this.glass.apply(doc,s.enabled && s.nativeGlass && s.material!=='solid',s.material);
    this.reading.attach(doc);this.media.attach(doc);
    // Kept on createElement: createEl('style') is rejected by the no-forbidden-elements review rule.
    let style=doc.getElementById('prism-dynamic-skin');
    if(!style){style=doc.createElement('style');style.id='prism-dynamic-skin';doc.head.appendChild(style);}
    if(!doc.getElementById('prism-font-faces')){
      const fonts=doc.createElement('style');fonts.id='prism-font-faces';
      const dir=this.manifest.dir||normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
      fonts.textContent=fontFaceRules(file=>this.app.vault.adapter.getResourcePath(normalizePath(`${dir}/fonts/${file}`)));
      doc.head.appendChild(fonts);
    }
    let background='none';
    const file=this.app.vault.getAbstractFileByPath(s.backgroundPath);
    if(file instanceof TFile && /^(png|jpg|jpeg|webp|gif|avif)$/i.test(file.extension)) background=`url(${JSON.stringify(this.app.vault.getResourcePath(file))})`;
    const rules=`body.prism-skin, .prism-view, .prism-floating, .prism-modal {${tokenDeclarations(s)}--prism-strength:${s.intensity/100};--prism-opacity:${s.opacity/100};--prism-blur:${s.blur}px;--prism-radius:${s.radius}px;--prism-note-size:${s.fontSize}px;--prism-line-height:${s.lineHeight};--prism-note-width:${s.noteWidth}px;--prism-wallpaper:${background};}
    body.theme-dark.prism-skin, .theme-dark .prism-view, .theme-dark .prism-floating, .theme-dark .prism-modal {${tokenDeclarations(s,true)}}
    body.prism-note-wheel-zoom .workspace-leaf-content[data-type="markdown"] {--prism-note-size:${s.fontSize}px;--font-text-size:var(--prism-note-size);}${typographyRules(s)}`;
    if(style.textContent!==rules)style.textContent=rules;
  }
  refreshSkin(): void {for(const doc of this.documents){if(!doc.defaultView || doc.defaultView.closed){this.documents.delete(doc);continue;}this.applySkin(doc);}}
  cyclePalette():void {
    const palettes=Object.keys(PALETTES) as Array<Data['settings']['palette']>;
    void this.updateSettings({palette:palettes[(palettes.indexOf(this.data.settings.palette)+1)%palettes.length]});
  }
  async restoreGlass():Promise<void> {
    await this.updateSettings({enabled:true,nativeGlass:true,material:'glass',intensity:35,opacity:42,blur:20});
    new Notice('玻璃参数已重置，保留当前配色、字号和数据。');
  }
  async openStudio(tab:'home'|'tasks'|'pulse'):Promise<void>{
    let leaf=this.app.workspace.getLeavesOfType(STUDIO_VIEW)[0];
    if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:STUDIO_VIEW,active:true,state:{tab}});}
    await this.app.workspace.revealLeaf(leaf);this.app.workspace.setActiveLeaf(leaf);if(leaf.view instanceof StudioView)leaf.view.selectTab(tab);
  }
  newTask(lane:Lane='inbox'):TaskModal {const modal=new TaskModal(this,undefined,lane);modal.open();return modal;}
  editTask(task:Task):TaskModal {const modal=new TaskModal(this,task);modal.open();return modal;}
  manage(kind:'projects'|'sprints'):ManageModal {const modal=new ManageModal(this,kind);modal.open();return modal;}
  remember(syncedIds:string[]=[],fileChange?:Snapshot['fileChange']):void {
    this.history.push(JSON.parse(JSON.stringify({tasks:this.data.tasks,projects:this.data.projects,sprints:this.data.sprints,syncedIds,fileChange,counts:Object.fromEntries(Object.entries(this.data.activity).map(([k,v])=>[k,v.tasks]))})) as Snapshot);
    if(this.history.length>30)this.history.shift();
  }
  canUndo():boolean {return this.history.length>0;}
  async undo():Promise<void>{
    const snapshot=this.history[this.history.length-1];if(!snapshot)return;
    if(snapshot.fileChange){
      const change=snapshot.fileChange;const file=this.app.vault.getAbstractFileByPath(change.path);
      if(!(file instanceof TFile))throw new Error('Now 清单已不存在，无法撤销本次生成。');
      const content=await this.app.vault.read(file);if(content!==change.after)throw new Error('Now 清单已在别处修改，本次生成无法自动撤销。');
      if(change.created)await this.app.fileManager.trashFile(file);else await this.app.vault.process(file,current=>{if(current!==change.after)throw new Error('Now 清单已变化，撤销已停止。');return change.before;});
    }
    // Restore linked checkboxes before restoring local data; conflicts leave history available.
    for(const id of snapshot.syncedIds){const current=this.data.tasks.find(t=>t.id===id);const target=snapshot.tasks.find(t=>t.id===id);if(current?.source && target?.source){const synced=structuredClone(current);await this.syncCheckbox(synced,target.lane==='done');target.source=synced.source;}}
    this.history.pop();this.data.tasks=snapshot.tasks;this.data.projects=snapshot.projects;this.data.sprints=snapshot.sprints;
    for(const [day,entry] of Object.entries(this.data.activity))entry.tasks=snapshot.counts[day]||0;
    await this.save();this.notify();
  }
  async putTask(task:Task):Promise<void>{
    this.remember();const index=this.data.tasks.findIndex(t=>t.id===task.id);
    if(index<0)this.data.tasks.push(task);else this.data.tasks[index]=task;
    await this.save();this.notify();
  }
  async moveTask(id:string,lane:Lane):Promise<void>{
    const task=this.data.tasks.find(t=>t.id===id);if(!task || task.lane===lane)return;
    if(task.lane==='done' || lane==='done'){await this.setComplete(id,lane==='done',lane);return;}
    const current=this.data.tasks.find(t=>t.id===id)!;this.remember();current.lane=lane;await this.save();this.notify();
  }
  async setComplete(id:string,done:boolean,returnLane?:Lane):Promise<boolean>{
    const index=this.data.tasks.findIndex(t=>t.id===id);if(index<0 || this.taskLocks.has(id))return false;
    const task=this.data.tasks[index];if((task.lane==='done')===done)return true;
    this.taskLocks.add(id);const synced=structuredClone(task);
    try{await this.syncCheckbox(synced,done);}catch(error){this.taskLocks.delete(id);new Notice(String(error));return false;}
    this.remember(task.source?[id]:[]);const completed=completeTask(synced,done);if(!done && returnLane && returnLane!=='done')completed.lane=returnLane;
    const currentIndex=this.data.tasks.findIndex(t=>t.id===id);if(currentIndex<0){this.taskLocks.delete(id);return false;}this.data.tasks[currentIndex]=completed;
    if(done && this.data.settings.recordActivity)this.today().tasks++;
    else if(!done && task.completedAt){const day=this.data.activity[localDay(task.completedAt)];if(day)day.tasks=Math.max(0,day.tasks-1);}
    try{await this.save();this.notify();return true;}finally{this.taskLocks.delete(id);}
  }
  async syncCheckbox(task:Task,done:boolean):Promise<void>{
    if(!task.source)return;
    const source=task.source;const file=this.app.vault.getAbstractFileByPath(source.path);
    if(!(file instanceof TFile))throw new Error('关联笔记已删除。请解除关联后再操作。');
    let changedLine=source.line,changedText=source.text;
    await this.app.vault.process(file,content=>{
      const newline=content.includes('\r\n')?'\r\n':'\n';const lines=content.split(/\r?\n/);
      if(lines[changedLine]!==source.text){const matches=lines.flatMap((line,i)=>line===source.text?[i]:[]);if(matches.length!==1)throw new Error('原任务已被修改或存在重复，请从该笔记重新导入。');changedLine=matches[0];}
      changedText=lines[changedLine].replace(/^(\s*[-*+]\s+\[)[ xX](\])/,(full,a,b)=>`${a}${done?'x':' '}${b}`);
      lines[changedLine]=changedText;return lines.join(newline);
    });
    source.line=changedLine;source.text=changedText;
  }
  async deleteTask(id:string):Promise<void>{this.remember();this.data.tasks=this.data.tasks.filter(t=>t.id!==id);await this.save();this.notify();}
  async setProjects(projects:Project[]):Promise<void>{this.remember();this.data.projects=projects;for(const t of this.data.tasks)if(!projects.some(p=>p.id===t.projectId))t.projectId='';await this.save();this.notify();}
  async setSprints(sprints:Sprint[]):Promise<void>{this.remember();this.data.sprints=sprints;for(const t of this.data.tasks)if(!sprints.some(s=>s.id===t.sprintId))t.sprintId='';await this.save();this.notify();}
  async importTasks(file:TFile):Promise<void>{
    const content=await this.app.vault.read(file),lines=content.split(/\r?\n/),parsed=markdownTaskLines(content);this.remember();let added=0;const used=new Set<string>();
    for(const row of parsed){
      const text=lines[row.line];
      const candidates=this.data.tasks.filter(t=>!used.has(t.id) && t.source?.path===file.path && t.source.text===text);
      let existing=candidates.find(t=>t.source?.line===row.line);
      if(!existing && candidates.length===1)existing=candidates[0];
      if(!existing && candidates.length)existing=candidates[0];
      if(!existing)existing=this.data.tasks.find(t=>!used.has(t.id) && t.source?.path===file.path && t.source.line===row.line);
      const lane:Lane=row.done?'done':existing?.lane==='done'?'inbox':existing?.lane||'inbox';
      const task:Task={id:existing?.id||crypto.randomUUID(),title:row.title,description:existing?.description||'',lane,priority:row.priority,projectId:existing?.projectId||'',sprintId:existing?.sprintId||'',due:row.due,notePath:file.path,createdAt:existing?.createdAt||Date.now(),inProgress:existing?.inProgress||false,source:{path:file.path,line:row.line,text}};
      if(row.done && existing?.completedAt)task.completedAt=existing.completedAt;
      if(existing?.autoAction)task.autoAction=existing.autoAction;
      if(existing)this.data.tasks[this.data.tasks.indexOf(existing)]=task;else{this.data.tasks.push(task);added++;}
      used.add(task.id);
    }
    this.data.tasks=this.data.tasks.filter(t=>t.source?.path!==file.path || used.has(t.id));
    await this.save();this.notify();new Notice(`已导入 ${parsed.length} 项任务，其中 ${added} 项新增。完成状态与原笔记同步。`);
  }
  async ensureFolder(path:string):Promise<void>{
    const parts=sanitizeFolder(path).split('/').filter(Boolean);let folder='';
    for(const part of parts){folder=folder?`${folder}/${part}`:part;if(!this.app.vault.getAbstractFileByPath(folder)){try{await this.app.vault.createFolder(folder);}catch(error){if(!this.app.vault.getAbstractFileByPath(folder))throw error;}}}
  }
  async uniqueNote(folder:string,title:string,content:string):Promise<TFile>{
    const safeFolder=sanitizeFolder(folder);await this.ensureFolder(safeFolder);
    const clean=stripControlChars(title.trim()).replace(/[<>:"/\\|?*]/g,'-').replace(/[. ]+$/g,'').slice(0,120)||'未命名';
    let path=normalizePath(`${safeFolder}/${clean}.md`),suffix=1;
    while(this.app.vault.getAbstractFileByPath(path))path=normalizePath(`${safeFolder}/${clean} ${++suffix}.md`);
    const file=await this.app.vault.create(path,content);await this.app.workspace.getLeaf('tab').openFile(file);return file;
  }
  async dailyNote():Promise<void>{
    const path=normalizePath(`${this.data.settings.dailyFolder}/${localDay()}.md`);const existing=this.app.vault.getAbstractFileByPath(path);
    if(existing instanceof TFile){await this.app.workspace.getLeaf('tab').openFile(existing);return;}
    await this.uniqueNote(this.data.settings.dailyFolder,localDay(),`---\ntags: [daily]\n---\n# ${localDay()}\n\n## 今日计划\n\n- [ ] \n\n## 记录\n\n## 复盘\n`);
  }
  async generateActions():Promise<void>{
    if(this.generatingActions)return;this.generatingActions=true;
    try{
      const candidates=this.getFiles().flatMap(file=>{
        const fm=this.app.metadataCache.getFileCache(file)?.frontmatter;const status=String(fm?.status||fm?.review_status||'').toLowerCase();
        const kind: 'review'|'inbox'|'project'|undefined=['review','reviewing','待复核','内容待回写','待回写'].includes(status)?'review':file.path.startsWith(this.data.settings.captureFolder+'/')||['inbox','待整理'].includes(status)?'inbox':fm?.project||['project','active','复盘'].includes(status)?'project':undefined;
        if(!kind || file.path==='Prism/Actions/Now.md')return [];
        if(this.data.tasks.some(t=>t.notePath===file.path && t.autoAction?.kind===kind && (t.lane!=='done' || t.autoAction.mtime===file.stat.mtime)))return [];
        return [{file,kind}];
      }).sort((a,b)=>a.file.stat.mtime-b.file.stat.mtime).slice(0,10);
      if(!candidates.length){new Notice('没有新的待整理或待复核笔记。已有行动不会重复生成。');return;}
      const tasks:Task[]=candidates.map(({file,kind})=>({id:crypto.randomUUID(),title:`${{review:'复核',inbox:'整理',project:'复盘'}[kind]} ${file.basename}`,description:`由内容工作台生成。来源：${file.path}`,lane:'next',priority:'none',projectId:'',sprintId:'',due:'',notePath:file.path,createdAt:Date.now(),inProgress:false,autoAction:{kind,mtime:file.stat.mtime}}));
      await this.ensureFolder('Prism/Actions');const path='Prism/Actions/Now.md';const existing=this.app.vault.getAbstractFileByPath(path);
      let before='',after='';
      const append=(content:string):string=>{
        before=content;
        const newline=content.includes('\r\n')?'\r\n':'\n';let updated=content;if(updated && !updated.endsWith(newline))updated+=newline;
        if(!updated)updated=`# Now · 当前行动${newline}${newline}`;
        updated+=`${newline}## ${localDay()} · 下一批行动${newline}${newline}`;
        for(const task of tasks){const line=updated.split(/\r?\n/).length-1;const text=`- [ ] ${task.title} [[${task.notePath.replace(/\.md$/,'')}]]`;task.source={path,line,text};updated+=text+newline;}after=updated;return updated;
      };
      if(existing instanceof TFile)await this.app.vault.process(existing,append);else await this.app.vault.create(path,append(''));
      this.remember([],{path,before,after,created:!(existing instanceof TFile)});this.data.tasks.push(...tasks);await this.save();this.notify();new Notice(`已生成 ${tasks.length} 项行动，并追加到 Now 清单。`);
    }catch(error){new Notice(`生成行动失败：${String(error)}`);}finally{this.generatingActions=false;}
  }
  async openNow():Promise<void>{
    const path='Prism/Actions/Now.md';let file=this.app.vault.getAbstractFileByPath(path);
    if(!file){await this.ensureFolder('Prism/Actions');file=await this.app.vault.create(path,'# Now · 当前行动\n\n从内容工作台生成下一批行动，或在这里直接记录 Markdown 任务。\n');}
    if(file instanceof TFile)await this.app.workspace.getLeaf('tab').openFile(file);
  }
  async exportTasks():Promise<void>{
    const output=['# Prism 任务导出','',`导出日期：${localDay()}`,''];
    for(const project of [{id:'',name:'未分配项目'},...this.data.projects]){
      const tasks=this.data.tasks.filter(t=>t.projectId===project.id);if(!tasks.length)continue;
      output.push(`## ${project.name}`,'');for(const task of tasks)output.push(`- [${task.lane==='done'?'x':' '}] ${task.title.replace(/\n/g,' ')}${task.due?` 📅 ${task.due}`:''}${task.notePath?` [[${task.notePath.replace(/\.md$/,'')}]]`:''}`,`  - 状态：${task.lane} · 优先级：${task.priority}${task.description?`\n  - ${task.description.replace(/\n/g,'\n    ')}`:''}`);output.push('');
    }
    await this.uniqueNote('Prism/Exports',`Tasks-${localDay()}`,output.join('\n'));new Notice('任务已导出为 Markdown。');
  }
  openFile(path:string):void {const file=this.app.vault.getAbstractFileByPath(path);if(file instanceof TFile)void this.app.workspace.getLeaf('tab').openFile(file);else new Notice('这篇笔记已不存在。');}
  getFiles():TFile[]{return this.app.vault.getMarkdownFiles().sort((a,b)=>b.stat.mtime-a.stat.mtime);}
}

class PrismSettings extends PluginSettingTab {
  constructor(app:App,private plugin:PrismPlugin){super(app,plugin);}
  display():void{
    const el=this.containerEl;this.plugin.applySkin(el.ownerDocument);el.empty();new Setting(el).setName('外观与工作台').setHeading();
    el.createEl('p',{text:'配色与质感可独立搭配。按钮、滚动条与浮动笔记跟随配色。任务和统计保存在本插件的 data.json 中。',cls:'setting-item-description'});
    const s=this.plugin.data.settings;
    new Setting(el).setName('全局柔光皮肤').setDesc('应用到编辑器、文件列表、标签页和原生窗口。').addToggle(c=>c.setValue(s.enabled).onChange(v=>void this.plugin.updateSettings({enabled:v})));
    let paletteDropdown:DropdownComponent;
    const paletteButtons=new Map<Data['settings']['palette'],HTMLButtonElement>();
    const choosePalette=async(value:Data['settings']['palette'])=>{
      await this.plugin.updateSettings({palette:value});paletteDropdown.setValue(value);
      for(const [key,button] of paletteButtons){button.classList.toggle('is-selected',key===value);button.setAttribute('aria-pressed',String(key===value));}
    };
    new Setting(el).setName('主题配色').setDesc('选择配色，或点击下方色卡。').addDropdown(c=>{paletteDropdown=c;c.addOptions(PALETTE_OPTIONS).setValue(s.palette).onChange(v=>void choosePalette(v as typeof s.palette));});
    const library=el.createDiv({cls:'prism-palette-library',attr:{'aria-label':'主题配色库'}});
    for(const key of Object.keys(PALETTES) as Array<Data['settings']['palette']>){
      const palette=PALETTES[key],selected=key===s.palette;
      const button=library.createEl('button',{cls:`prism-palette-chip${selected?' is-selected':''}`,attr:{type:'button','aria-label':`选择${palette.name}配色`,'aria-pressed':String(selected),'data-prism-palette-choice':key}});
      const swatch=button.createSpan({cls:'prism-palette-swatch',attr:{'aria-hidden':'true'}});
      swatch.style.background=palette.gradient?`linear-gradient(135deg,rgb(${palette.tint}),rgb(${palette.secondary}),rgb(${palette.tertiary}))`:`rgb(${palette.tint})`;
      button.createSpan({text:palette.name});button.addEventListener('click',()=>void choosePalette(key));paletteButtons.set(key,button);
    }
    const materialStatus=()=>this.plugin.data.settings.material==='solid'?'当前为纯色质感，桌面透视暂停；切回透明质感会按开关恢复。':this.plugin.glass.status.get(el.ownerDocument)||'原生玻璃已关闭，使用知识库背景或主题底色。';
    const status=el.createEl('p',{text:materialStatus(),cls:'setting-item-description prism-glass-status'});
    new Setting(el).setName('界面质感').setDesc('玻璃通透轻盈；亚克力浓色柔润；毛玻璃乳白磨砂；柔焦轻染色、强模糊；纯色不透明。').addDropdown(c=>c.addOptions(MATERIAL_OPTIONS).setValue(s.material).onChange(async v=>{await this.plugin.updateSettings({material:v as typeof s.material});status.setText(materialStatus());}));
    const preview=el.createDiv({cls:'prism-material-preview',attr:{'aria-label':'材质预览'}});
    preview.createDiv({cls:'prism-material-preview-background',text:'Aa · 01 · 阅读'});
    const sample=preview.createDiv({cls:'prism-material-preview-surface'});sample.createEl('strong',{text:'材质预览'});sample.createSpan({text:'切换质感，观察透光、雾面与颗粒。'});
    new Setting(el).setName('重置玻璃参数').setDesc('恢复默认染色、不透明度与模糊。保留当前配色、字号、任务与统计。').addButton(c=>c.setButtonText('重置参数').onClick(async()=>{await this.plugin.restoreGlass();this.display();}));
    new Setting(el).setName('原生桌面玻璃').setDesc('透明质感在 Windows 11 22H2+ 共用系统 Acrylic，macOS 共用原生玻璃；质感差异作用于 UI 面板，桌面模糊由 OS 控制。纯色模式暂停透视。').addToggle(c=>c.setValue(s.nativeGlass).onChange(async v=>{await this.plugin.updateSettings({nativeGlass:v});this.display();}));
    const sliders:[keyof typeof s,string,number,number,number][]=[['intensity','背景染色强度',0,100,5],['opacity','面板不透明度（磨砂质感保留基础雾感）',15,100,5],['blur','面板模糊强度（磨砂质感保留基础模糊）',0,40,2],['radius','面板圆角',0,24,1]];
    for(const [key,label,min,max,step] of sliders)new Setting(el).setName(label).addSlider(c=>c.setLimits(min,max,step).setValue(s[key] as number).setDynamicTooltip().onChange(v=>void this.plugin.updateSettings({[key]:v})));
    this.typography(el);
    new Setting(el).setName('备用背景图片').setDesc('知识库内图片路径；留空直接使用原生桌面玻璃。图片不会自动伪装成桌面透视。').addText(c=>c.setValue(s.backgroundPath).setPlaceholder('Assets/wallpaper.jpg').onChange(v=>void this.plugin.updateSettings({backgroundPath:v.trim()})));
    new Setting(el).setName('窗口拖动热区').setDesc('标签页铺满标题栏后，能拖动的位置只剩几像素。这里在窗口最上方留一条隐形热区，任何标签数量下都能拖动；双击可最大化或还原，右侧窗口按钮不受影响。').addDropdown(c=>c.addOptions({'0':'关闭','8':'8 px（保守）','10':'10 px（默认）','14':'14 px（宽松）'}).setValue(String(s.titlebarDragHeight)).onChange(v=>void this.plugin.updateSettings({titlebarDragHeight:Number(v)})));
    new Setting(el).setName('标签页间隙').setDesc('在标签之间留 6 px 空隙，每条缝隙都能拖动窗口，同时让标签更透气。').addToggle(c=>c.setValue(s.tabGap).onChange(v=>void this.plugin.updateSettings({tabGap:v})));
    new Setting(el).setName('章节滚动条').setDesc('阅读与编辑视图显示刻度、章节标记和悬浮小标题。支持拖动、点击刻度及键盘定位。').addToggle(c=>c.setValue(s.readingRail).onChange(v=>void this.plugin.updateSettings({readingRail:v})));
    new Setting(el).setName('图片滚动动效').setDesc('单图带轻微透视入场；多图卡片随滚动进场、缩小和堆叠。尊重系统减少动画设置。').addToggle(c=>c.setValue(s.imageMotion).onChange(v=>void this.plugin.updateSettings({imageMotion:v})));
    new Setting(el).setName('图片堆叠').setDesc('阅读视图中的连续图片自动组成层叠卡组，同一行多张图片也可识别；支持 prism-deck。淡色图标可展开或收起，关闭动效时平铺显示。').addToggle(c=>c.setValue(s.imageDecks).onChange(v=>void this.plugin.updateSettings({imageDecks:v})));
    new Setting(el).setName('图片卡片比例').setDesc('原比例叠放完整保留图片内容；铺满卡片会居中裁切。展开后两种模式都显示完整原图。').addDropdown(c=>c.addOptions({natural:'原比例叠放',cover:'铺满卡片'}).setValue(s.imageFit).onChange(v=>void this.plugin.updateSettings({imageFit:v as typeof s.imageFit})));
    new Setting(el).setName('启动时打开工作台').addToggle(c=>c.setValue(s.homeOnStartup).onChange(v=>void this.plugin.updateSettings({homeOnStartup:v})));
    new Setting(el).setName('工作台组件').setDesc('自由选择各分区显示的组件；仅影响显示，不删除任务或笔记。').addButton(c=>c.setButtonText('自定义显示').onClick(()=>new HomeLayoutModal(this.plugin).open()));
    new Setting(el).setName('记录本地活动').setDesc('仅从启用后记录新增/改写字词、创建笔记、任务完成和编辑活跃时长。无网络上传。').addToggle(c=>c.setValue(s.recordActivity).onChange(v=>void this.plugin.updateSettings({recordActivity:v})));
    new Setting(el).setName('快速收集目录').addText(c=>c.setValue(s.captureFolder).onChange(v=>void this.plugin.updateSettings({captureFolder:v})));
    new Setting(el).setName('日记目录').addText(c=>c.setValue(s.dailyFolder).onChange(v=>void this.plugin.updateSettings({dailyFolder:v})));
    new Setting(el).setName('恢复皮肤默认设置').setDesc('保留任务、项目和活动记录。').addButton(c=>c.setButtonText('恢复默认').onClick(async()=>{await this.plugin.updateSettings(DEFAULT_SETTINGS);this.display();}));
    new Setting(el).setName('快捷入口').setHeading();
    new Setting(el).setName('任务与项目').addButton(c=>c.setButtonText('打开任务').onClick(()=>void this.plugin.openStudio('tasks'))).addButton(c=>c.setButtonText('管理项目').onClick(()=>this.plugin.manage('projects')));
    new Setting(el).setName('Markdown 任务').addButton(c=>c.setButtonText('导出任务').onClick(()=>void this.plugin.exportTasks()));
  }
  private typography(el:HTMLElement):void {
    const section=el.createDiv({cls:'prism-typography-settings'});
    new Setting(section).setName('字体与排版').setHeading();
    section.createEl('p',{text:'界面与笔记分别设置，内置字体可离线使用。保持默认即可沿用当前字体与界面字号。',cls:'setting-item-description'});
    let uiPreview:HTMLElement,notePreview:HTMLElement,monoToggle:import('obsidian').ToggleComponent;
    let uiDropdown:DropdownComponent,noteDropdown:DropdownComponent;
    const refreshPreview=()=>{
      const s=this.plugin.data.settings;
      uiPreview.style.fontFamily=UI_FONTS[s.uiFont].family;uiPreview.style.fontSize=s.uiFontSize?`${s.uiFontSize}px`:'var(--font-ui-small)';
      notePreview.style.fontFamily=noteFontFamily(s.noteFont,s.mono);notePreview.style.fontSize=`${s.fontSize}px`;notePreview.style.lineHeight=String(s.lineHeight);
      uiDescription.setDesc(UI_FONTS[s.uiFont].description);noteDescription.setDesc(NOTE_FONTS[s.noteFont].description);
      monoToggle.setDisabled(s.noteFont!=='default');
    };
    const uiDescription=new Setting(section).setName('界面字体').addDropdown(c=>{
      uiDropdown=c;c.addOptions(UI_FONT_OPTIONS).setValue(this.plugin.data.settings.uiFont).onChange(async value=>{await this.plugin.updateSettings({uiFont:value as Data['settings']['uiFont']});refreshPreview();});
    });
    const sizeSetting=new Setting(section).setName('界面字号');
    let sizeSlider:import('obsidian').SliderComponent,sizeInput:HTMLInputElement;
    const refreshSize=()=>{
      const size=this.plugin.data.settings.uiFontSize;
      sizeSlider.setValue(size||13);sizeInput.value=String(size||13);
      sizeSetting.setDesc(size===0?'当前：跟随现有字号。拖动或输入数值即可自定义；标准大小为 13 px。':`当前：${size} px。同步调整侧栏、标签页、设置和工作台，笔记字号保持独立。`);
    };
    const changeSize=async(size:number)=>{await this.plugin.updateSettings({uiFontSize:size});refreshSize();refreshPreview();};
    sizeSetting.addSlider(c=>{sizeSlider=c;c.setLimits(12,20,1).setDynamicTooltip().onChange(value=>void changeSize(value));});
    sizeSetting.addText(c=>{
      sizeInput=c.inputEl;sizeInput.type='number';sizeInput.min='12';sizeInput.max='20';sizeInput.step='1';sizeInput.setAttribute('aria-label','界面字号');sizeInput.classList.add('prism-font-size-input');
      const commit=()=>{const value=Number(sizeInput.value);if(!sizeInput.value||!Number.isFinite(value)){refreshSize();return;}void changeSize(Math.max(12,Math.min(20,Math.round(value))));};
      sizeInput.addEventListener('change',commit);sizeInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sizeInput.blur();}});
    });
    sizeSetting.addButton(c=>c.setButtonText('跟随当前').onClick(()=>void changeSize(0)));
    const noteDescription=new Setting(section).setName('笔记字体').addDropdown(c=>{
      noteDropdown=c;c.addOptions(NOTE_FONT_OPTIONS).setValue(this.plugin.data.settings.noteFont).onChange(async value=>{await this.plugin.updateSettings({noteFont:value as Data['settings']['noteFont']});refreshPreview();});
    });
    new Setting(section).setName('默认笔记使用等宽字体').setDesc('仅在笔记字体为「当前字体（默认）」时生效。代码块仍使用 Obsidian 的代码字体。').addToggle(c=>{monoToggle=c;c.setValue(this.plugin.data.settings.mono).onChange(async value=>{await this.plugin.updateSettings({mono:value});refreshPreview();});});
    for(const [key,label,min,max,step] of [['fontSize','笔记字号',NOTE_FONT_SIZE_MIN,NOTE_FONT_SIZE_MAX,1],['lineHeight','笔记行高',1.3,2.4,.1],['noteWidth','笔记最大宽度',500,1400,20]] as const){
      new Setting(section).setName(label).addSlider(c=>c.setLimits(min,max,step).setValue(this.plugin.data.settings[key]).setDynamicTooltip().onChange(async value=>{await this.plugin.updateSettings({[key]:value});refreshPreview();}));
    }
    new Setting(section).setName('Ctrl + 鼠标滚轮调整笔记字号').setDesc('开启后，在 Markdown 阅读或编辑正文区域按住 Ctrl 滚动；向上放大，向下缩小，每次 1 px。仅改变笔记字号，不缩放整个界面。').addToggle(c=>c.setValue(this.plugin.data.settings.noteWheelZoom).onChange(v=>void this.plugin.updateSettings({noteWheelZoom:v})));
    const previews=section.createDiv({cls:'prism-font-previews'});
    const uiCard=previews.createDiv({cls:'prism-font-preview'});uiCard.createSpan({text:'界面预览',cls:'prism-font-preview-label'});
    uiPreview=uiCard.createDiv({cls:'prism-font-preview-ui',text:'Prism Studio · 阅读与整理\nLibrary · Notes · 0123456789'});
    const noteCard=previews.createDiv({cls:'prism-font-preview'});noteCard.createSpan({text:'笔记预览',cls:'prism-font-preview-label'});
    notePreview=noteCard.createDiv({cls:'prism-font-preview-note',text:'让思考清晰，让阅读从容。\nRead, reflect, and connect. 0123456789'});
    new Setting(section).setName('重置字体').setDesc('恢复默认字体与跟随当前界面字号，保留笔记字号、行高和配色。').addButton(c=>c.setButtonText('重置字体').onClick(async()=>{
      await this.plugin.updateSettings({uiFont:'default',uiFontSize:0,noteFont:'default'});uiDropdown.setValue('default');noteDropdown.setValue('default');refreshSize();refreshPreview();
    }));
    refreshSize();refreshPreview();
  }
}
