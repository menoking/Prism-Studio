import { App, FuzzySuggestModal, Modal, Notice, Setting, TFile } from 'obsidian';
import type PrismPlugin from './main';
import { LANES, HOME_WIDGETS, HomeWidget, normalizeHomeWidgets, Lane, Priority, Project, Sprint, Task, localDay } from './model';
import { button, heading } from './ui';

export class NotePicker extends FuzzySuggestModal<TFile>{
  constructor(app:App,private choose:(file:TFile)=>void){super(app);this.setPlaceholder('搜索笔记标题或路径…');}
  getItems():TFile[]{return this.app.vault.getMarkdownFiles().sort((a,b)=>b.stat.mtime-a.stat.mtime);}
  getItemText(file:TFile):string{return file.path;}
  onChooseItem(file:TFile):void{this.choose(file);}
}
export class HomeLayoutModal extends Modal {
  constructor(private plugin:PrismPlugin){super(plugin.app);}
  onOpen():void {
    this.modalEl.addClass('prism-modal');const el=this.contentEl;el.empty();
    heading(el,'自定义工作台','开关即时保存，所有工作台同步更新。组件仍按今天、创作、知识、复盘分区展示；隐藏不会删除数据。');
    for(const key of Object.keys(HOME_WIDGETS) as HomeWidget[]){
      new Setting(el).setName(HOME_WIDGETS[key]).addToggle(c=>{
        c.toggleEl.dataset.prismWidgetToggle=key;
        c.setValue(this.plugin.data.settings.homeWidgets[key]).onChange(async value=>{
          c.setDisabled(true);
          try{await this.plugin.updateSettings({homeWidgets:{...this.plugin.data.settings.homeWidgets,[key]:value}});}
          catch{new Notice('组件设置未能保存，请检查知识库是否可写。');}
          finally{c.setValue(this.plugin.data.settings.homeWidgets[key]);c.setDisabled(false);}
        });
      });
    }
    const actions=el.createDiv({cls:'prism-modal-actions'});
    button(actions,'显示全部','rotate-ccw',()=>{void this.plugin.updateSettings({homeWidgets:normalizeHomeWidgets(undefined)}).then(()=>this.onOpen());});
    button(actions,'完成','check',()=>this.close(),'prism-primary');
  }
}
export class ConfirmModal extends Modal {
  constructor(app:App,private title:string,private message:string,private action:()=>Promise<void>){super(app);}
  onOpen():void{this.modalEl.addClass('prism-modal');heading(this.contentEl,this.title,this.message);const row=this.contentEl.createDiv({cls:'prism-modal-actions'});button(row,'取消','',()=>this.close());const accept=button(row,'确认','',()=>{accept.disabled=true;void this.action().then(()=>this.close()).catch(error=>{accept.disabled=false;new Notice(String(error));});},'prism-primary');}
}
export class TaskModal extends Modal{
  private draft:Task;
  private saving=false;
  constructor(private plugin:PrismPlugin,private original?:Task,lane:Lane='inbox'){
    super(plugin.app);this.draft=original?structuredClone(original):{id:crypto.randomUUID(),title:'',description:'',lane:lane==='done'?'inbox':lane,priority:'none',projectId:'',sprintId:'',due:'',notePath:'',createdAt:Date.now(),inProgress:false};
  }
  onOpen():void{
    this.modalEl.addClass('prism-modal','prism-task-modal');const el=this.contentEl;
    heading(el,this.original?'编辑任务':'新建任务','把想法收集下来，再安排下一步。');
    const title=el.createEl('input',{cls:'prism-task-title',attr:{type:'text',placeholder:'需要做什么？','aria-label':'任务标题',maxlength:'300'}});title.value=this.draft.title;
    title.readOnly=!!this.draft.source;title.addEventListener('input',()=>this.draft.title=title.value);
    const description=el.createEl('textarea',{cls:'prism-task-description',attr:{placeholder:'添加说明、步骤或想法…','aria-label':'任务说明',rows:'3'}});description.value=this.draft.description;description.addEventListener('input',()=>this.draft.description=description.value);
    if(this.draft.source)el.createEl('p',{cls:'prism-muted',text:'此任务关联 Markdown。完成状态会回写原笔记；标题和日期请在原笔记编辑后重新导入。'});
    new Setting(el).setName('状态').addDropdown(c=>c.addOptions(Object.fromEntries(Object.entries(LANES).filter(([key])=>key!=='done'))).setValue(this.draft.lane==='done'?(this.draft.previousLane||'inbox'):this.draft.lane).setDisabled(this.draft.lane==='done').onChange(v=>this.draft.lane=v as Lane));
    new Setting(el).setName('项目').addDropdown(c=>{c.addOption('','未分配项目');for(const project of this.plugin.data.projects)c.addOption(project.id,project.name);c.setValue(this.draft.projectId).onChange(v=>this.draft.projectId=v);});
    new Setting(el).setName('优先级').addDropdown(c=>c.addOptions({none:'无优先级',low:'低',medium:'中',high:'高'}).setValue(this.draft.priority).onChange(v=>this.draft.priority=v as Priority));
    new Setting(el).setName('截止日期').addText(c=>{c.inputEl.type='date';c.setValue(this.draft.due).setDisabled(!!this.draft.source).onChange(v=>this.draft.due=v);});
    new Setting(el).setName('进行中').addToggle(c=>c.setValue(this.draft.inProgress).setDisabled(this.draft.lane==='done').onChange(v=>this.draft.inProgress=v));
    new Setting(el).setName('周期 Sprint').addDropdown(c=>{c.addOption('','不属于周期');for(const sprint of this.plugin.data.sprints.filter(s=>!s.archived || s.id===this.draft.sprintId))c.addOption(sprint.id,sprint.name);c.setValue(this.draft.sprintId).onChange(v=>this.draft.sprintId=v);});
    const link=new Setting(el).setName('关联笔记').setDesc(this.draft.notePath||'尚未关联');
    link.addButton(c=>c.setButtonText('选择').onClick(()=>new NotePicker(this.app,file=>{this.draft.notePath=file.path;link.setDesc(file.path);}).open()));
    if(this.draft.source)link.addButton(c=>c.setButtonText('解除同步').onClick(()=>{delete this.draft.source;title.readOnly=false;this.contentEl.empty();this.onOpen();}));
    const actions=el.createDiv({cls:'prism-modal-actions'});
    if(this.original)button(actions,'删除','trash-2',()=>new ConfirmModal(this.app,'删除任务？','会从 Prism 移除此任务，原笔记中的任务保持不变。',async()=>{await this.plugin.deleteTask(this.draft.id);this.close();}).open(),'prism-danger');
    button(actions,'取消','',()=>this.close());const save=button(actions,this.original?'保存任务':'创建任务','check',()=>void this.submit(),'prism-primary');save.dataset.action='save-task';
    const submitKey=(event:KeyboardEvent)=>{if(event.key==='Enter' && (event.ctrlKey||event.metaKey||event.target===title)){event.preventDefault();void this.submit();}};
    el.addEventListener('keydown',submitKey);this.scope.register(['Mod'],'Enter',()=>{void this.submit();return false;});
    window.setTimeout(()=>title.focus(),50);
  }
  async submit():Promise<void>{
    if(this.saving)return;
    this.draft.title=this.draft.title.trim();if(!this.draft.title){new Notice('请输入任务标题。');return;}
    if(this.draft.due && !/^\d{4}-\d{2}-\d{2}$/.test(this.draft.due)){new Notice('请选择有效日期。');return;}
    this.saving=true;const save=this.contentEl.querySelector<HTMLButtonElement>('[data-action="save-task"]');if(save)save.disabled=true;
    try{await this.plugin.putTask(this.draft);this.close();}catch{this.saving=false;if(save)save.disabled=false;}
  }
}
export class CaptureModal extends Modal{
  constructor(private plugin:PrismPlugin){super(plugin.app);}
  onOpen():void{
    this.modalEl.addClass('prism-modal');const el=this.contentEl;heading(el,'快速收集','保存为知识库里的 Markdown 笔记。');
    const title=el.createEl('input',{cls:'prism-task-title',attr:{placeholder:'笔记标题','aria-label':'笔记标题'}});
    const body=el.createEl('textarea',{cls:'prism-task-description',attr:{placeholder:'写下想法、摘录或待整理内容…',rows:'10','aria-label':'笔记内容'}});
    const actions=el.createDiv({cls:'prism-modal-actions'});button(actions,'取消','',()=>this.close());
    const save=button(actions,'保存笔记','check',()=>{if(!title.value.trim() && !body.value.trim()){new Notice('先写下一点内容。');return;}save.disabled=true;
      const name=title.value.trim()||`收集 ${localDay()} ${new Date().toTimeString().slice(0,8).replace(/:/g,'-')}`;
      void this.plugin.uniqueNote(this.plugin.data.settings.captureFolder,name,`---\nstatus: inbox\ntags: [capture]\n---\n# ${name}\n\n${body.value}\n`).then(()=>this.close()).catch(error=>{new Notice(String(error));save.disabled=false;});
    },'prism-primary');this.scope.register(['Mod'],'Enter',()=>{save.click();return false;});window.setTimeout(()=>title.focus(),50);
  }
}
export class ManageModal extends Modal{
  private projects:Project[];private sprints:Sprint[];
  constructor(private plugin:PrismPlugin,private kind:'projects'|'sprints'){super(plugin.app);this.projects=structuredClone(plugin.data.projects);this.sprints=structuredClone(plugin.data.sprints);}
  onOpen():void{
    this.modalEl.addClass('prism-modal');const el=this.contentEl;el.empty();heading(el,this.kind==='projects'?'管理项目':'管理周期 Sprint','修改会在点击保存后生效。');
    if(this.kind==='projects')for(const project of this.projects){const row=el.createDiv({cls:'prism-manage-row'});const color=row.createEl('input',{attr:{type:'color','aria-label':'项目颜色'}});color.value=/^#[0-9a-f]{6}$/i.test(project.color)?project.color:'#6696b3';color.addEventListener('input',()=>project.color=color.value);const input=row.createEl('input',{attr:{type:'text','aria-label':'项目名称',maxlength:'80'}});input.value=project.name;input.addEventListener('input',()=>project.name=input.value);button(row,'删除','trash-2',()=>{this.projects=this.projects.filter(p=>p.id!==project.id);this.onOpen();});}
    else for(const sprint of this.sprints){const section=el.createDiv({cls:'prism-sprint-form'});new Setting(section).setName('周期名称').addText(c=>c.setValue(sprint.name).onChange(v=>sprint.name=v));new Setting(section).setName('开始日期').addText(c=>{c.inputEl.type='date';c.setValue(sprint.start).onChange(v=>sprint.start=v);});new Setting(section).setName('结束日期').addText(c=>{c.inputEl.type='date';c.setValue(sprint.end).onChange(v=>sprint.end=v);});new Setting(section).setName('已归档').addToggle(c=>c.setValue(sprint.archived).onChange(v=>sprint.archived=v)).addButton(c=>c.setButtonText('删除').onClick(()=>{this.sprints=this.sprints.filter(s=>s.id!==sprint.id);this.onOpen();}));}
    button(el,this.kind==='projects'?'添加项目':'添加周期','plus',()=>{if(this.kind==='projects')this.projects.push({id:crypto.randomUUID(),name:'新项目',color:'#6696b3'});else{const end=new Date();end.setDate(end.getDate()+14);this.sprints.push({id:crypto.randomUUID(),name:'新周期',start:localDay(),end:localDay(end),archived:false});}this.onOpen();});
    const actions=el.createDiv({cls:'prism-modal-actions'});button(actions,'取消','',()=>this.close());const save=button(actions,'保存','check',()=>{
      const items=this.kind==='projects'?this.projects:this.sprints;if(items.some(p=>!p.name.trim())){new Notice('名称不能为空。');return;}
      if(this.kind==='sprints' && this.sprints.some(s=>!s.start||!s.end||s.end<s.start)){new Notice('请选择有效的开始与结束日期。');return;}
      save.disabled=true;void (this.kind==='projects'?this.plugin.setProjects(this.projects.map(p=>({...p,name:p.name.trim()}))):this.plugin.setSprints(this.sprints.map(s=>({...s,name:s.name.trim()})))).then(()=>this.close()).catch(()=>save.disabled=false);
    },'prism-primary');
  }
}
