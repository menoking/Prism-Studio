import { Notice, Platform, setIcon } from 'obsidian';

interface NativeWindow {
  isDestroyed(): boolean;
  isAlwaysOnTop(): boolean;
  setAlwaysOnTop(value:boolean): void;
  on(event:string,listener:()=>void): void;
  removeListener(event:string,listener:()=>void): void;
}
type HostWindow = Window & {require?:(id:string)=>{getCurrentWindow:()=>NativeWindow};MutationObserver:typeof MutationObserver;ResizeObserver:typeof ResizeObserver};
interface PinState {
  win:NativeWindow;
  initial:boolean;
  owned:boolean|null;
  changing:boolean;
  buttons:Set<HTMLElement>;
  observer:MutationObserver;
  resize:ResizeObserver;
  changed:()=>void;
  closed:()=>void;
  focused:()=>void;
}

/** Each button controls its own native window, independently of the theme switch. */
export class WindowPin {
  private states=new Map<Document,PinState>();
  private readonly selector='.titlebar-button-container.mod-right';

  attach(doc:Document):void {
    if(this.states.has(doc)||!Platform.isDesktopApp||!doc.body||doc.defaultView?.closed)return;
    const host=doc.defaultView as HostWindow|null;
    if(!host?.require)return;
    try{
      const win=host.require('@electron/remote').getCurrentWindow();
      if(win.isDestroyed()||typeof win.setAlwaysOnTop!=='function'||typeof win.isAlwaysOnTop!=='function')return;
      const changed=()=>this.sync(doc);
      const closed=()=>this.release(doc,false);
      const focused=()=>this.sync(doc);
      const observer=new host.MutationObserver(records=>{
        const state=this.states.get(doc);if(!state)return;
        // Ignore ordinary note edits. Remount only when window controls are replaced.
        if([...state.buttons].some(button=>!button.isConnected)||records.some(record=>
          (record.target as Element).matches?.(this.selector)||[...record.addedNodes].some(node=>
            node.nodeType===1&&((node as Element).matches(this.selector)||!!(node as Element).querySelector(this.selector)))))this.mount(doc);
      });
      const resize=new host.ResizeObserver(()=>this.reserveSpace(doc));
      this.states.set(doc,{win,initial:win.isAlwaysOnTop(),owned:null,changing:false,buttons:new Set(),observer,resize,changed,closed,focused});
      win.on('always-on-top-changed',changed);win.on('closed',closed);
      host.addEventListener('focus',focused);host.addEventListener('unload',closed);
      this.mount(doc);observer.observe(doc.body,{childList:true,subtree:true});
    }catch(error){this.release(doc,false);console.warn('Prism Studio: window pin unavailable',error);}
  }

  private mount(doc:Document):void {
    const state=this.states.get(doc);if(!state)return;
    for(const button of state.buttons)if(!button.isConnected)state.buttons.delete(button);
    for(const controls of doc.querySelectorAll<HTMLElement>(this.selector)){
      state.resize.observe(controls);
      if([...state.buttons].some(button=>button.parentElement===controls))continue;
      const minimize=controls.querySelector('.titlebar-button.mod-minimize');
      if(!minimize&&!controls.querySelector('.titlebar-button.mod-close'))continue;
      const button=doc.createDiv({cls:'titlebar-button prism-window-pin'});
      button.setAttribute('role','button');button.tabIndex=0;setIcon(button,'pin');
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.toggle(doc);});
      button.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
      button.addEventListener('keydown',event=>{
        if((event.key==='Enter'||event.key===' ')&&!event.repeat){event.preventDefault();event.stopPropagation();this.toggle(doc);}
      });
      state.buttons.add(button);controls.insertBefore(button,minimize||controls.firstChild);
    }
    this.reserveSpace(doc);this.sync(doc);
  }

  private reserveSpace(doc:Document):void {
    const state=this.states.get(doc);if(!state)return;
    // Obsidian reserves room for three controls. Measure all four in CSS pixels,
    // keeping the sidebar toggle clear even when zoom or titlebar styles change.
    let width=0;
    for(const button of state.buttons){
      const controls=button.parentElement;if(!controls?.offsetHeight)continue;
      width=Math.max(width,[...controls.children].reduce((sum,child)=>sum+(child as HTMLElement).offsetWidth,0));
    }
    doc.body.classList.toggle('prism-window-pin-mounted',width>0);
    if(width>0&&doc.body.style.getPropertyValue('--prism-window-controls-width')!==`${width}px`)doc.body.style.setProperty('--prism-window-controls-width',`${width}px`);
  }

  private sync(doc:Document):void {
    const state=this.states.get(doc);if(!state||state.win.isDestroyed())return;
    try{
      const pinned=state.win.isAlwaysOnTop();
      if(!state.changing&&state.owned!==null&&state.owned!==pinned)state.owned=null;
      const label=pinned?'取消窗口置顶':'固定窗口到最顶层';
      for(const button of state.buttons){
        button.classList.toggle('is-active',pinned);button.setAttribute('aria-pressed',String(pinned));
        button.setAttribute('aria-label',label);button.title=label;
      }
    }catch{/* The window may be closing. */}
  }

  toggle(doc:Document):void {
    this.attach(doc);const state=this.states.get(doc);
    if(!state||state.win.isDestroyed()){new Notice('当前窗口无法使用置顶功能。');return;}
    try{
      state.changing=true;
      const next=!state.win.isAlwaysOnTop();state.win.setAlwaysOnTop(next);state.owned=state.win.isAlwaysOnTop();
      if(state.owned!==next)new Notice('当前系统未允许窗口置顶。');
    }catch(error){new Notice('窗口置顶切换失败。');console.warn('Prism Studio: window pin failed',error);}
    finally{state.changing=false;this.sync(doc);}
  }

  private release(doc:Document,restore=true):void {
    const state=this.states.get(doc);if(!state)return;this.states.delete(doc);
    state.observer.disconnect();state.resize.disconnect();for(const button of state.buttons)button.remove();
    doc.body.classList.remove('prism-window-pin-mounted');doc.body.style.removeProperty('--prism-window-controls-width');
    doc.defaultView?.removeEventListener('focus',state.focused);doc.defaultView?.removeEventListener('unload',state.closed);
    try{
      state.win.removeListener('always-on-top-changed',state.changed);state.win.removeListener('closed',state.closed);
      // Restore only a change we still own; preserve pre-existing or externally changed state.
      if(restore&&state.owned!==null&&!state.win.isDestroyed()&&state.win.isAlwaysOnTop()===state.owned&&state.owned!==state.initial)state.win.setAlwaysOnTop(state.initial);
    }catch{/* Native windows can disappear during unload. */}
  }

  destroy():void {for(const doc of this.states.keys())this.release(doc);}
}
