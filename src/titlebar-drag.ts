import { Platform } from 'obsidian';

interface DragEntry {
  el: HTMLElement;
  win: Window;
  onUnload: () => void;
  height: number;
}

/**
 * Invisible drag band along the top edge of a frameless desktop window.
 *
 * Obsidian gives root tab headers `flex: 1 1 0` with a 320px cap, so once a few tabs
 * are open they tile the whole titlebar and the only native drag area left is the
 * ~5px margin above them. This band restores a predictable target with no layout change.
 * Double-clicking it maximizes/restores the window through the OS, as with any drag region.
 */
export class TitlebarDrag {
  private entries=new Map<Document,DragEntry>();

  attach(doc:Document,height:number):void {
    if(!Platform.isDesktopApp||!doc.body||doc.defaultView?.closed)return;
    if(!Number.isFinite(height)||height<=0||!doc.body.classList.contains('is-frameless')){this.remove(doc);return;}
    const existing=this.entries.get(doc);
    if(existing){existing.height=height;this.place(existing);return;}
    const win=doc.defaultView;
    if(!win)return;
    // Detached element: Document.createDiv appends to <html> and throws HierarchyRequestError.
    const el=doc.createElement('div');
    el.className='prism-titlebar-drag';el.setAttribute('aria-hidden','true');
    const onUnload=()=>this.remove(doc);
    win.addEventListener('unload',onUnload);
    doc.body.appendChild(el);
    const entry:DragEntry={el,win,onUnload,height};
    this.entries.set(doc,entry);this.place(entry);
  }

  private place(entry:DragEntry):void {
    const height=`${entry.height}px`;
    if(entry.el.style.height!==height)entry.el.style.height=height;
  }

  remove(doc:Document):void {
    const entry=this.entries.get(doc);if(!entry)return;
    this.entries.delete(doc);
    entry.el.remove();
    entry.win.removeEventListener('unload',entry.onUnload);
  }

  destroy():void {for(const doc of [...this.entries.keys()])this.remove(doc);}
}
