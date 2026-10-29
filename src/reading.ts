import { MarkdownView } from 'obsidian';
import type PrismPlugin from './main';

type Mark={title:string;level:number;offset:number;line?:number};
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));

class ReadingRail {
  readonly el:HTMLElement;
  private thumb:HTMLElement;
  private ticks:HTMLElement;
  private tooltip:HTMLElement;
  private marks:Mark[]=[];
  private signature='';
  private frame=0;
  private dragging=false;
  private dragOffset=0;
  private hoverY:number|null=null;
  private cleanup:(()=>void)[]=[];
  private resize:ResizeObserver;
  private win:Window;
  constructor(readonly scroll:HTMLElement,private plugin:PrismPlugin){
    const doc=scroll.ownerDocument;this.win=doc.defaultView!;
    this.el=doc.body.createDiv({cls:'prism-reading-rail',attr:{role:'scrollbar','aria-label':'章节滚动条','aria-orientation':'vertical',tabindex:'0','aria-valuemin':'0','aria-valuemax':'100'}});
    this.el.createDiv({cls:'prism-rail-track'});this.ticks=this.el.createDiv({cls:'prism-rail-ticks'});
    this.thumb=this.el.createDiv({cls:'prism-rail-thumb'});this.tooltip=this.el.createDiv({cls:'prism-rail-tooltip',attr:{role:'tooltip'}});
    scroll.classList.add('prism-scroll-managed');
    this.listen(scroll,'scroll',()=>this.schedule());this.listen(doc,'scroll',()=>this.schedule(),true);
    this.listen(this.win,'resize',()=>this.schedule());
    this.listen(doc,'pointermove',()=>{if(scroll.closest('.prism-floating.is-dragging'))this.schedule();});
    this.listen(this.el,'pointermove',event=>{this.hoverY=(event as PointerEvent).clientY;this.schedule();});
    this.listen(this.el,'pointerleave',()=>{if(!this.dragging){this.hoverY=null;this.tooltip.classList.remove('is-visible');}});
    this.listen(this.el,'pointerdown',event=>this.startDrag(event as PointerEvent));
    this.listen(this.win,'pointermove',event=>{if(this.dragging)this.drag(event as PointerEvent);});
    this.listen(this.win,'pointerup',()=>this.endDrag());this.listen(this.win,'pointercancel',()=>this.endDrag());
    this.listen(this.el,'keydown',event=>{
      const e=event as KeyboardEvent;let target=this.scroll.scrollTop;
      if(e.key==='ArrowDown')target+=48;else if(e.key==='ArrowUp')target-=48;
      else if(e.key==='PageDown')target+=this.scroll.clientHeight*.85;else if(e.key==='PageUp')target-=this.scroll.clientHeight*.85;
      else if(e.key==='Home')target=0;else if(e.key==='End')target=this.scroll.scrollHeight;else return;
      e.preventDefault();this.scroll.scrollTop=target;this.schedule();
    });
    this.resize=new ResizeObserver(()=>this.schedule());this.resize.observe(scroll);this.refresh();
  }
  private listen(target:EventTarget,type:string,fn:EventListener,options?:boolean):void {target.addEventListener(type,fn,options);this.cleanup.push(()=>target.removeEventListener(type,fn,options));}
  private editor():MarkdownView|undefined {
    let found:MarkdownView|undefined;
    this.plugin.app.workspace.iterateAllLeaves(leaf=>{if(leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(this.scroll))found=leaf.view;});return found;
  }
  refresh():void {
    const rect=this.scroll.getBoundingClientRect(),view=this.editor();const isSource=this.scroll.classList.contains('cm-scroller');
    const maximum=Math.max(1,this.scroll.scrollHeight-this.scroll.clientHeight);
    if(isSource && view?.file){
      const headings=this.plugin.app.metadataCache.getFileCache(view.file)?.headings||[];
      const lines=Math.max(1,view.editor.lineCount()-1);
      this.marks=headings.map(h=>({title:h.heading,level:h.level,line:h.position.start.line,offset:h.position.start.line/lines*maximum}));
    }else{
      // Read positions from the rendered note, not the sidebar outline or a guessed character count.
      const rendered=[...this.scroll.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].filter(h=>!h.closest('.markdown-embed,.prism-deck'))
        .map(h=>({title:(h.textContent||'').replace(/\s+/g,' ').trim(),level:Number(h.tagName[1]),offset:Math.max(0,h.getBoundingClientRect().top-rect.top+this.scroll.scrollTop-22)}));
      const cached=view?.file?this.plugin.app.metadataCache.getFileCache(view.file)?.headings:undefined;
      if(cached?.length){
        const lines=Math.max(1,(view!.getViewData().match(/\n/g)||[]).length);
        const used=new Set<number>();
        this.marks=cached.map(h=>{
          const index=rendered.findIndex((r,i)=>!used.has(i)&&r.title===h.heading&&r.level===h.level);
          if(index>=0)used.add(index);
          return {title:h.heading,level:h.level,line:h.position.start.line,offset:index>=0?rendered[index].offset:h.position.start.line/lines*maximum};
        });
        this.marks.sort((a,b)=>a.offset-b.offset);
      }else this.marks=rendered;
    }
    const signature=this.marks.map(m=>`${m.title}:${m.level}:${Math.round(m.offset)}`).join('|')+`/${maximum}`;
    if(signature!==this.signature){
      this.signature=signature;this.ticks.empty();
      for(let i=0;i<=50;i++)this.ticks.createDiv({cls:`prism-rail-scale${i%5===0?' is-major':''}`,attr:{style:`top:${i*2}%`}});
      for(const mark of this.marks){
        const tick=this.ticks.createEl('button',{cls:'prism-rail-heading',attr:{'aria-label':mark.title,title:mark.title,style:`top:${clamp(mark.offset/maximum)*100}%;--prism-heading-level:${mark.level}`}});
        tick.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();});
        tick.addEventListener('click',event=>{event.stopPropagation();this.jump(mark);});
      }
    }
    this.schedule();
  }
  private jump(mark:Mark):void {
    const view=this.editor();
    if(mark.line!==undefined && view && this.scroll.classList.contains('cm-scroller')){view.editor.scrollIntoView({from:{line:mark.line,ch:0},to:{line:mark.line,ch:0}},true);}
    // Reading view used to jump with openLinkText, which re-opened the note: an open code block
    // collapsed, the caret's place was lost and the preview re-rendered on every tick. The
    // heading offsets are already measured against this scroller, so scroll it directly.
    else this.scroll.scrollTo({top:Math.max(0,mark.offset)});
    this.schedule();
  }
  private schedule():void {if(!this.frame)this.frame=this.win.requestAnimationFrame(()=>{this.frame=0;this.paint();});}
  private paint():void {
    const r=this.scroll.getBoundingClientRect(),height=Math.min(r.bottom,this.win.innerHeight)-Math.max(0,r.top)-20;
    const max=this.scroll.scrollHeight-this.scroll.clientHeight;
    const visible=this.scroll.isConnected && r.width>40 && height>70 && max>2 && !this.scroll.closest('.is-editing');
    // The native bar is only suppressed while the rail can replace it. Hiding it unconditionally
    // left source mode and narrow panes with no scrollbar at all.
    this.scroll.classList.toggle('prism-scroll-managed',visible);
    this.el.hidden=!visible;if(!visible)return;
    this.el.style.left=`${r.right-25}px`;this.el.style.top=`${Math.max(0,r.top)+10}px`;this.el.style.height=`${height}px`;
    this.el.style.zIndex=String(Number(this.scroll.closest<HTMLElement>('.prism-floating')?.style.zIndex||50)+1);
    const size=Math.max(32,height*this.scroll.clientHeight/this.scroll.scrollHeight),travel=height-size;
    const fraction=clamp(this.scroll.scrollTop/max);
    this.thumb.style.height=`${size}px`;this.thumb.style.transform=`translateY(${fraction*travel}px)`;
    this.el.setAttribute('aria-valuenow',String(Math.round(fraction*100)));
    const current=[...this.marks].reverse().find(m=>m.offset<=this.scroll.scrollTop+40);
    this.el.setAttribute('aria-valuetext',`${Math.round(fraction*100)}%${current?' · '+current.title:''}`);
    const buttons=this.ticks.querySelectorAll('.prism-rail-heading');buttons.forEach((button,i)=>button.classList.toggle('is-current',this.marks[i]===current));
    if(this.hoverY!==null){
      const y=clamp((this.hoverY-(Math.max(0,r.top)+10))/height);
      const target=y*max,mark=[...this.marks].reverse().find(m=>m.offset<=target+10)||this.marks[0];
      this.tooltip.textContent=`${mark?.title||'文档'} · ${Math.round(y*100)}%`;
      this.tooltip.style.top=`${clamp(y*height,18,height-18)}px`;this.tooltip.classList.add('is-visible');
    }
  }
  private startDrag(event:PointerEvent):void {
    if(event.button!==0)return;
    // Pointer scrolling must not blur the editor: Live Preview would replace an
    // active code block with its rendered widget, changing the document height.
    // Keyboard users can still focus the rail with Tab and use its arrow keys.
    event.preventDefault();this.dragging=true;this.el.classList.add('is-dragging');
    const thumb=this.thumb.getBoundingClientRect();this.dragOffset=event.target===this.thumb?event.clientY-thumb.top:thumb.height/2;
    try{this.el.setPointerCapture(event.pointerId);}catch{/* Synthetic events and legacy hosts. */}this.drag(event);
  }
  private drag(event:PointerEvent):void {
    const r=this.el.getBoundingClientRect(),travel=r.height-this.thumb.getBoundingClientRect().height;
    this.scroll.scrollTop=clamp((event.clientY-r.top-this.dragOffset)/Math.max(1,travel))*(this.scroll.scrollHeight-this.scroll.clientHeight);
    this.hoverY=event.clientY;this.schedule();
  }
  private endDrag():void {this.dragging=false;this.el.classList.remove('is-dragging');}
  destroy():void {this.endDrag();this.cleanup.forEach(fn=>fn());this.resize.disconnect();this.win.cancelAnimationFrame(this.frame);this.el.remove();this.scroll.classList.remove('prism-scroll-managed');}
}

export class ReadingEnhancements {
  private documents=new Map<Document,{observer:MutationObserver;timer:number}>();
  private rails=new Map<HTMLElement,ReadingRail>();
  constructor(private plugin:PrismPlugin){}
  attach(doc:Document):void {
    if(!doc.defaultView || doc.defaultView.closed)return;
    if(!this.documents.has(doc)){
      const state={observer:new MutationObserver(records=>{
        if(records.some(r=>!(r.target as HTMLElement).closest?.('.prism-reading-rail')))this.schedule(doc);
      }),timer:0};state.observer.observe(doc.body,{childList:true,subtree:true});this.documents.set(doc,state);
    }
    this.schedule(doc);
  }
  private schedule(doc:Document):void {
    const state=this.documents.get(doc);if(!state||state.timer||!doc.defaultView||doc.defaultView.closed)return;
    state.timer=doc.defaultView.setTimeout(()=>{state.timer=0;this.refresh();},120);
  }
  refresh():void {
    for(const [scroll,rail] of this.rails)if(!scroll.isConnected || !this.plugin.data.settings.readingRail){rail.destroy();this.rails.delete(scroll);}else rail.refresh();
    if(!this.plugin.data.settings.readingRail)return;
    for(const doc of this.documents.keys()){
      if(!doc.defaultView || doc.defaultView.closed)continue;
      for(const scroll of doc.querySelectorAll<HTMLElement>('.markdown-reading-view > .markdown-preview-view, .markdown-source-view .cm-scroller, .prism-floating-body:not(.is-editing)')){
        if(!this.rails.has(scroll))this.rails.set(scroll,new ReadingRail(scroll,this.plugin));
      }
    }
  }
  destroy():void {for(const rail of this.rails.values())rail.destroy();this.rails.clear();for(const [doc,state] of this.documents){state.observer.disconnect();doc.defaultView?.clearTimeout(state.timer);}this.documents.clear();}
}
