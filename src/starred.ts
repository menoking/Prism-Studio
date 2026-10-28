import { ItemView, Menu, Notice, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import type PrismPlugin from './main';
import { starredPaths } from './model';

export const STARRED_VIEW='prism-starred-view';

type StarSort='recent'|'name'|'folder';
const SORT_LABELS:Record<StarSort,string>={recent:'最近星标',name:'笔记名称',folder:'所在目录'};
const SORT_ORDER:StarSort[]=['recent','name','folder'];

/**
 * Starred notes live in plugin data (path -> starred time), so no note is rewritten.
 * The file explorer is decorated with a data attribute instead of injected nodes:
 * native rows are re-created often, and attributes survive that churn.
 */
export class StarredNotes {
  private docs=new Map<Document,{observer:MutationObserver;timer:number}>();
  constructor(private plugin:PrismPlugin){}
  is(path:string):boolean{return Object.prototype.hasOwnProperty.call(this.plugin.data.starred,path);}
  count():number{return Object.keys(this.plugin.data.starred).length;}
  files():TFile[]{
    return starredPaths(this.plugin.data.starred)
      .map(path=>this.plugin.app.vault.getAbstractFileByPath(path))
      .filter((file):file is TFile=>file instanceof TFile && file.extension==='md');
  }
  async toggle(path:string,quiet=false):Promise<boolean>{
    if(!path)return false;
    const data=this.plugin.data;
    const starred=!this.is(path);
    if(starred)data.starred[path]=Date.now();else delete data.starred[path];
    await this.plugin.save();this.plugin.notify();this.refresh();
    if(!quiet)new Notice(starred?`已加入星标：${path.split('/').pop()?.replace(/\.md$/,'')}`:'已取消星标。');
    return starred;
  }
  async clear():Promise<void>{
    const count=this.count();if(!count)return;
    this.plugin.data.starred={};await this.plugin.save();this.plugin.notify();this.refresh();
    new Notice(`已清空 ${count} 篇星标笔记。`);
  }
  attach(doc:Document):void{
    if(!doc.defaultView || doc.defaultView.closed)return;
    if(!this.docs.has(doc)){
      // Editor typing also mutates the body, so only sidebar changes schedule a repaint.
      const observer=new MutationObserver(records=>{
        if(!records.some(record=>(record.target as Element).closest?.('.nav-files-container,.mod-left-split')))return;
        this.schedule(doc);
      });
      observer.observe(doc.body,{childList:true,subtree:true});
      this.docs.set(doc,{observer,timer:0});
    }
    this.refresh(doc);
  }
  private schedule(doc:Document):void{
    const state=this.docs.get(doc);if(!state || state.timer || !doc.defaultView || doc.defaultView.closed)return;
    state.timer=doc.defaultView.setTimeout(()=>{state.timer=0;this.refresh(doc);},120);
  }
  /** Applies or clears the marker on every file-explorer row; safe to call often. */
  refresh(doc?:Document):void{
    const targets=doc?[doc]:[...this.docs.keys()];
    for(const target of targets){
      if(!target.defaultView || target.defaultView.closed)continue;
      for(const title of target.querySelectorAll<HTMLElement>('.nav-file-title[data-path]')){
        const path=title.getAttribute('data-path')||'';
        const starred=this.is(path);
        if((title.dataset.prismStar==='true')!==starred)title.dataset.prismStar=String(starred);
      }
    }
  }
  destroy():void{
    for(const [doc,state] of this.docs){state.observer.disconnect();doc.defaultView?.clearTimeout(state.timer);}
    this.docs.clear();
  }
}

/** Sidebar tab that lists every starred note, next to the native file explorer. */
export class StarredView extends ItemView{
  private sort:StarSort='recent';
  private unsubscribe?:()=>void;
  private timer?:number;
  constructor(leaf:WorkspaceLeaf,public plugin:PrismPlugin){super(leaf);}
  getViewType():string{return STARRED_VIEW;}
  getDisplayText():string{return '星标笔记';}
  getIcon():string{return 'star';}
  async onOpen():Promise<void>{
    this.contentEl.addClass('prism-starred-view');
    this.unsubscribe=this.plugin.subscribe(()=>this.schedule());
    this.render();
  }
  async onClose():Promise<void>{this.unsubscribe?.();if(this.timer)window.clearTimeout(this.timer);}
  private schedule():void{if(this.timer)window.clearTimeout(this.timer);this.timer=window.setTimeout(()=>{this.timer=undefined;this.render();},80);}
  private sorted():TFile[]{
    const files=this.plugin.starred.files();
    if(this.sort==='name')return files.sort((a,b)=>a.basename.localeCompare(b.basename,'zh-CN'));
    if(this.sort==='folder')return files.sort((a,b)=>a.path.localeCompare(b.path,'zh-CN'));
    return files;
  }
  private render():void{
    const el=this.contentEl;if(!el)return;
    const scroll=el.scrollTop;el.empty();
    const files=this.sorted();
    const head=el.createDiv({cls:'prism-starred-head'});
    head.createEl('h4',{text:'星标笔记',cls:'prism-starred-title'});
    head.createSpan({cls:'prism-starred-count',text:String(files.length)});
    const tools=head.createDiv({cls:'prism-starred-tools'});
    const sort=this.iconButton(tools,'arrow-down-wide-narrow',`排序：${SORT_LABELS[this.sort]}`);
    sort.addEventListener('click',()=>{this.sort=SORT_ORDER[(SORT_ORDER.indexOf(this.sort)+1)%SORT_ORDER.length];this.render();});
    const studio=this.iconButton(tools,'panel-right-open','在工作台中查看星标页');
    studio.addEventListener('click',()=>void this.plugin.openStarredStudio());
    if(!files.length){
      const blank=el.createDiv({cls:'prism-starred-empty'});
      setIcon(blank.createSpan({cls:'prism-starred-empty-icon'}),'star');
      blank.createEl('p',{text:'还没有星标笔记。'});
      blank.createEl('small',{text:'打开笔记，点右上角的星标；或在文件列表、标签页右键选择「星标此笔记」。'});
      el.scrollTop=scroll;return;
    }
    const list=el.createDiv({cls:'prism-starred-list'});
    for(const file of files){
      const row=list.createDiv({cls:'prism-starred-row'});
      const link=row.createEl('button',{cls:'prism-starred-open',attr:{type:'button',title:file.path,'aria-label':`打开笔记：${file.basename}`}});
      link.createSpan({cls:'prism-starred-name prism-starred',text:file.basename});
      const folder=file.parent?.path;
      if(folder && folder!=='/')link.createSpan({cls:'prism-starred-folder',text:folder});
      link.addEventListener('click',()=>this.plugin.openFile(file.path));
      row.addEventListener('contextmenu',event=>{
        event.preventDefault();
        const menu=new Menu();
        menu.addItem(item=>item.setTitle('打开').setIcon('file-text').onClick(()=>this.plugin.openFile(file.path)));
        menu.addItem(item=>item.setTitle('浮动显示').setIcon('layers').onClick(()=>void this.plugin.floats.open(file)));
        menu.addItem(item=>item.setTitle('取消星标').setIcon('star-off').onClick(()=>void this.plugin.starred.toggle(file.path)));
        menu.showAtMouseEvent(event);
      });
      const remove=this.iconButton(row,'star-off',`取消星标：${file.basename}`);
      remove.addClass('prism-starred-remove');
      remove.addEventListener('click',event=>{event.stopPropagation();void this.plugin.starred.toggle(file.path);});
    }
    el.scrollTop=scroll;
  }
  private iconButton(parent:HTMLElement,name:string,label:string):HTMLButtonElement{
    const el=parent.createEl('button',{cls:'clickable-icon prism-starred-tool',attr:{type:'button','aria-label':label,title:label}});
    setIcon(el,name);return el;
  }
}
