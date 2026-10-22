import { MarkdownRenderChild, MarkdownRenderer, setIcon } from 'obsidian';
import type PrismPlugin from './main';
import { imageSources, imageRuns, inlineImageSources, fitImage } from './image-groups';
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));

class ImageDeck {
  private frame=0;
  private resizeFrame=0;
  private win:Window;
  private scroll:HTMLElement;
  private cards:HTMLElement[];
  private sticky:HTMLElement;
  private caption:HTMLElement;
  private resize:ResizeObserver;
  private expanded=false;
  private manualProgress:number|null=null;
  private toggle:HTMLButtonElement;
  private toolbar:HTMLElement;
  private footer:HTMLElement;
  private cleanups:(()=>void)[]=[];
  constructor(readonly el:HTMLElement,private plugin:PrismPlugin,readonly auto=false,private origins:{card:HTMLElement;parent:HTMLElement;anchor?:Comment}[]=[]){
    this.win=el.ownerDocument.defaultView!;
    this.scroll=el.closest<HTMLElement>('.prism-floating-body,.markdown-preview-view')!;
    this.cards=[...el.children] as HTMLElement[];
    this.toggle=el.createEl('button',{cls:'prism-deck-toggle',attr:{type:'button','aria-expanded':'false','aria-label':'展开图片组',title:'展开图片组'}});
    setIcon(this.toggle,'expand');
    this.listen(this.toggle,'click',()=>this.setExpanded(!this.expanded));
    this.toolbar=el.createDiv({cls:'prism-deck-toolbar'});this.toolbar.appendChild(this.toggle);
    this.sticky=el.createDiv({cls:'prism-deck-stage'});
    for(const [index,card] of this.cards.entries()){
      card.classList.add('prism-deck-card');card.style.zIndex=String(index+1);this.sticky.appendChild(card);
    }
    const bar=this.sticky.createDiv({cls:'prism-deck-controls'});
    this.caption=bar.createSpan({cls:'prism-deck-caption'});
    const previous=bar.createEl('button',{text:'←',attr:{'aria-label':'上一张图片'}}),next=bar.createEl('button',{text:'→',attr:{'aria-label':'下一张图片'}});
    previous.addEventListener('click',()=>this.go(-1));next.addEventListener('click',()=>this.go(1));
    this.footer=el.createDiv({cls:'prism-deck-footer'});
    const collapse=this.footer.createEl('button',{cls:'prism-deck-collapse',attr:{type:'button','aria-label':'收起图片组'}});
    setIcon(collapse,'chevrons-up');collapse.createSpan({text:'收起图片组'});
    this.listen(collapse,'click',()=>this.setExpanded(false));
    el.setAttribute('role','group');el.setAttribute('aria-label',`滚动图片堆叠 · ${this.cards.length} 张`);
    this.listen(this.scroll,'scroll',()=>{this.manualProgress=null;this.schedule();});this.listen(this.win,'resize',()=>this.resizeDeck());
    this.listen(el,'load',()=>this.resizeDeck(),true);
    this.listen(this.win.matchMedia('(prefers-reduced-motion: reduce)'),'change',()=>this.resizeDeck());
    this.resize=new ResizeObserver(()=>{if(!this.resizeFrame)this.resizeFrame=this.win.requestAnimationFrame(()=>{this.resizeFrame=0;this.resizeDeck();});});this.resize.observe(this.scroll);
    this.resizeDeck();
  }
  private listen(target:EventTarget,type:string,fn:EventListener,options?:boolean):void {target.addEventListener(type,fn,options);this.cleanups.push(()=>target.removeEventListener(type,fn,options));}
  private reduced():boolean {return !this.plugin.data.settings.imageMotion || this.win.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  private flat():boolean {return this.expanded||this.reduced();}
  private setExpanded(value:boolean):void {
    const closing=this.expanded&&!value;this.expanded=value;
    this.toggle.setAttribute('aria-expanded',String(value));
    const label=value?'收起图片组':'展开图片组';this.toggle.setAttribute('aria-label',label);this.toggle.title=label;
    setIcon(this.toggle,value?'minimize-2':'expand');this.resizeDeck();
    if(closing){
      this.scroll.scrollTop+=this.el.getBoundingClientRect().top-this.scroll.getBoundingClientRect().top-24;
      this.toggle.focus({preventScroll:true});
    }
  }
  refresh():void {this.resizeDeck();}
  append(origins:{card:HTMLElement;parent:HTMLElement;anchor?:Comment}[]):void {
    for(const origin of origins){const index=this.cards.length;this.origins.push(origin);this.cards.push(origin.card);origin.card.classList.add('prism-deck-card');origin.card.style.zIndex=String(index+1);this.sticky.insertBefore(origin.card,this.sticky.querySelector('.prism-deck-controls'));}
    this.el.setAttribute('aria-label',`滚动图片堆叠 · ${this.cards.length} 张`);this.resizeDeck();
  }
  private resizeDeck():void {
    if(!this.scroll.isConnected || this.scroll.clientHeight<100)return;
    const width=Math.max(80,Math.min(760,this.el.clientWidth)-68);
    const maxHeight=Math.max(120,Math.min(480,this.scroll.clientHeight*.6)-68);
    const cover=this.plugin.data.settings.imageFit==='cover';
    this.el.classList.toggle('is-cover',cover);
    let tallest=0;
    for(const card of this.cards){
      const image=card.querySelector('img');
      const size=cover?{width,height:Math.min(maxHeight,width*2/3)}:fitImage(image?.naturalWidth||0,image?.naturalHeight||0,width,maxHeight);
      card.style.setProperty('--prism-card-width',`${size.width}px`);card.style.setProperty('--prism-card-height',`${size.height}px`);
      tallest=Math.max(tallest,size.height);
    }
    const height=Math.max(188,tallest+68);
    const step=Math.max(100,Math.min(180,this.scroll.clientHeight*.22));
    this.el.classList.toggle('is-static',this.flat());
    this.el.classList.toggle('is-expanded',this.expanded);
    this.el.style.setProperty('--prism-deck-height',`${height}px`);this.el.style.setProperty('--prism-deck-step',`${step}px`);
    this.el.style.height=this.flat()?'auto':`${height+(this.cards.length-1)*step+70}px`;
    this.schedule();
  }
  private schedule():void {if(!this.frame)this.frame=this.win.requestAnimationFrame(()=>{this.frame=0;this.paint();});}
  private progress():number {
    if(this.manualProgress!==null)return this.manualProgress;
    const top=this.el.getBoundingClientRect().top-this.scroll.getBoundingClientRect().top;
    const step=parseFloat(this.el.style.getPropertyValue('--prism-deck-step'))||400;
    return clamp((24-top)/step,0,this.cards.length-1);
  }
  private paint():void {
    if(!this.el.isConnected)return;
    if(this.flat()){for(const card of this.cards){card.style.removeProperty('transform');card.style.removeProperty('opacity');card.style.removeProperty('pointer-events');card.classList.remove('is-current');}return;}
    const progress=this.progress(),active=Math.round(progress);
    this.el.dataset.progress=progress.toFixed(3);
    for(const [i,card] of this.cards.entries()){
      const depth=Math.min(4,Math.abs(i-progress)),side=i%2?1:-1;
      // Keep the remaining pictures visible behind the foreground card from the first frame.
      // Small offsets and alternating tilts form one compact deck, rather than offscreen slides.
      card.style.transform=`translate3d(calc(-50% + ${side*depth*24}px), ${-depth*12}px, ${-depth*18}px) rotateX(${depth*2}deg) rotateZ(${side*depth*4}deg) scale(${1-depth*.04})`;
      card.style.zIndex=String(100-Math.round(Math.abs(i-active))*2+(i<active?0:1));
      card.style.opacity=String(Math.abs(i-active)>4?0:1);
      card.style.pointerEvents=i===active?'auto':'none';card.classList.toggle('is-current',i===active);
    }
    const alt=this.cards[active]?.querySelector('img')?.getAttribute('alt')||'';
    const caption=`${active+1} / ${this.cards.length}${alt?' · '+alt:''}`;
    if(this.caption.textContent!==caption)this.caption.textContent=caption;
  }
  private go(delta:number):void {
    if(this.flat())return;
    this.manualProgress=clamp(Math.round(this.progress())+delta,0,this.cards.length-1);this.schedule();
  }
  destroy():void {
    this.cleanups.forEach(fn=>fn());this.resize.disconnect();this.win.cancelAnimationFrame(this.frame);this.win.cancelAnimationFrame(this.resizeFrame);
    this.toolbar.remove();this.footer.remove();this.el.classList.remove('is-expanded','is-cover');
    for(const card of this.cards){card.classList.remove('prism-deck-card','is-current');for(const property of ['transform','opacity','pointer-events','z-index','--prism-card-width','--prism-card-height'])card.style.removeProperty(property);}
    if(this.auto){for(const {card,parent,anchor} of this.origins){if(anchor?.parentNode===parent){parent.insertBefore(card,anchor);anchor.remove();}else parent.appendChild(card);parent.classList.remove('prism-deck-consumed');}this.el.remove();}
    else {for(const card of this.cards)this.el.insertBefore(card,this.sticky);this.sticky.remove();this.el.style.removeProperty('height');this.el.classList.add('is-static');}
  }
}

/** Enhances rendered Markdown only; source files and image assets are never rewritten. */
export class MediaEffects {
  private docs=new Map<Document,{observer:MutationObserver;timer:number;cleanup:()=>void}>();
  private decks=new Map<HTMLElement,ImageDeck>();
  private images=new Set<HTMLImageElement>();
  private frames=new Map<Document,number>();
  constructor(private plugin:PrismPlugin){
    plugin.registerMarkdownPostProcessor(async(el,ctx)=>{
      if(el.closest('.prism-deck') || el.querySelector('.prism-deck') || !el.querySelector('img,.image-embed,.internal-embed'))return;
      const info=ctx.getSectionInfo(el);if(!info)return;
      const lines=info.text.split(/\r?\n/),isWikiImage=(target:string)=>{
        const file=plugin.app.metadataCache.getFirstLinkpathDest(target,ctx.sourcePath);
        return /\.(png|jpe?g|webp|gif|avif|svg|bmp)$/i.test(target) || !!file && /^(png|jpe?g|webp|gif|avif|svg|bmp)$/i.test(file.extension);
      };
      const roots=[...new Set([...el.querySelectorAll<HTMLElement>('.internal-embed,img')]
        .filter(node=>!node.closest('.markdown-embed') && (!node.matches('.internal-embed')||isWikiImage(node.getAttribute('src')||'')))
        .map(node=>node.closest<HTMLElement>('.internal-embed')||node))];
      for(const run of imageRuns(lines,isWikiImage)){
        const first=Math.max(run.start,info.lineStart),last=Math.min(run.end,info.lineEnd);if(first>last)continue;
        const offset=lines.slice(info.lineStart,first).flatMap(line=>inlineImageSources(line,isWikiImage)).length;
        const count=lines.slice(first,last+1).flatMap(line=>imageSources(line,isWikiImage)).length;
        const originals=roots.slice(offset,offset+count);if(!originals.length)continue;
        originals.forEach(node=>node.classList.add('prism-deck-original'));
        // Hide only the image embeds; surrounding lists and text keep their native render children.
        if(run.start<info.lineStart){const child=new MarkdownRenderChild(el);ctx.addChild(child);child.register(()=>originals.forEach(node=>node.classList.remove('prism-deck-original')));continue;}
        // Detached element: createDiv on a Document appends to <html> and throws HierarchyRequestError.
        const wrapper=el.ownerDocument.createElement('div');wrapper.className='prism-deck';wrapper.dataset.prismAuto='true';originals[originals.length-1].after(wrapper);
        const child=new MarkdownRenderChild(wrapper);ctx.addChild(child);
        child.register(()=>{this.decks.get(wrapper)?.destroy();this.decks.delete(wrapper);wrapper.remove();originals.forEach(node=>node.classList.remove('prism-deck-original'));});
        for(const source of run.sources){const card=wrapper.createDiv();await MarkdownRenderer.render(plugin.app,source,card,ctx.sourcePath,child);}
        wrapper.dataset.prismReady='true';
      }
      this.attach(el.ownerDocument);this.scanSoon(el.ownerDocument);
    });
    plugin.registerMarkdownCodeBlockProcessor('prism-deck',async(source,el,ctx)=>{
      el.classList.add('prism-deck');el.dataset.prismExplicit='true';
      const component=new MarkdownRenderChild(el);ctx.addChild(component);
      const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      for(const line of lines){
        const images=imageSources(line,()=>true);
        for(const item of images.length?images:[line]){const card=el.createDiv();await MarkdownRenderer.render(plugin.app,item,card,ctx.sourcePath,component);}
      }
      el.dataset.prismReady='true';
      if(!el.querySelector('img'))el.createEl('p',{text:'在 prism-deck 中放入 Markdown 图片或 ![[图片]]，同一行可放多张。'});
      component.register(()=>{this.decks.get(el)?.destroy();this.decks.delete(el);});this.attach(el.ownerDocument);
    });
  }
  attach(doc:Document):void {
    if(!doc.defaultView || doc.defaultView.closed)return;
    if(this.docs.has(doc))return;
    const update=()=>this.schedule(doc);
    const state={observer:new MutationObserver(records=>{if(records.some(r=>!(r.target as HTMLElement).closest?.('.prism-reading-rail,.prism-deck-controls')))this.scanSoon(doc);}),timer:0,cleanup:()=>{
      doc.removeEventListener('scroll',update,true);doc.removeEventListener('load',update,true);doc.defaultView?.removeEventListener('resize',update);doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').removeEventListener('change',update);
    }};
    this.docs.set(doc,state);state.observer.observe(doc.body,{childList:true,subtree:true});
    doc.body.classList.toggle('prism-media-decks',this.plugin.data.settings.imageDecks);
    doc.addEventListener('scroll',update,true);doc.addEventListener('load',update,true);doc.defaultView.addEventListener('resize',update);doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',update);this.scanSoon(doc);
  }
  private scanSoon(doc:Document):void {const state=this.docs.get(doc);if(!state || state.timer || !doc.defaultView || doc.defaultView.closed)return;state.timer=doc.defaultView.setTimeout(()=>{state.timer=0;this.refresh();},160);}
  refresh():void {
    const s=this.plugin.data.settings;
    for(const [el,deck] of this.decks){
      // Native sections can be detached and reattached without unloading their render children.
      // Keep that child's controller until its component is unloaded, so virtualization is reversible.
      if((!el.isConnected && !el.dataset.prismAuto && !el.dataset.prismExplicit) || !s.imageDecks){deck.destroy();this.decks.delete(el);}else if(el.isConnected)deck.refresh();
    }
    for(const image of this.images)if(!image.isConnected || !s.imageMotion || image.closest('.prism-deck')){image.classList.remove('prism-image-motion');image.style.removeProperty('--prism-image-y');image.style.removeProperty('--prism-image-tilt');this.images.delete(image);}
    for(const doc of this.docs.keys()){
      if(!doc.defaultView || doc.defaultView.closed)continue;
      if(s.imageDecks){
        // Floating MarkdownRenderer output has no native virtual sections; grouping is safe there.
        for(const root of doc.querySelectorAll<HTMLElement>('.prism-note-preview'))this.group(root);
        for(const el of doc.querySelectorAll<HTMLElement>('.prism-deck')){
          if(!this.decks.has(el) && el.dataset.prismReady==='true' && (el.dataset.prismExplicit==='true'||el.dataset.prismAuto==='true') && el.closest('.markdown-reading-view,.prism-floating-body') && el.querySelectorAll('img').length>=2)this.decks.set(el,new ImageDeck(el,this.plugin));
        }
      }
      if(s.imageMotion)for(const img of doc.querySelectorAll<HTMLImageElement>('.markdown-reading-view .markdown-rendered img,.prism-note-preview img')){
        if(!img.closest('.prism-deck,.prism-deck-original,.prism-deck-consumed,.markdown-embed') && (img.naturalWidth>=160 || img.width>=160)){img.classList.add('prism-image-motion');this.images.add(img);}
      }
      this.schedule(doc);
    }
  }
  private group(root:HTMLElement):void {
    type Origin={card:HTMLElement;parent:HTMLElement;anchor:Comment};
    let run:Origin[]=[];
    let extending:ImageDeck|undefined;
    const flush=()=>{if(run.length>=2){
      // Detached element: createDiv on a Document appends to <html> and throws HierarchyRequestError.
      const wrapper=root.ownerDocument.createElement('div');wrapper.className='prism-deck';
      run[0].parent.before(wrapper);for(const origin of run){origin.card.before(origin.anchor);wrapper.appendChild(origin.card);origin.parent.classList.add('prism-deck-consumed');}
      this.decks.set(wrapper,new ImageDeck(wrapper,this.plugin,true,run));
    }run=[];};
    for(const child of [...root.children] as HTMLElement[]){
      const owned=child.matches('.prism-deck')?child:child.querySelector<HTMLElement>(':scope > .prism-deck');
      if(owned && this.decks.get(owned)?.auto){flush();extending=this.decks.get(owned);continue;}
      if(child.classList.contains('prism-deck-consumed'))continue;
      const imageOnly=child.matches('p') && !child.querySelector('.prism-deck') && !!child.querySelector('img') && !child.textContent?.trim() && !child.querySelector('a,iframe,video,.markdown-embed');
      if(imageOnly){
        const cards=new Set<HTMLElement>();
        for(const img of child.querySelectorAll<HTMLImageElement>('img')){let card:HTMLElement=img;while(card.parentElement && card.parentElement!==child)card=card.parentElement;cards.add(card);}
        const origins=[...cards].map(card=>({card,parent:child,anchor:root.ownerDocument.createComment('prism-image-position')}));
        if(extending){for(const origin of origins)origin.card.before(origin.anchor);child.classList.add('prism-deck-consumed');extending.append(origins);}
        else run.push(...origins);
      }else{flush();extending=undefined;}
    }flush();
  }
  private schedule(doc:Document):void {if(!this.frames.get(doc))this.frames.set(doc,doc.defaultView!.requestAnimationFrame(()=>{this.frames.delete(doc);this.paintImages(doc);}));}
  private paintImages(doc:Document):void {
    const reduced=doc.defaultView!.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for(const img of this.images){
      if(img.ownerDocument!==doc || !img.isConnected)continue;
      const scroll=img.closest<HTMLElement>('.prism-floating-body,.markdown-preview-view');if(!scroll)continue;
      const r=img.getBoundingClientRect(),viewport=scroll.getBoundingClientRect();
      if(r.bottom<viewport.top-120 || r.top>viewport.bottom+120)continue;
      const enter=clamp((r.top-viewport.top)/Math.max(1,viewport.height));
      img.style.setProperty('--prism-image-y',`${reduced?0:enter*20}px`);
      img.style.setProperty('--prism-image-tilt',`${reduced?0:enter*5}deg`);
    }
  }
  destroy():void {
    for(const [doc,state] of this.docs){state.observer.disconnect();doc.defaultView?.clearTimeout(state.timer);doc.defaultView?.cancelAnimationFrame(this.frames.get(doc)||0);state.cleanup();}this.frames.clear();
    for(const deck of this.decks.values())deck.destroy();this.decks.clear();
    for(const doc of this.docs.keys()){doc.body.classList.remove('prism-media-decks');doc.querySelectorAll('[data-prism-auto]').forEach(el=>el.remove());doc.querySelectorAll('.prism-deck-original,.prism-deck-consumed').forEach(el=>el.classList.remove('prism-deck-original','prism-deck-consumed'));}
    this.docs.clear();
    for(const img of this.images){img.classList.remove('prism-image-motion');img.style.removeProperty('--prism-image-y');img.style.removeProperty('--prism-image-tilt');}this.images.clear();
  }
}
