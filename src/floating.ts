import { Component, MarkdownRenderer, Notice, Platform, TFile } from 'obsidian';
import type PrismPlugin from './main';
import { ConfirmModal } from './modals';
import { button, icon } from './ui';

interface FloatingNote {
  file:TFile;el:HTMLElement;inner:HTMLElement;body:HTMLElement;title:HTMLElement;
  component:Component;renderComponent?:Component;editing:boolean;dirty:boolean;
  original:string;textarea?:HTMLTextAreaElement;minimized:boolean;height:string;
  dragCleanup?:()=>void;generation:number;
}
export class FloatingNotes{
  private notes:FloatingNote[]=[];private z=1000;
  constructor(private plugin:PrismPlugin){}
  async open(file:TFile,doc:Document=document):Promise<void>{
    const existing=this.notes.find(n=>n.file.path===file.path && n.el.ownerDocument===doc);
    if(existing){if(existing.minimized)this.minimize(existing);this.activate(existing);return;}
    const win=doc.defaultView||window;
    const el=doc.createElement('section');el.className='prism-floating';el.setAttribute('role','dialog');el.setAttribute('aria-label',`浮动笔记：${file.basename}`);el.tabIndex=-1;
    const offset=this.notes.length%5*24,width=Math.min(660,win.innerWidth-32),height=Math.min(760,win.innerHeight-80);
    el.style.width=`${width}px`;el.style.height=`${height}px`;el.style.left=`${Math.max(16,(win.innerWidth-width)/2+offset)}px`;el.style.top=`${Math.max(32,(win.innerHeight-height)/2+offset)}px`;
    doc.body.appendChild(el);const inner=el.createDiv({cls:'prism-floating-inner'});const header=inner.createDiv({cls:'prism-floating-header',attr:{tabindex:'0','aria-label':'拖动浮动笔记。方向键可移动。'}});
    const dots=header.createDiv({cls:'prism-window-dots'});for(const color of ['red','yellow','green'])dots.createSpan({cls:`prism-window-dot ${color}`});
    const title=header.createEl('strong',{text:file.basename,cls:'prism-floating-title'});
    const actions=header.createDiv({cls:'prism-floating-actions'});const body=inner.createDiv({cls:'prism-floating-body markdown-preview-view'});
    const component=new Component();this.plugin.addChild(component);
    const note:FloatingNote={file,el,inner,body,title,component,editing:false,dirty:false,original:'',minimized:false,height:el.style.height,generation:0};this.notes.push(note);
    button(actions,'阅读 / 编辑','pencil',()=>void this.toggleEdit(note),'prism-icon-only');
    button(actions,'打开原笔记','arrow-up-right',()=>this.plugin.openFile(note.file.path),'prism-icon-only');
    if(Platform.isDesktopApp)button(actions,'原生独立窗口','external-link',()=>{const leaf=this.plugin.app.workspace.openPopoutLeaf();void leaf.openFile(note.file);},'prism-icon-only');
    button(actions,'最小化 / 还原','minus',()=>this.minimize(note),'prism-icon-only');
    button(actions,'关闭','x',()=>this.requestClose(note),'prism-icon-only');
    component.registerDomEvent(el,'pointerdown',()=>this.activate(note));
    component.registerDomEvent(header,'pointerdown',event=>this.startDrag(note,event));
    component.registerDomEvent(header,'keydown',event=>{if(event.target!==header||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();this.move(note,(event.key==='ArrowRight'?10:event.key==='ArrowLeft'?-10:0),(event.key==='ArrowDown'?10:event.key==='ArrowUp'?-10:0));});
    component.registerDomEvent(el,'keydown',event=>{if(event.key==='Escape'){event.stopPropagation();this.requestClose(note);}if((event.ctrlKey||event.metaKey)&&event.key==='s'&&note.editing){event.preventDefault();void this.saveNote(note);}});
    component.registerDomEvent(win,'resize',()=>this.clamp(note));
    component.registerEvent(this.plugin.app.vault.on('modify',changed=>{if(changed.path===note.file.path&&!note.editing)void this.render(note);}));
    component.registerEvent(this.plugin.app.vault.on('rename',changed=>{if(changed===note.file)note.title.setText(note.file.basename);}));
    component.registerEvent(this.plugin.app.vault.on('delete',changed=>{if(changed===note.file){new Notice('浮动笔记对应的文件已删除。');this.close(note);}}));
    component.register(()=>note.dragCleanup?.());
    this.activate(note);await this.render(note);el.focus();
  }
  private activate(note:FloatingNote):void{for(const other of this.notes)other.el.removeClass('is-front');note.el.addClass('is-front');note.el.style.zIndex=String(++this.z);note.el.style.transform='none';}
  private async render(note:FloatingNote):Promise<void>{
    const generation=++note.generation;
    try{
      const content=await this.plugin.app.vault.read(note.file);
      if(!note.el.isConnected||generation!==note.generation)return;
      note.original=content;note.body.empty();if(note.renderComponent)note.component.removeChild(note.renderComponent);
      note.renderComponent=new Component();note.component.addChild(note.renderComponent);
      const preview=note.body.createDiv({cls:'markdown-preview-sizer markdown-rendered prism-note-preview'});
      await MarkdownRenderer.render(this.plugin.app,content,preview,note.file.path,note.renderComponent);
      if(!content.trim())preview.createEl('p',{text:'这篇笔记还是空的，点击铅笔开始编辑。',cls:'prism-muted'});
      note.renderComponent.registerDomEvent(preview,'click',event=>{
        const target=event.target as HTMLElement;const link=target.closest<HTMLAnchorElement>('a.internal-link');if(link){event.preventDefault();event.stopPropagation();void this.plugin.app.workspace.openLinkText(link.getAttribute('data-href')||link.getAttribute('href')||'',note.file.path,event.ctrlKey||event.metaKey);}
      });
    }catch(error){new Notice(`无法读取浮动笔记：${String(error)}`);}
  }
  private async toggleEdit(note:FloatingNote):Promise<void>{
    if(note.editing){if(note.dirty){await this.saveNote(note);if(note.dirty)return;}note.editing=false;note.el.removeClass('is-editing');await this.render(note);return;}
    const recovery=this.plugin.data.drafts[note.file.path];
    note.original=recovery?.original??await this.plugin.app.vault.read(note.file);note.editing=true;note.el.addClass('is-editing');note.body.empty();
    const toolbar=note.body.createDiv({cls:'prism-floating-edit-bar'});toolbar.createSpan({text:'Markdown · Ctrl/Cmd + S 保存'});button(toolbar,'保存','check',()=>void this.saveNote(note),'prism-primary');
    note.textarea=note.body.createEl('textarea',{cls:'prism-floating-editor',attr:{'aria-label':`编辑 ${note.file.basename}`,spellcheck:'false'}});note.textarea.value=recovery?.content??note.original;note.dirty=note.textarea.value!==note.original;
    if(recovery){note.title.setText(`${note.file.basename} · 已恢复草稿`);new Notice('已恢复浮动笔记草稿。保存前会检查原笔记是否发生变化。');}
    note.textarea.addEventListener('input',()=>{note.dirty=note.textarea!.value!==note.original;note.title.setText(`${note.file.basename}${note.dirty?' · 未保存':''}`);if(note.dirty)this.plugin.data.drafts[note.file.path]={content:note.textarea!.value,original:note.original,updatedAt:Date.now()};else delete this.plugin.data.drafts[note.file.path];void this.plugin.save().catch(()=>undefined);});note.textarea.focus();
  }
  private async saveNote(note:FloatingNote):Promise<void>{
    if(!note.textarea || !note.dirty)return;
    try{const content=note.textarea.value;await this.plugin.app.vault.process(note.file,current=>{if(current!==note.original)throw new Error('原笔记已在别处修改。请先复制当前草稿，或放弃草稿后重新打开，避免覆盖。');return content;});note.original=content;note.dirty=note.textarea.value!==content;if(!note.dirty)delete this.plugin.data.drafts[note.file.path];await this.plugin.save();note.title.setText(note.file.basename);new Notice('笔记已保存。');}catch(error){new Notice(String(error));}
  }
  private requestClose(note:FloatingNote):void{if(note.dirty)new ConfirmModal(this.plugin.app,'放弃未保存的草稿？','当前浮动窗口有修改尚未保存。',async()=>{delete this.plugin.data.drafts[note.file.path];await this.plugin.save();this.close(note);}).open();else this.close(note);}
  private close(note:FloatingNote):void{note.generation++;note.dragCleanup?.();note.el.remove();this.plugin.removeChild(note.component);this.notes=this.notes.filter(n=>n!==note);}
  closeAll(force=false):void{
    if(!force && this.notes.some(n=>n.dirty)){new ConfirmModal(this.plugin.app,'关闭所有浮动笔记？','未保存的草稿会保留在插件数据中，下次打开笔记并点击编辑可以恢复。',async()=>{await this.plugin.save();this.closeAll(true);}).open();return;}
    for(const note of [...this.notes])this.close(note);
  }
  arrange():void{
    const count=this.notes.length;if(!count){new Notice('先通过笔记命令或工作台打开浮动笔记。');return;}
    this.notes.forEach((note,index)=>{const win=note.el.ownerDocument.defaultView||window;const width=Math.min(620,win.innerWidth-64),height=Math.min(720,win.innerHeight-100),offset=(index-(count-1)/2)*16;note.el.style.width=`${width}px`;note.el.style.height=`${height}px`;note.el.style.left=`${Math.max(16,(win.innerWidth-width)/2+offset)}px`;note.el.style.top=`${Math.max(32,(win.innerHeight-height)/2+offset)}px`;note.minimized=false;note.el.removeClass('is-minimized');note.height=`${height}px`;note.el.style.zIndex=String(++this.z);note.el.style.transform=`rotate(${index===count-1?0:(index%2===0?-1:1)}deg)`;});this.activate(this.notes[count-1]);
  }
  private minimize(note:FloatingNote):void{note.minimized=!note.minimized;if(note.minimized){note.height=note.el.style.height;note.el.style.height='48px';}else note.el.style.height=note.height;note.el.classList.toggle('is-minimized',note.minimized);this.clamp(note);}
  private startDrag(note:FloatingNote,event:PointerEvent):void{
    if(event.button!==0 || (event.target as HTMLElement).closest('button'))return;
    event.preventDefault();this.activate(note);note.dragCleanup?.();const win=note.el.ownerDocument.defaultView||window;
    let x=event.clientX,y=event.clientY;note.el.addClass('is-dragging');
    const move=(next:PointerEvent)=>{this.move(note,next.clientX-x,next.clientY-y);x=next.clientX;y=next.clientY;};
    const cleanup=()=>{win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',cleanup);win.removeEventListener('pointercancel',cleanup);note.el.removeClass('is-dragging');note.dragCleanup=undefined;};
    win.addEventListener('pointermove',move);win.addEventListener('pointerup',cleanup);win.addEventListener('pointercancel',cleanup);note.dragCleanup=cleanup;
  }
  private move(note:FloatingNote,dx:number,dy:number):void{note.el.style.left=`${parseFloat(note.el.style.left)+dx}px`;note.el.style.top=`${parseFloat(note.el.style.top)+dy}px`;this.clamp(note);}
  private clamp(note:FloatingNote):void{const win=note.el.ownerDocument.defaultView||window;note.el.style.left=`${Math.max(0,Math.min(parseFloat(note.el.style.left),win.innerWidth-120))}px`;note.el.style.top=`${Math.max(0,Math.min(parseFloat(note.el.style.top),win.innerHeight-48))}px`;}
}
