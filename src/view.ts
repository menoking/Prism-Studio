import { ItemView, Menu, Notice, TFile, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type PrismPlugin from './main';
import { LANES, Lane, Task, activityLevel, inCreatedNoteRange, emptyActivity, filterTasks, hasSubstantiveModification, heatmapDays, isLane, isToday, localDay, metricValue, score, streaks } from './model';
import { CaptureModal, NotePicker, HomeLayoutModal } from './modals';
import { button, empty, formatDate, icon, stat } from './ui';

export const STUDIO_VIEW='prism-studio-view';
const LANE_ICONS:Record<Lane,string>={inbox:'inbox',today:'sun',next:'calendar-days',anytime:'layers',someday:'cloud',waiting:'hourglass',done:'circle-check'};
const METRICS={score:'贡献分',time:'交互活跃',focus:'专注时长',words:'新增与改写',notes:'新建笔记',tasks:'完成任务'};
export class StudioView extends ItemView{
  tab:'home'|'tasks'|'pulse'='home';
  private lane:Lane='today';private projectId='';private sprintId='';private query='';private board=false;
  private metric='score';private selectedDay=localDay();private reviewTab='today';
  private createdView:'today'|'week'|'month'|'modified'='today';private createdNonEmptyOnly=false;
  private rangeWeeks=52;
  private unsubscribe?:()=>void;private renderTimer?:number;
  constructor(leaf:WorkspaceLeaf,public plugin:PrismPlugin){super(leaf);}
  getViewType():string{return STUDIO_VIEW;}
  getDisplayText():string{return 'Prism Studio';}
  getIcon():string{return 'panels-top-left';}
  getState():Record<string,unknown>{return {tab:this.tab,lane:this.lane,board:this.board};}
  async setState(state:Record<string,unknown>,result:ViewStateResult):Promise<void>{
    if(['home','tasks','pulse'].includes(String(state.tab)))this.tab=state.tab as typeof this.tab;
    if(isLane(state.lane))this.lane=state.lane;if(typeof state.board==='boolean')this.board=state.board;
    await super.setState(state,result);this.render();
  }
  async onOpen():Promise<void>{
    this.contentEl.addClass('prism-view');this.unsubscribe=this.plugin.subscribe(()=>this.scheduleRender());this.render();
    this.addAction('palette','切换柔光配色',()=>this.plugin.cyclePalette());
    this.addAction('layers','层叠浮动笔记',()=>this.plugin.floats.arrange());
  }
  async onClose():Promise<void>{this.unsubscribe?.();if(this.renderTimer)window.clearTimeout(this.renderTimer);}
  selectTab(tab:typeof this.tab):void{this.tab=tab;this.render();this.app.workspace.requestSaveLayout();}
  private scheduleRender():void{if(this.renderTimer)window.clearTimeout(this.renderTimer);this.renderTimer=window.setTimeout(()=>{this.renderTimer=undefined;this.render();},100);}
  render():void{
    const el=this.contentEl;if(!el)return;
    const active=el.ownerDocument.activeElement as HTMLInputElement|null;
    const searchActive=active?.dataset?.prismSearch==='true';const caret=searchActive?active?.selectionStart:null;
    const scroll=el.scrollTop;el.empty();
    const shell=el.createDiv({cls:'prism-shell'});
    const header=shell.createDiv({cls:'prism-header prism-panel'});
    const brand=header.createDiv({cls:'prism-brand'});icon(brand,'aperture','prism-brand-mark');const name=brand.createDiv();name.createEl('strong',{text:'Prism Studio'});
    const nav=header.createEl('nav',{cls:'prism-top-nav',attr:{'aria-label':'工作台页面'}});
    for(const [tab,title,name] of [['home','工作台','panels-top-left'],['tasks','任务','list-todo'],['pulse','活动','chart-no-axes-combined']] as const)button(nav,title,name,()=>this.selectTab(tab),this.tab===tab?'is-active':'').setAttribute('aria-current',this.tab===tab?'page':'false');
    const tools=header.createDiv({cls:'prism-header-tools'});button(tools,'浮动笔记','layers',()=>new NotePicker(this.app,file=>void this.plugin.floats.open(file)).open(),'prism-icon-only');
    button(tools,'快速收集','plus',()=>new CaptureModal(this.plugin).open(),'prism-icon-only');
    button(tools,'皮肤设置','sliders-horizontal',()=>void this.openSettings(),'prism-icon-only');
    if(this.tab==='tasks')this.renderTasks(shell);else if(this.tab==='pulse')this.renderPulse(shell);else this.renderHome(shell);
    el.scrollTop=scroll;if(searchActive){const input=el.querySelector<HTMLInputElement>('[data-prism-search]');input?.focus();if(caret!==null && caret!==undefined)input?.setSelectionRange(caret,caret);}
  }
  private async openSettings():Promise<void>{
    // Setting tab navigation is not yet in the public API. Keep the fallback harmless.
    const app=this.app as unknown as {setting?:{open:()=>void|Promise<void>;openTabById:(id:string)=>void}};
    if(app.setting){await app.setting.open();app.setting.openTabById('prism-studio');}
    else new Notice('请打开 Obsidian 设置 → Prism Studio。');
  }
  private renderTasks(shell:HTMLElement):void{
    const top=shell.createDiv({cls:'prism-page-heading'});const name=top.createDiv();name.createEl('h1',{text:'Tempo · 任务'});name.createEl('p',{text:'把想法变成下一步。',cls:'prism-muted'});
    const actions=top.createDiv({cls:'prism-actions'});button(actions,'管理','settings-2',()=>this.taskMenu(actions));
    const undo=button(actions,'撤销','undo-2',()=>void this.plugin.undo().catch(error=>new Notice(String(error))));undo.disabled=!this.plugin.canUndo();
    button(actions,'新建任务','plus',()=>this.plugin.newTask(this.lane),'prism-primary');
    const tabs=shell.createDiv({cls:'prism-lane-tabs'});
    for(const lane of Object.keys(LANES) as Lane[]){const count=filterTasks(this.plugin.data.tasks,lane,this.projectId,'',this.sprintId).length;const b=button(tabs,LANES[lane],'',()=>{this.lane=lane;this.board=false;this.render();},this.lane===lane && !this.board?'is-active':'');b.createSpan({text:String(count),cls:'prism-count'});}
    const stats=shell.createDiv({cls:'prism-stats prism-stats-four'}),tasks=this.plugin.data.tasks;
    stat(stats,'今日待办',`${tasks.filter(t=>isToday(t)).length} 项`,'含到期与逾期任务',()=>{this.lane='today';this.render();});
    stat(stats,'进行中',`${tasks.filter(t=>t.inProgress && t.lane!=='done').length} 项`,'已经开始的行动');
    stat(stats,'收集箱',`${tasks.filter(t=>t.lane==='inbox').length} 项`,'想法与待整理事项',()=>{this.lane='inbox';this.render();});
    stat(stats,'今日完成',`${tasks.filter(t=>t.completedAt && localDay(t.completedAt)===localDay() && t.lane==='done').length} 项`,'每一步都算数',()=>{this.lane='done';this.render();});
    const workspace=shell.createDiv({cls:'prism-task-workspace'}),sidebar=workspace.createEl('aside',{cls:'prism-task-sidebar prism-panel'});
    sidebar.createEl('h3',{text:'待办任务',cls:'prism-sidebar-label'});
    for(const lane of Object.keys(LANES) as Lane[]){const b=button(sidebar,LANES[lane],LANE_ICONS[lane],()=>{this.lane=lane;this.board=false;this.render();},this.lane===lane && !this.board?'is-active':'');b.createSpan({cls:'prism-count',text:String(filterTasks(tasks,lane).length)});}
    const projectHeader=sidebar.createDiv({cls:'prism-sidebar-heading'});projectHeader.createEl('h3',{text:'项目'});button(projectHeader,'管理项目','plus',()=>this.plugin.manage('projects'),'prism-icon-only');
    button(sidebar,'全部项目','folder-open',()=>{this.projectId='';this.sprintId='';this.render();},!this.projectId?'is-selected':'');
    for(const project of this.plugin.data.projects){
      const b=button(sidebar,project.name,'',()=>{this.projectId=project.id;this.sprintId='';this.render();},this.projectId===project.id?'is-selected':'');
      const dot=b.createSpan({cls:'prism-project-dot'});dot.style.background=project.color;b.prepend(dot);
      const projectTasks=tasks.filter(t=>t.projectId===project.id);const pct=projectTasks.length?Math.round(projectTasks.filter(t=>t.lane==='done').length/projectTasks.length*100):0;b.createSpan({text:`${pct}%`,cls:'prism-count'});
    }
    if(!this.plugin.data.projects.length)sidebar.createEl('small',{text:'添加项目，组织不同方向的任务。',cls:'prism-muted'});
    const sprintHeader=sidebar.createDiv({cls:'prism-sidebar-heading'});sprintHeader.createEl('h3',{text:'周期 SPRINT'});button(sprintHeader,'管理周期','plus',()=>this.plugin.manage('sprints'),'prism-icon-only');
    for(const sprint of this.plugin.data.sprints.filter(s=>!s.archived)){const b=button(sidebar,sprint.name,'repeat-2',()=>{this.sprintId=this.sprintId===sprint.id?'':sprint.id;this.projectId='';this.render();},this.sprintId===sprint.id?'is-selected':'');b.title=`${sprint.start} 至 ${sprint.end}`;}
    const main=workspace.createDiv({cls:`prism-task-main prism-panel ${this.board?'prism-board-panel':''}`});
    const bar=main.createDiv({cls:'prism-list-header'});const currentProject=this.plugin.data.projects.find(p=>p.id===this.projectId);const currentSprint=this.plugin.data.sprints.find(s=>s.id===this.sprintId);
    const label=bar.createDiv({cls:'prism-list-title'});label.createEl('strong',{text:this.board?'任务看板':`${LANES[this.lane]}${this.lane==='today'?` · ${formatDate()}`:''}`});
    if(currentProject||currentSprint)label.createSpan({cls:'prism-badge',text:currentProject?.name||currentSprint?.name});
    const controls=bar.createDiv({cls:'prism-actions'});const search=controls.createEl('input',{cls:'prism-search',attr:{type:'search',placeholder:'搜索任务…','aria-label':'搜索任务','data-prism-search':'true'}});search.value=this.query;
    search.addEventListener('input',()=>{this.query=search.value;this.scheduleRender();});
    button(controls,this.board?'列表':'看板',this.board?'list':'columns-3',()=>{this.board=!this.board;this.render();});
    if(this.board)this.renderBoard(main);else{
      const rows=filterTasks(tasks,this.lane,this.projectId,this.query,this.sprintId);
      const list=main.createDiv({cls:'prism-task-list'});
      if(!rows.length){empty(list,this.query?'没有找到符合条件的任务。':'这里还没有任务，留点空间给下一步。','circle-check');if(!this.query)button(list,'添加一个任务','plus',()=>this.plugin.newTask(this.lane),'prism-empty-action');}
      for(const task of rows)this.taskRow(list,task);
    }
  }
  private taskMenu(anchor:HTMLElement):void{
    const menu=new Menu();menu.addItem(i=>i.setTitle('管理项目').setIcon('folder').onClick(()=>this.plugin.manage('projects')));
    menu.addItem(i=>i.setTitle('管理周期 Sprint').setIcon('repeat-2').onClick(()=>this.plugin.manage('sprints')));
    menu.addSeparator();menu.addItem(i=>i.setTitle('选择笔记并导入 Markdown 任务').setIcon('file-input').onClick(()=>new NotePicker(this.app,file=>void this.plugin.importTasks(file)).open()));
    menu.addItem(i=>i.setTitle('导出任务为 Markdown').setIcon('file-output').onClick(()=>void this.plugin.exportTasks()));
    const rect=anchor.getBoundingClientRect();menu.showAtPosition({x:rect.left,y:rect.bottom});
  }
  private taskRow(parent:HTMLElement,task:Task,card=false):void{
    const row=parent.createDiv({cls:`prism-task-row ${card?'prism-task-card':''} ${task.lane==='done'?'is-done':''}`,attr:{'data-task-id':task.id}});row.draggable=true;
    row.addEventListener('dragstart',event=>{event.dataTransfer?.setData('application/prism-task',task.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
    const check=row.createEl('input',{cls:'prism-task-check',attr:{type:'checkbox','aria-label':`完成：${task.title}`}});check.checked=task.lane==='done';check.addEventListener('change',()=>{check.disabled=true;void this.plugin.setComplete(task.id,check.checked).finally(()=>{check.disabled=false;check.checked=this.plugin.data.tasks.find(t=>t.id===task.id)?.lane==='done';});});
    const content=row.createEl('button',{cls:'prism-task-content',attr:{type:'button','aria-label':`编辑：${task.title}`}});content.addEventListener('click',()=>this.plugin.editTask(task));
    const line=content.createDiv({cls:'prism-task-title-line'});if(task.priority!=='none'){const priority=icon(line,'signal',`prism-priority prism-priority-${task.priority}`);priority.title={high:'高优先级',medium:'中优先级',low:'低优先级'}[task.priority];}line.createSpan({text:task.title,cls:'prism-task-name'});
    if(task.description && card)content.createDiv({text:task.description,cls:'prism-task-detail'});
    const meta=row.createDiv({cls:'prism-task-meta'});if(task.inProgress)meta.createSpan({text:'进行中',cls:'prism-badge is-progress'});
    if(task.due){const badge=meta.createSpan({text:task.due,cls:`prism-badge ${task.due<localDay() && task.lane!=='done'?'is-overdue':''}`});badge.title='截止日期';}
    const project=this.plugin.data.projects.find(p=>p.id===task.projectId);if(project){const badge=meta.createSpan({text:project.name,cls:'prism-project-badge'});const dot=badge.createSpan({cls:'prism-project-dot'});dot.style.background=project.color;badge.prepend(dot);}
    if(task.notePath)button(meta,'打开关联笔记','file-text',()=>this.plugin.openFile(task.notePath),'prism-icon-only');
    button(meta,'任务操作','ellipsis',()=>{const menu=new Menu();menu.addItem(i=>i.setTitle('编辑').setIcon('pencil').onClick(()=>this.plugin.editTask(task)));for(const lane of Object.keys(LANES) as Lane[])if(lane!==task.lane)menu.addItem(i=>i.setTitle(`移到${LANES[lane]}`).setIcon(LANE_ICONS[lane]).onClick(()=>void this.plugin.moveTask(task.id,lane)));menu.showAtPosition({x:row.getBoundingClientRect().right-20,y:row.getBoundingClientRect().top});},'prism-icon-only');
  }
  private renderBoard(parent:HTMLElement):void{
    const board=parent.createDiv({cls:'prism-board'});
    for(const lane of Object.keys(LANES) as Lane[]){const column=board.createDiv({cls:'prism-board-column',attr:{'data-lane':lane}});const tasks=this.plugin.data.tasks.filter(t=>t.lane===lane && (!this.projectId||t.projectId===this.projectId) && (!this.sprintId||t.sprintId===this.sprintId) && `${t.title} ${t.description}`.toLowerCase().includes(this.query.toLowerCase()));const title=column.createDiv({cls:'prism-column-heading'});icon(title,LANE_ICONS[lane]);title.createEl('strong',{text:LANES[lane]});title.createSpan({text:String(tasks.length),cls:'prism-count'});
      if(lane!=='done')button(title,'新建任务','plus',()=>this.plugin.newTask(lane),'prism-icon-only');
      column.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('application/prism-task')){event.preventDefault();column.addClass('is-drag-over');}});column.addEventListener('dragleave',()=>column.removeClass('is-drag-over'));column.addEventListener('drop',event=>{event.preventDefault();column.removeClass('is-drag-over');const id=event.dataTransfer?.getData('application/prism-task');if(id)void this.plugin.moveTask(id,lane);});
      for(const task of tasks)this.taskRow(column,task,true);
      if(!tasks.length)column.createDiv({cls:'prism-drop-hint',text:'拖动任务到这里'});
    }
  }
  private renderHome(shell:HTMLElement):void{
    const top=shell.createDiv({cls:'prism-page-heading'});const text=top.createDiv();text.createEl('h1',{text:'让知识与行动相遇。'});text.createEl('p',{text:formatDate(),cls:'prism-muted'});
    const actions=top.createDiv({cls:'prism-actions'});button(actions,'自定义工作台','sliders-horizontal',()=>new HomeLayoutModal(this.plugin).open());button(actions,'今天的日记','calendar-days',()=>void this.plugin.dailyNote());button(actions,'快速收集','plus',()=>new CaptureModal(this.plugin).open(),'prism-primary');
    const nav=shell.createDiv({cls:'prism-lane-tabs'});for(const [tab,label] of [['today','今天'],['create','创作'],['knowledge','知识'],['review','复盘']] as const)button(nav,label,'',()=>{this.reviewTab=tab;this.render();},this.reviewTab===tab?'is-active':'');
    const all=this.plugin.getFiles();
    const createdByTime=all.filter(file=>file.stat.ctime>0).sort((a,b)=>b.stat.ctime-a.stat.ctime);
    const modifiedByTime=all.filter(file=>hasSubstantiveModification(file.stat.mtime,file.stat.ctime)).sort((a,b)=>b.stat.mtime-a.stat.mtime);
    const viewedByTime=Object.entries(this.plugin.data.fileStats).filter(([,stats])=>stats.lastOpened>0).sort((a,b)=>b[1].lastOpened-a[1].lastOpened)
      .map(([path])=>this.app.vault.getAbstractFileByPath(path)).filter((file):file is TFile=>file instanceof TFile);
    const isStatus=(file:TFile,status:string[])=>{const metadata=this.app.metadataCache.getFileCache(file)?.frontmatter;return status.includes(String(metadata?.status||metadata?.review_status||'').toLowerCase());};
    const inbox=all.filter(f=>f.path.startsWith(this.plugin.data.settings.captureFolder+'/')||isStatus(f,['inbox','待整理']));
    const review=all.filter(f=>isStatus(f,['review','reviewing','待复核','内容待回写','待回写']));
    const projectFiles=all.filter(f=>{const fm=this.app.metadataCache.getFileCache(f)?.frontmatter;return !!fm?.project||isStatus(f,['project','active','复盘']);});
    const tasks=this.plugin.data.tasks,visible=this.plugin.data.settings.homeWidgets;
    if(visible.summary){
    const stats=shell.createDiv({cls:'prism-home-summary prism-panel',attr:{'data-prism-widget':'summary'}});const line=stats.createDiv({cls:'prism-section-heading'});icon(line,'refresh-cw');line.createEl('h2',{text:'统一复盘'});line.createSpan({text:'来自当前知识库',cls:'prism-badge'});const reviewActions=line.createDiv({cls:'prism-actions prism-section-action'});button(reviewActions,'生成下一批行动','refresh-cw',()=>void this.plugin.generateActions(),'prism-primary');button(reviewActions,'打开 Now','arrow-up-right',()=>void this.plugin.openNow());
    const grid=stats.createDiv({cls:'prism-stats prism-stats-six'});
    stat(grid,'未完成',String(tasks.filter(t=>t.lane!=='done').length),'当前行动');stat(grid,'逾期',String(tasks.filter(t=>t.due && t.due<localDay() && t.lane!=='done').length),'需要重新安排');stat(grid,'等待',String(tasks.filter(t=>t.lane==='waiting').length),'等待依赖');stat(grid,'已完成',String(tasks.filter(t=>t.lane==='done').length),'历史完成记录');stat(grid,'待回写与复核',String(review.length),'笔记 status');stat(grid,'收件箱积压',String(inbox.length),'待整理材料');
    }
    if(visible.createdNotes)this.createdNotesSection(shell,createdByTime,modifiedByTime);
    const cards=shell.createDiv({cls:'prism-home-grid'});
    if(this.reviewTab==='today'||this.reviewTab==='review'){
      if(visible.actions){const action=this.homeSection(cards,'行动收口','list-todo',`${tasks.filter(t=>isToday(t)).length} 项待办`);action.dataset.prismWidget='actions';const today=tasks.filter(t=>isToday(t)).slice(0,6);if(!today.length)empty(action,'今天的行动清单很清爽。','circle-check');else for(const task of today)this.taskRow(action,task);}
      if(visible.review)this.noteSection(cards,'待回写与复核','book-open',review,'通过 frontmatter 的 status: review 标记待复核笔记。','review');
      if(visible.inbox)this.noteSection(cards,'收件箱积压','inbox',inbox,'快速收集的内容会出现在这里。','inbox');
      if(visible.projects)this.noteSection(cards,'内容项目复盘','folder-kanban',projectFiles,'为笔记添加 project 属性，或设置 status: project。','projects');
    }else if(this.reviewTab==='create'){
      if(visible.recentEdits)this.noteSection(cards,'最近编辑','pencil',modifiedByTime.slice(0,12),'最近修改过的笔记会出现在这里。','recentEdits');if(visible.projects)this.noteSection(cards,'创作中的项目','folder-kanban',projectFiles,'为笔记添加 project 属性以加入创作项目。','projects');
      if(visible.creation){const tools=this.homeSection(cards,'开始创作','feather','');tools.dataset.prismWidget='creation';button(tools,'收集一个想法','plus',()=>new CaptureModal(this.plugin).open(),'prism-primary');button(tools,'打开今天的日记','calendar-days',()=>void this.plugin.dailyNote());button(tools,'创建行动任务','list-todo',()=>this.plugin.newTask());}
    }else{
      if(visible.recentNotes)this.noteSection(cards,'最近查看','eye',viewedByTime.slice(0,12),'打开查看过的笔记会出现在这里。','recentNotes');
      if(visible.tags){
      const tags=this.homeSection(cards,'知识标签','tags','');const counts=new Map<string,number>();for(const file of all){const cache=this.app.metadataCache.getFileCache(file);const values=new Set([...(cache?.tags||[]).map(t=>t.tag),...this.frontmatterTags(cache?.frontmatter?.tags)]);for(const tag of values)counts.set(tag,(counts.get(tag)||0)+1);}
      tags.dataset.prismWidget='tags';
      if(!counts.size)empty(tags,'在笔记中使用 #标签 来组织知识。','tags');else for(const [tag,count] of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,30)){const b=button(tags,`${tag} · ${count}`,'hash',()=>{const matches=all.filter(file=>{const cache=this.app.metadataCache.getFileCache(file);return cache?.tags?.some(t=>t.tag===tag)||this.frontmatterTags(cache?.frontmatter?.tags).includes(tag);});new FilteredNotes(this.plugin,matches,tag).open();},'prism-tag-button');b.title='查看此标签的笔记';}
      }
    }
    if(!cards.childElementCount)cards.remove();else if(cards.childElementCount%2===1)cards.lastElementChild?.classList.add('prism-home-wide');
    if(visible.rhythm){const rhythm=this.homeSection(shell,'系统节奏','activity','近 12 周');rhythm.dataset.prismWidget='rhythm';this.miniHeatmap(rhythm);button(rhythm,'查看完整活动统计','arrow-up-right',()=>this.selectTab('pulse'),'prism-section-action');}
    if(!shell.querySelector('[data-prism-widget]')){const placeholder=shell.createDiv({cls:'prism-home-section prism-panel'});empty(placeholder,'当前分区的组件已隐藏，可在自定义工作台中重新开启。','layout-dashboard');button(placeholder,'自定义工作台','sliders-horizontal',()=>new HomeLayoutModal(this.plugin).open());}
    shell.createEl('p',{text:'工作台直接读取知识库。收件箱、复核和项目分类可通过目录与笔记属性维护。',cls:'prism-footnote'});
  }
  private frontmatterTags(value:unknown):string[]{return (Array.isArray(value)?value:typeof value==='string'?value.split(/[ ,]+/):[]).filter(t=>typeof t==='string').map(t=>`#${String(t).replace(/^#/,'')}`);}
  private homeSection(parent:HTMLElement,title:string,name:string,badge:string):HTMLElement{
    const section=parent.createEl('section',{cls:'prism-home-section prism-panel'});const header=section.createDiv({cls:'prism-section-heading'});icon(header,name);header.createEl('h2',{text:title});if(badge)header.createSpan({text:badge,cls:'prism-badge'});return section;
  }
  private noteSection(parent:HTMLElement,title:string,name:string,files:TFile[],message:string,widget?:string):void{
    const section=this.homeSection(parent,title,name,`${files.length} 篇`);if(widget)section.dataset.prismWidget=widget;const list=section.createDiv({cls:'prism-note-list'});if(!files.length)empty(list,message,name);
    for(const file of files.slice(0,8)){const row=list.createDiv({cls:'prism-note-row'});const link=row.createEl('button',{cls:'prism-note-link',text:file.basename,attr:{title:file.path}});link.addEventListener('click',()=>this.plugin.openFile(file.path));const status=String(this.app.metadataCache.getFileCache(file)?.frontmatter?.status??'');if(status)row.createSpan({cls:'prism-badge',text:status});button(row,'浮动显示','layers',()=>void this.plugin.floats.open(file),'prism-icon-only');}
    if(files.length>8)button(section,`查看全部 ${files.length} 篇`,'arrow-up-right',()=>new FilteredNotes(this.plugin,files,title).open());
  }
  private createdNotesSection(parent:HTMLElement,createdFiles:TFile[],modifiedFiles:TFile[]):void{
    const now=Date.now();
    if(this.createdNonEmptyOnly){const nonEmpty=(file:TFile)=>file.stat.size>0;createdFiles=createdFiles.filter(nonEmpty);modifiedFiles=modifiedFiles.filter(nonEmpty);}
    const createdGroups=([
      ['today','今天创建','sun'],['week','近七天创建','calendar-days'],['month','近一月创建','calendar-range']
    ] as const).map(([range,label,name])=>({range,label,name,files:createdFiles.filter(file=>inCreatedNoteRange(file.stat.ctime,range,now))}));
    const createdCount=createdGroups.find(group=>group.range==='month')?.files.length||0;
    const section=this.homeSection(parent,'最近创作动态','history',`近 30 天创建 ${createdCount} 篇 · 修改 ${modifiedFiles.length} 篇`);
    section.dataset.prismWidget='createdNotes';section.addClass('prism-created-notes','prism-home-wide');
    const latest=createdFiles[0],latestModified=modifiedFiles[0];
    if(!latest&&!latestModified){empty(section,'知识库还没有可展示的创建或修改记录。','file-clock');return;}
    const spotlight=section.createDiv({cls:'prism-created-spotlight'});
    if(latest){
      const featured=spotlight.createDiv({cls:'prism-created-feature'});const mark=featured.createDiv({cls:'prism-created-feature-mark'});icon(mark,'sparkles');
      const content=featured.createDiv({cls:'prism-created-feature-content'});content.createSpan({cls:'prism-created-eyebrow',text:'最近创建'});
      const link=content.createEl('button',{cls:'prism-created-feature-link',text:latest.basename,attr:{type:'button',title:latest.path,'aria-label':`打开最近创建的笔记：${latest.basename}`}});link.addEventListener('click',()=>this.plugin.openFile(latest.path));
      content.createSpan({cls:'prism-created-feature-meta',text:`创建于 ${this.createdTime(latest.stat.ctime)} · ${latest.path}`});button(featured,'浮动显示','layers',()=>void this.plugin.floats.open(latest),'prism-icon-only');
    }
    if(latestModified){
      const featured=spotlight.createDiv({cls:'prism-created-feature prism-modified-feature'});const mark=featured.createDiv({cls:'prism-created-feature-mark'});icon(mark,'pencil');
      const content=featured.createDiv({cls:'prism-created-feature-content'});content.createSpan({cls:'prism-created-eyebrow',text:'最近修改'});
      const link=content.createEl('button',{cls:'prism-created-feature-link',text:latestModified.basename,attr:{type:'button',title:latestModified.path,'aria-label':`打开最近修改的笔记：${latestModified.basename}`}});link.addEventListener('click',()=>this.plugin.openFile(latestModified.path));
      content.createSpan({cls:'prism-created-feature-meta',text:`修改于 ${this.createdTime(latestModified.stat.mtime)} · ${latestModified.path}`});button(featured,'浮动显示','layers',()=>void this.plugin.floats.open(latestModified),'prism-icon-only');
    }
    const views=[...createdGroups,{range:'modified' as const,label:'最近修改',name:'pencil',files:modifiedFiles}];
    const active=views.find(view=>view.range===this.createdView)||views[0];
    const toolbar=section.createDiv({cls:'prism-created-toolbar'});
    const tabs=toolbar.createDiv({cls:'prism-created-tabs',attr:{role:'tablist','aria-label':'创作动态时间范围'}});
    for(const view of views){const b=button(tabs,`${view.label} ${view.files.length}`,view.name,()=>{this.createdView=view.range;this.render();},this.createdView===view.range?'is-active':'');b.setAttribute('aria-pressed',String(this.createdView===view.range));}
    const toggle=toolbar.createEl('label',{cls:'prism-created-filter'});const checkbox=toggle.createEl('input',{attr:{type:'checkbox','aria-label':'只显示非空笔记'}});checkbox.checked=this.createdNonEmptyOnly;
    toggle.createSpan({text:'只显示非空笔记'});checkbox.addEventListener('change',()=>{this.createdNonEmptyOnly=checkbox.checked;this.render();});
    const weight=(file:TFile)=>{const stats=this.plugin.data.fileStats[file.path];return (stats?.opens||0)+(stats?.edits||0);};
    const maxWeight=Math.max(...active.files.map(weight),0);
    const grid=section.createDiv({cls:`prism-chip-grid ${active.range==='modified'?'is-modified':''}`});
    if(!active.files.length)grid.createDiv({cls:'prism-created-empty',text:active.range==='modified'?'最近没有改动记录':'该时间段暂无创建记录'});
    for(const file of active.files.slice(0,60)){
      const value=weight(file),level=activityLevel(value,maxWeight),stats=this.plugin.data.fileStats[file.path];
      const chip=grid.createEl('button',{cls:`prism-note-chip level-${level}`,attr:{type:'button',title:`${file.path}\n打开 ${stats?.opens||0} 次 · 编辑 ${stats?.edits||0} 次`,'aria-label':`打开笔记：${file.basename}`}});
      chip.createSpan({cls:'prism-note-chip-name',text:file.basename});
      if(value>0)chip.createSpan({cls:'prism-note-chip-count',text:String(value)});
      chip.addEventListener('click',()=>this.plugin.openFile(file.path));
    }
    if(active.files.length>60)button(section,`查看全部 ${active.files.length} 篇`,'arrow-up-right',()=>new FilteredNotes(this.plugin,active.files,active.label).open(),'prism-created-more');
  }
  private createdTime(timestamp:number,timeOnly=false):string{
    const date=new Date(timestamp),time=`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    return timeOnly?time:`${localDay(date)} ${time}`;
  }
  private miniHeatmap(parent:HTMLElement):void{const heat=parent.createDiv({cls:'prism-mini-heatmap'});for(const day of heatmapDays().slice(-84)){const value=score(this.plugin.data.activity[day]||emptyActivity());const cell=heat.createEl('button',{cls:`prism-heat-cell level-${this.level(value,10)}`,attr:{title:`${day} · ${value.toFixed(1)} 分`,'aria-label':`${day}，贡献 ${value.toFixed(1)} 分`}});cell.addEventListener('click',()=>{this.selectedDay=day;this.selectTab('pulse');});}}
  private level(value:number,max:number):number{return value<=0?0:Math.min(4,Math.max(1,Math.ceil(value/(max||1)*4)));}
  private renderPulse(shell:HTMLElement):void{
    const heading=shell.createDiv({cls:'prism-page-heading'});const name=heading.createDiv();name.createEl('h1',{text:'Pulse · 知识的节奏'});name.createEl('p',{text:'每一次思考，都留下痕迹。',cls:'prism-muted'});button(heading,this.plugin.focusStarted?'结束专注':'开始专注',this.plugin.focusStarted?'square':'timer',()=>this.plugin.toggleFocus(),'prism-primary');
    const activity=this.plugin.data.activity,totals=Object.values(activity),streak=streaks(activity),stats=shell.createDiv({cls:'prism-stats prism-stats-six'});
    stat(stats,'总贡献分',totals.reduce((s,d)=>s+score(d),0).toFixed(1),'Contribution');stat(stats,'活跃天数',`${streak.active} 天`,'Active days');stat(stats,'当前连续',`${streak.current} 天`,'Current streak');stat(stats,'最长连续',`${streak.longest} 天`,'Longest streak');stat(stats,'交互活跃',`${(totals.reduce((s,d)=>s+d.seconds,0)/3600).toFixed(1)} 小时`,'Active time');stat(stats,'专注时长',`${(totals.reduce((s,d)=>s+d.focusSeconds,0)/3600).toFixed(1)} 小时`,'Focus time');
    const tabs=shell.createDiv({cls:'prism-lane-tabs'});for(const [metric,label] of Object.entries(METRICS))button(tabs,label,'',()=>{this.metric=metric;this.render();},this.metric===metric?'is-active':'');
    const panel=shell.createDiv({cls:'prism-heatmap-panel prism-panel'});const chartHeading=panel.createDiv({cls:'prism-section-heading'});chartHeading.createEl('h2',{text:`知识活跃脉冲 · ${METRICS[this.metric as keyof typeof METRICS]}`});const ranges=chartHeading.createDiv({cls:'prism-actions prism-section-action'});for(const range of [4,13,26,52])button(ranges,`${range} 周`,'',()=>{this.rangeWeeks=range;this.render();},range===this.rangeWeeks?'is-active':'');
    const allDays=heatmapDays(),days=this.rangeWeeks===52?allDays:allDays.slice(Math.max(0,Math.floor((allDays.length-this.rangeWeeks*7)/7)*7)),values=days.map(day=>metricValue(activity[day]||emptyActivity(),this.metric));const max=Math.max(...values,1);
    const scroll=panel.createDiv({cls:'prism-heatmap-scroll'});const chart=scroll.createDiv({cls:'prism-heatmap'});
    const months=chart.createDiv({cls:'prism-heatmap-months'});months.style.gridTemplateColumns=`repeat(${Math.ceil(days.length/7)},minmax(0,1fr))`;for(let week=0;week<Math.ceil(days.length/7);week++){const date=new Date(`${days[week*7]}T12:00:00`);const previous=week?new Date(`${days[(week-1)*7]}T12:00:00`):null;months.createSpan({text:!previous||date.getMonth()!==previous.getMonth()?`${date.getMonth()+1}月`:''});}
    const cells=chart.createDiv({cls:'prism-heatmap-cells',attr:{'aria-label':'活动热力图'}});
    days.forEach((day,i)=>{const value=values[i],cell=cells.createEl('button',{cls:`prism-heat-cell level-${this.level(value,max)} ${day===this.selectedDay?'is-selected':''}`,attr:{title:`${day} · ${value.toFixed(1)}`,'aria-label':`${day}，${METRICS[this.metric as keyof typeof METRICS]} ${value.toFixed(1)}`,'data-day':day}});cell.addEventListener('click',()=>{this.selectedDay=day;this.render();});});
    const legend=panel.createDiv({cls:'prism-heatmap-legend'});legend.createSpan({text:'仅显示启用后记录的数据；颜色按当前指标的最大值分级。'});const range=legend.createDiv();range.createSpan({text:'少'});for(let i=0;i<5;i++)range.createSpan({cls:`prism-heat-cell level-${i}`});range.createSpan({text:'多'});
    const detail=shell.createDiv({cls:'prism-pulse-detail prism-panel'});const day=activity[this.selectedDay]||emptyActivity(),notes=Object.entries(day.notes);const header=detail.createDiv({cls:'prism-section-heading'});header.createEl('h2',{text:`${this.selectedDay} · 明细`});header.createSpan({text:activity[this.selectedDay]?'本地实录':'尚无记录',cls:'prism-badge'});
    const grid=detail.createDiv({cls:'prism-stats prism-stats-six'});stat(grid,'贡献分',score(day).toFixed(1),'公式累计');stat(grid,'新增字词',`+${notes.reduce((s,[,n])=>s+n.added,0)}`,'中文按字，英文按词');stat(grid,'改写字词',String(notes.reduce((s,[,n])=>s+n.revised,0)),'替换文本计入改写');stat(grid,'新建笔记',`${notes.filter(([,n])=>n.created).length} 篇`,'创建事件');stat(grid,'有效编辑会话',`${day.sessions} 次`,'间隔 5 分钟分段');stat(grid,'完成任务',`${day.tasks} 项`,'通过 Prism 完成');
    const breakdown=detail.createDiv({cls:'prism-score-breakdown'});breakdown.createEl('h3',{text:'贡献分构成'});
    for(const [label,value] of [['新建笔记 × 5',notes.filter(([,n])=>n.created).length*5],['编辑会话 × 2',day.sessions*2],['完成任务 × 2',day.tasks*2],['新增内链 × 1',day.links],['新增字词 / 100 + 改写字词 / 200',notes.reduce((s,[,n])=>s+n.added/100+n.revised/200,0)]] as [string,number][]){const row=breakdown.createDiv({cls:'prism-score-row'});row.createSpan({text:label});row.createEl('strong',{text:`+${value.toFixed(1)}`});}
    const times=detail.createDiv({cls:'prism-activity-times'});times.createSpan({text:`交互活跃 ${(day.seconds/60).toFixed(1)} 分钟`});times.createSpan({text:`专注 ${(day.focusSeconds/60).toFixed(1)} 分钟`});
    const list=detail.createDiv({cls:'prism-note-list'});if(!notes.length)empty(list,'当天还没有记录。编辑或创建笔记后会在这里显示。','notebook-pen');
    for(const [path,note] of notes.sort((a,b)=>b[1].added-a[1].added)){const row=list.createDiv({cls:'prism-note-row'});const link=row.createEl('button',{text:path,cls:'prism-note-link'});link.addEventListener('click',()=>this.plugin.openFile(path));row.createSpan({text:`${note.created?'新建':'编辑'} · +${note.added} / 改写 ${note.revised}`,cls:'prism-muted'});}
    shell.createEl('p',{cls:'prism-footnote',text:this.plugin.data.settings.recordActivity?'交互活跃：编辑后的 60 秒内按 15 秒采样；专注：手动开始，窗口隐藏时暂停。已有笔记只建立基线，不补造历史。':'活动记录已关闭，可在皮肤设置中开启。'});
  }
}
class FilteredNotes extends NotePicker{
  constructor(plugin:PrismPlugin,private files:TFile[],label:string){super(plugin.app,file=>plugin.openFile(file.path));this.setPlaceholder(`搜索：${label}`);}
  getItems():TFile[]{return this.files;}
}
