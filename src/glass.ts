import { Platform } from 'obsidian';
import type { SkinSettings } from './model';
import { MATERIALS } from './appearance';

/**
 * Window translucency without Node or Electron APIs so the plugin stays installable on mobile.
 * Driving Acrylic/vibrancy needs @electron/remote, which forces isDesktopOnly; the skin now
 * joins the translucency the host window already exposes and keeps the CSS material intact.
 */
export class NativeGlass {
  readonly status=new Map<Document,string>();
  private applied=new Set<Document>();
  apply(doc:Document,enabled:boolean,material:SkinSettings['material']='glass'):void {
    if(!enabled){this.restore(doc);return;}
    if(!Platform.isDesktopApp){this.status.set(doc,'移动端沿用所选配色与面板质感；系统级窗口透视仅在桌面端可用。');return;}
    // Obsidian marks windows it already made translucent. Forcing transparency on an opaque
    // window only exposes the raw window colour, so join in when it is actually safe.
    if(!doc.body.classList.contains('is-translucent')){
      this.status.set(doc,`当前窗口未开启系统半透明，桌面透视已跳过；${MATERIALS[material].name} 面板质感照常生效，也可使用知识库背景图片。`);
      return;
    }
    doc.documentElement.classList.add('prism-native-glass');
    this.applied.add(doc);
    this.status.set(doc,`已接入 Obsidian 半透明窗口；${MATERIALS[material].name}。桌面模糊由系统控制。`);
  }
  private restore(doc:Document):void {
    doc.documentElement.classList.remove('prism-native-glass');
    this.applied.delete(doc);this.status.delete(doc);
  }
  destroy():void {for(const doc of [...this.applied])this.restore(doc);this.status.clear();}
}
