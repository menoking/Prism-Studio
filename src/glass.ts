import { Platform } from 'obsidian';
import type { SkinSettings } from './model';
import { MATERIALS } from './appearance';

interface NativeWindow {
  webContents?:{getLastWebPreferences?:()=>{backgroundColor?:string}};
  isDestroyed(): boolean;
  getBackgroundColor(): string;
  setBackgroundColor(value:string): void;
  setBackgroundMaterial?(material:string): void;
  setVibrancy?(type:string|null): void;
  getVibrancy?(): string;
}
type NativeDocument = Window & {require?:(id:string)=>{getCurrentWindow:()=>NativeWindow};process?:{platform:string}};

/** Native compositor backing. CSS alone cannot expose the desktop. No global app settings are changed. */
export class NativeGlass {
  private states=new Map<Document,{win:NativeWindow;color:string;vibrancy:string;platform:string;translucent:boolean;material:SkinSettings['material'];cleanup:()=>void;asserted:number;retry:number}>();
  readonly status=new Map<Document,string>();
  apply(doc:Document,enabled:boolean,material:SkinSettings['material']='glass'):void {
    if(!enabled){this.restore(doc);return;}
    const state=this.states.get(doc);
    if(state){state.material=material;this.assertBacking(doc);return;}
    if(!Platform.isDesktopApp){this.status.set(doc,'当前平台使用所选配色与面板质感；没有原生桌面透视。');return;}
    try{
      const host=doc.defaultView as NativeDocument|null;
      const platform=host?.process?.platform;
      if(!host?.require || !platform)throw new Error('原生窗口 API 不可用');
      if(platform!=='win32' && platform!=='darwin')throw new Error('此平台未接入系统玻璃材质');
      const win=host.require('@electron/remote').getCurrentWindow();
      const color=win.webContents?.getLastWebPreferences?.().backgroundColor||win.getBackgroundColor(),vibrancy=win.getVibrancy?.()||'';
      // Save before changing either property so a partial failure can also be rolled back.
      const timers:number[]=[];
      const focus=()=>this.assertBacking(doc,true);
      // Obsidian can apply its own Mica backdrop after plugin load or an appearance change.
      // Reassert only the owned window; do not change the user's global app configuration.
      this.states.set(doc,{win,color,vibrancy,platform,translucent:doc.body.classList.contains('is-translucent'),material,asserted:Date.now(),retry:0,cleanup:()=>{host.removeEventListener('focus',focus);for(const timer of timers)host.clearTimeout(timer);host.clearTimeout(this.states.get(doc)?.retry||0);}});
      if(platform==='win32'){
        const os=(host.require as unknown as (id:string)=>{release:()=>string})('os');
        const build=Number(os.release().split('.')[2]);
        if(build<22621 || !win.setBackgroundMaterial)throw new Error('桌面透视需要 Windows 11 22H2 或更新版本及较新的 Obsidian 安装程序');
        win.setBackgroundMaterial('acrylic');
      }else{
        if(!win.setVibrancy)throw new Error('系统振动材质 API 不可用');
        win.setVibrancy('under-window');
      }
      win.setBackgroundColor('rgba(0, 0, 0, 0)');
      doc.documentElement.classList.add('prism-native-glass');
      doc.body.classList.add('is-translucent');
      this.status.set(doc,this.description(platform,material));
      host.addEventListener('focus',focus);
      for(const delay of [300,1400])timers.push(host.setTimeout(()=>this.assertBacking(doc,true),delay));
    }catch(error){this.restore(doc);this.status.set(doc,`原生玻璃未启用：${String(error).replace(/^Error: /,'')}。可使用知识库背景图片。`);}
  }
  private assertBacking(doc:Document,force=false):void {
    const state=this.states.get(doc);if(!state)return;
    try{
      if(state.win.isDestroyed())return;
      if(force||Date.now()-state.asserted>500){
        if(state.retry){doc.defaultView?.clearTimeout(state.retry);state.retry=0;}
        if(state.platform==='win32')state.win.setBackgroundMaterial?.('acrylic');
        else state.win.setVibrancy?.('under-window');
        state.win.setBackgroundColor('rgba(0, 0, 0, 0)');state.asserted=Date.now();
      }else if(!state.retry&&doc.defaultView){
        state.retry=doc.defaultView.setTimeout(()=>{state.retry=0;this.assertBacking(doc,true);},510-(Date.now()-state.asserted));
      }
      this.status.set(doc,this.description(state.platform,state.material));
    }catch(error){this.restore(doc);this.status.set(doc,`原生材质恢复失败：${String(error)}`);}
  }
  private description(platform:string,material:SkinSettings['material']):string {
    return `${platform==='win32'?'Windows Acrylic':'macOS 原生玻璃'} 已启用；${MATERIALS[material].name}。桌面模糊由系统控制，面板质感跟随所选配色。`;
  }
  private restore(doc:Document):void {
    const state=this.states.get(doc);
    try{state?.cleanup();}catch{/* The owner window may have closed. */}
    if(state)try{if(!state.win.isDestroyed()){if(state.platform==='win32')state.win.setBackgroundMaterial?.('auto');else state.win.setVibrancy?.(state.vibrancy||null);state.win.setBackgroundColor(state.color);}}catch{/* Window may close during unload. */}
    doc.documentElement.classList.remove('prism-native-glass');this.states.delete(doc);this.status.delete(doc);
    if(state&&!state.translucent)doc.body.classList.remove('is-translucent');
  }
  destroy():void {for(const doc of this.states.keys())this.restore(doc);this.status.clear();}
}
