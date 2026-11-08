import { FuzzySuggestModal, MarkdownView, Menu, Modal, Notice, TFile, moment, setIcon } from 'obsidian';
import type PrismPlugin from './main';
import { TAG_MAX_LENGTH, TAGS_PER_NOTE, normalizeTagName, normalizeTags, pathsWithTag, tagCounts, type TagCount } from './model';
import { tagPillColors, tagTone } from './appearance';
import { button } from './ui';

const SEPARATORS=/[,，;；]/;
const basename=(path:string)=>path.split('/').pop()?.replace(/\.md$/,'')||path;

/** Lists the notes that carry one tag; opened from a pill or a menu entry. */
export class TagNotesModal extends FuzzySuggestModal<TFile>{
  constructor(private plugin:PrismPlugin,private tag:string){super(plugin.app);this.setPlaceholder(`搜索带标签「${this.tag}」的笔记…`);}
  getItems():TFile[]{return this.plugin.tags.files(this.tag);}
  getItemText(file:TFile):string{return file.path;}
  onChooseItem(file:TFile):void{this.plugin.openFile(file.path);}
}

/** Adds, removes and edits the tags of a single note. Free text, several per submit. */
export class TagModal extends Modal{
  private input!:HTMLInputElement;
  private current!:HTMLElement;
  private suggestions!:HTMLElement;
  constructor(private plugin:PrismPlugin,private file:TFile){super(plugin.app);}
  onOpen():void{
    this.modalEl.addClass('prism-modal','prism-tag-modal');
    const el=this.contentEl;el.empty();
    el.createEl('h2',{text:'笔记标签'});
    el.createEl('p',{cls:'prism-tag-modal-note',text:this.file.basename});
    this.current=el.createDiv({cls:'prism-tag-modal-current'});
    const row=el.createDiv({cls:'prism-tag-input-row'});
    this.input=row.createEl('input',{cls:'prism-tag-input',attr:{type:'text',placeholder:'输入标签后回车，可用逗号分隔多个','aria-label':'标签内容',maxlength:String(TAG_MAX_LENGTH*4)}});
    const submit=()=>{const value=this.input.value;if(!value.trim())return;this.input.value='';void this.add(value);};
    this.input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit();}});
    button(row,'添加','plus',submit,'prism-primary');
    el.createEl('div',{cls:'prism-tag-suggestions-label',text:'已有标签'});
    this.suggestions=el.createDiv({cls:'prism-tag-suggestions'});
    el.createEl('p',{cls:'prism-footnote',text:'标签只保存在 Prism 数据中，不改写笔记正文；重命名笔记会自动跟随。'});
    const actions=el.createDiv({cls:'prism-modal-actions'});
    button(actions,'完成','check',()=>this.close(),'prism-primary');
    this.render();window.setTimeout(()=>this.input.focus(),40);
  }
  private async add(value:string):Promise<void>{
    const names=value.split(SEPARATORS).map(normalizeTagName).filter(Boolean);
    let changed=false;
    for(const name of names)changed=(await this.plugin.tags.add(this.file.path,name,true))||changed;
    if(!names.length)return;
    if(!changed)new Notice('这些标签已经在本笔记中。');
    this.render();
  }
  private render():void{
    const names=this.plugin.tags.of(this.file.path);
    this.current.empty();
    if(!names.length)this.current.createSpan({cls:'prism-tag-empty',text:'还没有标签。'});
    for(const name of names){
      const pill=this.plugin.tags.pill(this.contentEl.ownerDocument,name);
      pill.disabled=false;
      const remove=pill.createSpan({cls:'prism-tag-remove',attr:{'aria-hidden':'true'}});
      setIcon(remove,'x');
      pill.setAttribute('aria-label',`移除标签：${name}`);
      pill.addEventListener('click',()=>void this.plugin.tags.remove(this.file.path,name).then(()=>this.render()));
      this.current.append(pill);
    }
    this.suggestions.empty();
    const rest=this.plugin.tags.registry().filter(tag=>!names.includes(tag.name));
    if(!rest.length){this.suggestions.createSpan({cls:'prism-tag-empty',text:'暂无其他标签。'});return;}
    for(const tag of rest.slice(0,24)){
      const pill=this.plugin.tags.pill(this.contentEl.ownerDocument,tag.name);
      pill.addClass('is-suggestion');
      pill.createSpan({cls:'prism-tag-count',text:String(tag.count)});
      pill.setAttribute('aria-label',`添加标签：${tag.name}`);
      pill.addEventListener('click',()=>void this.plugin.tags.add(this.file.path,tag.name,true).then(()=>this.render()));
      this.suggestions.append(pill);
    }
  }
}

/**
 * Note tags live in plugin data (path -> tag names), so no note is rewritten.
 * The file explorer is decorated with data attributes instead of injected nodes, and the
 * tag row under the title is re-placed whenever the note re-renders.
 */
export class NoteTags{
  private docs=new Map<Document,{observer:MutationObserver;timer:number;hoverTimer:number;cleanup:(()=>void)[]}>();
  private painted=new WeakMap<MarkdownView,{signature:string;row:HTMLElement}>();
  private hover:HTMLElement|null=null;
  private hoverRow:HTMLElement|null=null;
  constructor(private plugin:PrismPlugin){}

  of(path:string):string[]{return path?this.plugin.data.tags[path]||[]:[];}
  has(path:string,name:string):boolean{return this.of(path).includes(normalizeTagName(name));}
  notes():number{return Object.keys(this.plugin.data.tags).length;}
  count():number{return this.registry().length;}
  registry():TagCount[]{return tagCounts(this.plugin.data.tags);}
  files(name:string):TFile[]{
    return pathsWithTag(this.plugin.data.tags,name)
      .map(path=>this.plugin.app.vault.getAbstractFileByPath(path))
      .filter((file):file is TFile=>file instanceof TFile && file.extension==='md');
  }

  async add(path:string,name:string,quiet=false):Promise<boolean>{
    const clean=normalizeTagName(name);
    if(!path||!clean)return false;
    const list=this.of(path);
    if(list.includes(clean)){if(!quiet)new Notice(`已带标签：${clean}`);return false;}
    if(list.length>=TAGS_PER_NOTE){if(!quiet)new Notice(`每篇笔记最多 ${TAGS_PER_NOTE} 个标签。`);return false;}
    await this.write({...this.plugin.data.tags,[path]:[...list,clean]});
    if(!quiet)new Notice(`已添加标签：${clean}`);
    return true;
  }
  async remove(path:string,name:string,quiet=false):Promise<void>{
    const clean=normalizeTagName(name),list=this.of(path);
    if(!list.includes(clean))return;
    const next=list.filter(tag=>tag!==clean),tags={...this.plugin.data.tags};
    if(next.length)tags[path]=next;else delete tags[path];
    await this.write(tags);
    if(!quiet)new Notice(`已移除标签：${clean}`);
  }
  async clear(path:string):Promise<void>{
    if(!this.of(path).length)return;
    const tags={...this.plugin.data.tags};delete tags[path];
    await this.write(tags);
    new Notice('已清除这篇笔记的标签。');
  }
  async clearAll():Promise<void>{
    const count=this.count();if(!count)return;
    await this.write({});
    new Notice(`已清空全部 ${count} 个标签。`);
  }
  /** Keeps a renamed note's tags; called from the vault rename event. */
  migrate(from:string,to:string):void{
    if(!this.plugin.data.tags[from])return;
    const tags={...this.plugin.data.tags};
    tags[to]=tags[from];delete tags[from];
    this.plugin.data.tags=tags;
  }
  forget(path:string):void{delete this.plugin.data.tags[path];}
  private async write(tags:Record<string,string[]>):Promise<void>{
    this.plugin.data.tags=normalizeTags(tags);
    await this.plugin.save();this.plugin.notify();this.repaint();
  }

  attach(doc:Document):void{
    if(!doc.defaultView||doc.defaultView.closed)return;
    if(!this.docs.has(doc)){
      const state:{observer:MutationObserver;timer:number;hoverTimer:number;cleanup:(()=>void)[]}={
        // Typing only mutates .cm-content; the tag row follows title/preview re-renders.
        observer:new MutationObserver(records=>{
          if(!records.some(record=>{
            const target=record.target as Element;
            if(!target?.closest)return false;
            if(target.closest('.prism-tag-row,.prism-tag-hover'))return false;
            if(target.closest('.cm-content'))return false;
            return !!target.closest('.markdown-preview-sizer,.cm-sizer,.markdown-preview-view');
          }))return;
          this.schedule(doc);
        }),
        timer:0,hoverTimer:0,cleanup:[]
      };
      state.observer.observe(doc.body,{childList:true,subtree:true});
      const listen=(target:EventTarget,type:string,fn:EventListener,options?:AddEventListenerOptions|boolean)=>{
        target.addEventListener(type,fn,options);state.cleanup.push(()=>target.removeEventListener(type,fn,options));
      };
      listen(doc,'pointerover',this.pointerOver(doc));
      listen(doc,'pointerdown',()=>this.hideHover());
      listen(doc,'scroll',()=>this.hideHover(),true);
      listen(doc.defaultView,'resize',()=>this.hideHover());
      this.docs.set(doc,state);
    }
    this.refresh(doc);
  }
  private schedule(doc:Document):void{
    const state=this.docs.get(doc);if(!state||state.timer||!doc.defaultView||doc.defaultView.closed)return;
    state.timer=doc.defaultView.setTimeout(()=>{state.timer=0;this.renderNotes(doc);},160);
  }
  /** Explorer decoration + note rows. Cheap enough to call on layout change. */
  refresh(doc?:Document):void{
    const targets=doc?[doc]:[...this.docs.keys()];
    for(const target of targets){
      if(!target.defaultView||target.defaultView.closed){this.docs.delete(target);continue;}
      const palette=this.plugin.data.settings.palette,dark=target.body.classList.contains('theme-dark');
      const scheme=`${palette}-${dark?'dark':'light'}`;
      for(const title of target.querySelectorAll<HTMLElement>('.nav-file-title[data-path]')){
        const path=title.getAttribute('data-path')||'';
        const names=this.of(path),signature=names.join('\u0001');
        if((title.dataset.prismTags||'')===signature && title.dataset.prismTagScheme===scheme)continue;
        title.dataset.prismTagScheme=scheme;
        if(!names.length){delete title.dataset.prismTags;title.style.removeProperty('--prism-tag-1');title.style.removeProperty('--prism-tag-2');title.style.removeProperty('--prism-tag-3');continue;}
        title.dataset.prismTags=signature;
        // Up to three tag colours become the gradient fill of the hover dot.
        const colors=names.slice(0,3).map(name=>tagPillColors(name,palette,dark).text.join(' '));
        for(let index=0;index<3;index++)title.style.setProperty(`--prism-tag-${index+1}`,colors[index]||colors[0]);
      }
    }
    this.renderNotes(doc);
  }
  /** Palette or theme changed: every pill and dot has to be rebuilt. */
  repaint():void{
    this.painted=new WeakMap();
    if(this.hover)this.hideHover();
    this.refresh();
  }
  /** Places the pill row under the inline title of every open note. */
  renderNotes(doc?:Document):void{
    const docs=doc?[doc]:[...this.docs.keys()];
    for(const target of docs){
      if(!target.defaultView||target.defaultView.closed){this.docs.delete(target);continue;}
      this.plugin.app.workspace.iterateAllLeaves(leaf=>{
        const view=leaf.view;
        if(!(view instanceof MarkdownView)||view.containerEl.ownerDocument!==target)return;
        this.paint(view);
      });
    }
  }
  private paint(view:MarkdownView):void{
    const file=view.file;
    if(!file||file.extension!=='md')return;
    const names=this.of(file.path);
    const previous=this.painted.get(view);
    if(!this.plugin.data.settings.noteTags||!names.length){
      previous?.row.remove();this.painted.delete(view);
      for(const stale of view.containerEl.querySelectorAll('.prism-tag-row'))stale.remove();
      return;
    }
    const signature=`${file.path}\u0002${names.join('\u0001')}`;
    const target=this.targetFor(view);
    if(!target)return;
    if(previous&&previous.signature===signature&&previous.row.isConnected&&this.holds(previous.row,target))return;
    previous?.row.remove();
    for(const stale of view.containerEl.querySelectorAll('.prism-tag-row'))stale.remove();
    const row=this.buildRow(view);
    this.attachRow(row,target);
    this.painted.set(view,{signature,row});
  }
  /** Reading mode and Live Preview mount their titles in different trees. */
  private targetFor(view:MarkdownView):{parent:HTMLElement;reference:ChildNode|null;where:'before'|'after'}|null{
    const root=view.containerEl;
    if(view.getMode()==='preview'){
      const preview=root.querySelector<HTMLElement>('.markdown-preview-sizer');
      if(!preview)return null;
      const title=preview.querySelector<HTMLElement>('.inline-title');
      if(title)return {parent:title.parentElement||preview,reference:title,where:'after'};
      const heading=[...preview.querySelectorAll<HTMLElement>('h1')].find(el=>!el.closest('.markdown-embed,.prism-deck'));
      if(heading)return {parent:heading.parentElement||preview,reference:heading,where:'after'};
      // An empty sizer is the first render pass; wait until Obsidian has mounted the note.
      if(preview.childElementCount)return {parent:preview,reference:preview.firstChild,where:'before'};
      return null;
    }
    const title=root.querySelector<HTMLElement>('.markdown-source-view .inline-title');
    if(title)return {parent:title.parentElement||root,reference:title,where:'after'};
    const sizer=root.querySelector<HTMLElement>('.markdown-source-view .cm-sizer');
    const content=root.querySelector<HTMLElement>('.markdown-source-view .cm-contentContainer');
    if(sizer&&content)return {parent:sizer,reference:content,where:'before'};
    return null;
  }
  private holds(row:HTMLElement,target:{parent:HTMLElement;reference:ChildNode|null;where:'before'|'after'}):boolean{
    if(row.parentElement!==target.parent)return false;
    return target.where==='after'?row.previousElementSibling===target.reference:row.nextElementSibling===target.reference;
  }
  private attachRow(row:HTMLElement,target:{parent:HTMLElement;reference:ChildNode|null;where:'before'|'after'}):void{
    row.classList.toggle('is-top',target.where==='before');
    const reference=target.reference;
    // A render pass can replace the reference node between measuring and inserting.
    if(target.where==='after'){
      if(reference?.parentNode)reference.after(row);else target.parent.appendChild(row);
    }else if(reference&&reference.parentNode===target.parent)target.parent.insertBefore(row,reference);
    else target.parent.insertBefore(row,target.parent.firstChild);
  }
  private buildRow(view:MarkdownView):HTMLElement{
    const file=view.file!,doc=view.containerEl.ownerDocument;
    const row=doc.createElement('div');
    row.className='prism-tag-row';
    row.setAttribute('data-prism-tag-row',file.path);
    for(const name of this.of(file.path)){
      const pill=this.pill(doc,name);
      pill.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.tagMenu(event,pill,name,file);});
      row.append(pill);
    }
    const add=doc.createElement('button');
    add.type='button';add.className='prism-tag-add';
    add.setAttribute('aria-label','为此笔记添加标签');add.title='添加标签';
    setIcon(add,'plus');
    add.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();new TagModal(this.plugin,file).open();});
    row.append(add);
    return row;
  }
  /** The pill markup is shared by the note row, the modal and the explorer hover card. */
  pill(doc:Document,name:string):HTMLButtonElement{
    const pill=doc.createElement('button');
    pill.type='button';pill.className='prism-tag-pill';pill.textContent=name;
    const tone=tagTone(name,this.plugin.data.settings.palette,doc.body.classList.contains('theme-dark'));
    pill.style.setProperty('--prism-tag-h',String(tone.hue));
    pill.style.setProperty('--prism-tag-s',`${tone.saturation}%`);
    pill.style.setProperty('--prism-tag-l',`${Math.round(tone.textLightness*100)}%`);
    pill.setAttribute('title',`标签：${name}`);
    return pill;
  }
  private tagMenu(event:MouseEvent,pill:HTMLElement,name:string,file:TFile):void{
    const menu=new Menu();
    menu.addItem(item=>item.setTitle(`查看「${name}」的笔记`).setIcon('search').onClick(()=>new TagNotesModal(this.plugin,name).open()));
    menu.addItem(item=>item.setTitle('添加标签…').setIcon('plus').onClick(()=>new TagModal(this.plugin,file).open()));
    menu.addSeparator();
    menu.addItem(item=>item.setTitle(`从本笔记移除「${name}」`).setIcon('x').onClick(()=>void this.remove(file.path,name)));
    menu.showAtMouseEvent(event);pill.blur();
  }

  private pointerOver(doc:Document):EventListener{
    return event=>{
      const target=(event as PointerEvent).target as Element|null;
      const row=target?.closest?.<HTMLElement>('.nav-file-title[data-path]')||null;
      if(row===this.hoverRow)return;
      this.hideHover();this.hoverRow=row;
      if(!row||!this.plugin.data.settings.tagHover)return;
      const names=this.of(row.getAttribute('data-path')||'');
      if(!names.length)return;
      // Suppress the app's own file tooltip right away: it sits in the same corner as the card,
      // so the two would overlap for the whole hover. Its timestamps move into the card below.
      doc.body.classList.add('prism-tag-hovering');
      const state=this.docs.get(doc);if(!state||!doc.defaultView)return;
      doc.defaultView.clearTimeout(state.hoverTimer);
      state.hoverTimer=doc.defaultView.setTimeout(()=>{
        state.hoverTimer=0;
        if(this.hoverRow===row&&row.isConnected)this.showHover(row,doc);
      },220);
    };
  }
  private showHover(row:HTMLElement,doc:Document):void{
    const path=row.getAttribute('data-path')||'',names=this.of(path);
    if(!names.length)return;
    if(!this.hover||!this.hover.isConnected||this.hover.ownerDocument!==doc){
      const card=doc.createElement('div');
      card.className='prism-tag-hover';card.setAttribute('role','tooltip');
      doc.body.appendChild(card);this.hover=card;
    }
    const card=this.hover;card.replaceChildren();
    const head=doc.createElement('div');head.className='prism-tag-hover-head';head.textContent=basename(path);
    const list=doc.createElement('div');list.className='prism-tag-hover-list';
    for(const name of names){const pill=this.pill(doc,name);pill.classList.add('is-compact');pill.tabIndex=-1;list.append(pill);}
    card.append(head);
    // The app's own file tooltip shows these two timestamps. It is suppressed while a tagged
    // row is hovered, so the card carries the same facts instead of dropping them.
    const file=this.plugin.app.vault.getAbstractFileByPath(path);
    if(file instanceof TFile){
      const meta=doc.createElement('div');meta.className='prism-tag-hover-meta';
      for(const line of [`修改 ${moment(file.stat.mtime).format('YYYY-MM-DD HH:mm')}`,`创建 ${moment(file.stat.ctime).format('YYYY-MM-DD HH:mm')}`]){
        const item=doc.createElement('div');item.textContent=line;meta.append(item);
      }
      card.append(meta);
    }
    card.append(list);
    // Measure off-screen first so the card can flip to the left of a narrow sidebar.
    card.style.visibility='hidden';card.classList.add('is-visible');
    const rect=row.getBoundingClientRect(),size=card.getBoundingClientRect();
    const left=rect.right+10+size.width>doc.defaultView!.innerWidth?Math.max(8,rect.left-size.width-10):rect.right+10;
    const top=Math.max(8,Math.min(doc.defaultView!.innerHeight-size.height-8,rect.top-4));
    card.style.left=`${Math.round(left)}px`;card.style.top=`${Math.round(top)}px`;card.style.visibility='';
  }
  private hideHover():void{
    this.hoverRow=null;
    for(const doc of this.docs.keys())doc.body.classList.remove('prism-tag-hovering');
    if(!this.hover)return;
    this.hover.classList.remove('is-visible');
    this.hover.replaceChildren();
  }
  destroy():void{
    for(const [doc,state] of this.docs){
      state.observer.disconnect();state.cleanup.forEach(fn=>fn());
      doc.defaultView?.clearTimeout(state.timer);doc.defaultView?.clearTimeout(state.hoverTimer);
      for(const row of doc.querySelectorAll('.prism-tag-row'))row.remove();
    }
    this.docs.clear();this.hover?.remove();this.hover=null;this.hoverRow=null;this.painted=new WeakMap();
  }
}
