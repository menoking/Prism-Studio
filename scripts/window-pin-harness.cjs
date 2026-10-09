const {Plugin}=require('obsidian');const fs=require('fs'),path=require('path');
module.exports=class WindowPinHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),500));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const remote=require('@electron/remote'),win=remote.getCurrentWindow(),out=path.join(path.dirname(base),'verification');fs.mkdirSync(out,{recursive:true});
    const report={started:new Date().toISOString(),suite:'window-pin',checks:[],errors:[],screenshots:[]};
    const save=()=>fs.writeFileSync(path.join(out,'window-pin-results.json'),JSON.stringify(report,null,2));
    const assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await wait(60);}throw new Error('Timed out waiting for window pin');};
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const button=doc=>[...doc.querySelectorAll('.prism-window-pin')].find(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;});
    const onError=e=>report.errors.push(e.message||String(e.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    let popWin;
    try{
      win.show();win.setBounds({x:80,y:30,width:1280,height:850});win.setAlwaysOnTop(false);await until(()=>this.app.plugins.getPlugin('prism-studio')&&button(document));
      const prism=this.app.plugins.getPlugin('prism-studio');
      await check('Pin is left of minimize, follows palette and toggles the native window',async()=>{
        await prism.updateSettings({enabled:true,nativeGlass:true,palette:'blue',material:'glass'});
        const el=button(document),minimize=el.parentElement.querySelector('.mod-minimize');assert(minimize&&el.nextElementSibling===minimize,'Pin not before minimize');
        const r=el.getBoundingClientRect(),m=minimize.getBoundingClientRect();assert(r.right<=m.left+1&&r.height>=20,'Pin overlaps controls or has no hit area');
        const sidebar=document.querySelector('.sidebar-toggle-button.mod-right');assert(sidebar,'Right sidebar toggle missing');
        assert(sidebar.getBoundingClientRect().right<=r.left+1,'Pin overlaps right sidebar toggle');
        assert(getComputedStyle(el).webkitAppRegion==='no-drag','Pin is a drag region');el.click();await until(()=>win.isAlwaysOnTop()&&el.getAttribute('aria-pressed')==='true');
        const blue=getComputedStyle(el).color;await prism.updateSettings({palette:'mint'});assert(getComputedStyle(el).color!==blue,'Pin ignores palette');await prism.updateSettings({palette:'blue'});
        fs.writeFileSync(path.join(out,'50-window-pin.png'),(await win.capturePage()).toPNG());report.screenshots.push('50-window-pin.png');
        el.click();await until(()=>!win.isAlwaysOnTop()&&el.getAttribute('aria-pressed')==='false');
      });
      await check('Keyboard, command, skin-off and remount share the native state',async()=>{
        let el=button(document);el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await until(()=>win.isAlwaysOnTop());
        el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true}));assert(win.isAlwaysOnTop(),'Repeat changed pin');
        await prism.updateSettings({enabled:false});assert(button(document)&&win.isAlwaysOnTop(),'Skin-off removed pin');
        el.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));await until(()=>!win.isAlwaysOnTop());
        win.focus();await wait(100);this.app.commands.executeCommandById('prism-studio:toggle-window-pin');await until(()=>win.isAlwaysOnTop());
        const controls=el.parentElement;el.remove();await until(()=>controls.querySelector('.prism-window-pin'));prism.applySkin(document);prism.applySkin(document);
        assert(controls.querySelectorAll('.prism-window-pin').length===1,'Duplicate buttons');el=button(document);assert(el.getAttribute('aria-pressed')==='true','Remount lost native state');
        el.click();await until(()=>!win.isAlwaysOnTop());await prism.updateSettings({enabled:true});
      });
      await check('Popout pins its own window independently',async()=>{
        const leaf=this.app.workspace.getLeaf('window');await leaf.openFile(this.app.vault.getAbstractFileByPath('Welcome.md'));
        await until(()=>leaf.view.containerEl.ownerDocument!==document&&button(leaf.view.containerEl.ownerDocument));
        const doc=leaf.view.containerEl.ownerDocument;popWin=doc.defaultView.require('@electron/remote').getCurrentWindow();popWin.show();
        button(doc).click();await until(()=>popWin.isAlwaysOnTop());assert(!win.isAlwaysOnTop(),'Popout changed main window');
        button(doc).click();await until(()=>!popWin.isAlwaysOnTop());popWin.close();popWin=null;win.focus();
      });
      await check('Unload removes buttons and restores the owned pin',async()=>{
        button(document).click();await until(()=>win.isAlwaysOnTop());await this.app.plugins.disablePlugin('prism-studio');await until(()=>!win.isAlwaysOnTop());assert(!document.querySelector('.prism-window-pin'),'Button remains');
        assert(!document.body.classList.contains('prism-window-pin-mounted')&&!document.body.style.getPropertyValue('--prism-window-controls-width'),'Titlebar spacing remains');
      });
      await check('Pre-existing and externally changed topmost state survive unload',async()=>{
        win.setAlwaysOnTop(true);await this.app.plugins.enablePlugin('prism-studio');await until(()=>button(document));assert(button(document).getAttribute('aria-pressed')==='true','Pre-existing state not reflected');
        await this.app.plugins.disablePlugin('prism-studio');assert(win.isAlwaysOnTop(),'Pre-existing state changed');
        win.setAlwaysOnTop(false);await this.app.plugins.enablePlugin('prism-studio');await until(()=>button(document));button(document).click();await until(()=>win.isAlwaysOnTop());
        win.setAlwaysOnTop(false);await until(()=>button(document).getAttribute('aria-pressed')==='false');win.setAlwaysOnTop(true);await until(()=>button(document).getAttribute('aria-pressed')==='true');
        await this.app.plugins.disablePlugin('prism-studio');assert(win.isAlwaysOnTop(),'External state changed on unload');win.setAlwaysOnTop(false);
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{
      try{popWin?.close();win.setAlwaysOnTop(false);}catch{}
      window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);
      report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();
      if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);
    }
  }
};
