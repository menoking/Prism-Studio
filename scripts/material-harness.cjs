/* A single focused material regression run, restricted to our own test vault. */
const {Plugin}=require('obsidian');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=class MaterialHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),700));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const out=path.join(path.dirname(base),'verification'),remote=require('@electron/remote'),win=remote.getCurrentWindow();
    const report={started:new Date().toISOString(),suite:'material-1.2.1',checks:[],screenshots:[],errors:[],artifacts:Object.fromEntries(['main.js','manifest.json','styles.css'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'.obsidian/plugins/prism-studio',n))).digest('hex')]))};
    const save=()=>fs.writeFileSync(path.join(out,'material-results.json'),JSON.stringify(report,null,2));
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw new Error(m);};
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const errors=[],onError=e=>errors.push(e.message||String(e.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    let prism;
    const getBackdrop=()=>{
      const handle=Number(win.getNativeWindowHandle().readBigUInt64LE());assert(Number.isSafeInteger(handle)&&handle>0,'Invalid owned window handle');
      const code=`Add-Type @'\nusing System;using System.Runtime.InteropServices;public class MaterialProbe {[DllImport("dwmapi.dll")]public static extern int DwmGetWindowAttribute(IntPtr w,int a,out int v,int s);}\n'@\n$v=0;$rc=[MaterialProbe]::DwmGetWindowAttribute([IntPtr]${handle},38,[ref]$v,4);if($rc -ne 0){throw "DWM read failed"};Write-Output $v`;
      return Number(require('child_process').execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8'}).trim());
    };
    try{
      win.show();win.setFullScreen(false);win.unmaximize();win.setBounds({x:80,y:25,width:1280,height:900});
      for(let i=0;i<70&&!this.app.plugins.getPlugin('prism-studio');i++)await wait(80);prism=this.app.plugins.getPlugin('prism-studio');assert(prism,'Plugin unavailable');
      await prism.updateSettings({palette:'blue',material:'glass',nativeGlass:true,enabled:true});await prism.restoreGlass();await prism.openStudio('home');await wait(1600);
      await check('1.1 glass baseline restored; startup and subsequent Mica overrides return to Acrylic',async()=>{
        const panel=getComputedStyle(document.querySelector('.prism-panel')),workspace=getComputedStyle(document.querySelector('.workspace-tabs.mod-top > .workspace-tab-container')||document.querySelector('.workspace-tab-container'));
        assert(panel.backgroundColor==='rgba(237, 248, 255, 0.42)',`Baseline alpha changed: ${panel.backgroundColor}`);assert(panel.backdropFilter==='blur(20px) saturate(1)',`Baseline blur changed: ${panel.backdropFilter}`);assert(workspace.backdropFilter==='none','Native glass retains 1.2 workspace filter');
        assert(getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)','Native transparency masked');
        const initial=getBackdrop();assert(initial===3,`Native material is ${initial}, expected Acrylic (3)`);
        win.setBackgroundMaterial('mica');assert(getBackdrop()===2,'Could not simulate Obsidian Mica override');this.app.workspace.trigger('css-change');await wait(750);const recovered=getBackdrop();assert(recovered===3,`Mica override was not repaired: ${recovered}`);
        report.nativeBacking={initial,recovered,os:require('os').release()};
      });
      await check('One controlled desktop: glass, acrylic and frosted differ in actual composition, including zero blur settings',async()=>{
        const backing=new remote.BrowserWindow({show:false,frame:false,...win.getBounds(),webPreferences:{contextIsolation:true,nodeIntegration:false}});
        await backing.loadURL('data:text/html,'+encodeURIComponent('<html><body style="margin:0;height:100vh;background:radial-gradient(ellipse at 70% 20%,#e5a8cf,transparent 48%),linear-gradient(110deg,#84ba8c,#e0d99b 60%,#a3b5da)"></body></html>'));
        const desktopCapturer=remote.require('electron').desktopCapturer;
        const capture=async(material)=>{
          backing.setAlwaysOnTop(true,'floating');backing.showInactive();win.setAlwaysOnTop(true,'screen-saver');win.show();win.moveTop();win.focus();await wait(700);
          if(!win.isFocused()){win.moveTop();win.focus();await wait(120);}assert(win.isFocused()&&win.isAlwaysOnTop(),'Owned window not foreground; capture discarded');
          const bounds=win.getBounds(),display=remote.screen.getDisplayMatching(bounds),sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});assert(win.isFocused(),'Foreground changed; capture discarded');
          const source=sources.find(s=>s.display_id===String(display.id))||(sources.length===1?sources[0]:null);assert(source&&!source.thumbnail.isEmpty(),'Owned display unavailable');
          const dim=source.thumbnail.getSize(),sx=dim.width/display.bounds.width,sy=dim.height/display.bounds.height,x=Math.max(0,Math.round((bounds.x-display.bounds.x)*sx)),y=Math.max(0,Math.round((bounds.y-display.bounds.y)*sy));
          const own=source.thumbnail.crop({x,y,width:Math.min(dim.width-x,Math.round(bounds.width*sx)),height:Math.min(dim.height-y,Math.round(bounds.height*sy))});
          const name=`26-material-${material}.png`;fs.writeFileSync(path.join(out,name),own.toPNG());report.screenshots.push(name);
          const b=own.toBitmap(),size=own.getSize(),rgb=[0,0,0];let n=0;
          for(let py=Math.floor(size.height*.74);py<Math.floor(size.height*.8);py++)for(let px=Math.floor(size.width*.12);px<Math.floor(size.width*.17);px++){const pos=(py*size.width+px)*4;rgb[0]+=b[pos+2];rgb[1]+=b[pos+1];rgb[2]+=b[pos];n++;}
          return rgb.map(v=>v/n);
        };
        try{
          report.materials=[];for(const material of ['glass','acrylic','frosted','blur','solid']){
            await prism.updateSettings({material});const style=getComputedStyle(document.querySelector('.prism-panel'));
            const rgb=await capture(material);report.materials.push({material,rgb,background:style.backgroundColor,filter:style.backdropFilter});
          }
          const rgb=m=>report.materials.find(v=>v.material===m).rgb,diff=(a,b)=>rgb(a).reduce((s,v,i)=>s+Math.abs(v-rgb(b)[i]),0);
          report.differences={glassAcrylic:diff('glass','acrylic'),glassFrosted:diff('glass','frosted'),acrylicFrosted:diff('acrylic','frosted')};
          for(const [name,value] of Object.entries(report.differences))assert(value>18,`Insufficient visible separation ${name}: ${value}`);
          report.lowSliders=[];for(const material of ['glass','acrylic','frosted']){
            await prism.updateSettings({material,opacity:15,blur:0});const style=getComputedStyle(document.querySelector('.prism-panel'));report.lowSliders.push({material,background:style.backgroundColor,filter:style.backdropFilter});
          }
          assert(new Set(report.lowSliders.map(v=>v.background+' '+v.filter)).size===3,'Low slider presets collapse');
          await prism.restoreGlass();
        }finally{win.setAlwaysOnTop(false);backing.close();}
      });
      await check('Material dropdown and preview update; restore button preserves type size; disable cancels reassertion',async()=>{
        await prism.updateSettings({fontSize:20,palette:'violet',material:'frosted',opacity:15,blur:0});this.app.setting.open();this.app.setting.openTabById('prism-studio');await wait(150);
        let el=this.app.setting.activeTab.containerEl,doc=el.ownerDocument;
        const row=[...el.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent==='界面质感'),select=row.querySelector('select:not([aria-hidden])');select.value='acrylic';select.dispatchEvent(new doc.defaultView.Event('change'));await wait(180);
        assert(prism.data.settings.material==='acrylic','Dropdown failed');assert(getComputedStyle(el.querySelector('.prism-material-preview-surface')).backdropFilter.includes('18px'),'Preview not updated');
        [...el.querySelectorAll('button')].find(e=>e.textContent==='重置参数').click();await wait(200);assert(prism.data.settings.material==='glass'&&prism.data.settings.opacity===42&&prism.data.settings.blur===20,'Restore button failed');assert(prism.data.settings.palette==='violet'&&prism.data.settings.fontSize===20,'Restore changed unrelated choices');this.app.setting.close();
        await prism.updateSettings({nativeGlass:false});await wait(1500);assert(!document.documentElement.classList.contains('prism-native-glass'),'Disabled backing re-enabled by delayed timer');assert(getBackdrop()!==3,'Disabled compositor still Acrylic');await prism.updateSettings({nativeGlass:true,palette:'blue'});await wait(600);assert(getBackdrop()===3,'Enable failed');
      });
      report.finished=new Date().toISOString();
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.errors=errors;report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!errors.length;save();if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);}
  }
};
