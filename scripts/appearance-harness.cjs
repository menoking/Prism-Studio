/* Focused appearance checks in our isolated vault; never included in the release. */
const {Plugin}=require('obsidian');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=class AppearanceHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),700));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();
    if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const out=path.join(path.dirname(base),'verification');fs.mkdirSync(out,{recursive:true});
    const report={started:new Date().toISOString(),suite:'appearance-1.2',checks:[],errors:[],screenshots:[],artifacts:Object.fromEntries(['main.js','manifest.json','styles.css'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'.obsidian/plugins/prism-studio',n))).digest('hex')]))};
    const config=JSON.parse(fs.readFileSync(path.join(base,'.obsidian/plugins/prism-native-harness/suite.json'),'utf8'));
    let previous;
    if(config.failedOnly){try{const candidate=JSON.parse(fs.readFileSync(path.join(out,'appearance-results.json'),'utf8'));if(JSON.stringify(candidate.artifacts)===JSON.stringify(report.artifacts)&&!candidate.errors.length){previous=candidate;const first=path.join(out,'appearance-initial-results.json');if(!fs.existsSync(first))fs.writeFileSync(first,JSON.stringify(candidate,null,2));fs.writeFileSync(path.join(out,`appearance-${candidate.started.replaceAll(/[:.]/g,'-')}.json`),JSON.stringify(candidate,null,2));report.reusedFrom=candidate.started;const initial=JSON.parse(fs.readFileSync(first,'utf8'));for(const key of ['profiles','componentColors'])if(candidate[key]||initial[key])report[key]=candidate[key]||initial[key];report.screenshots=[...new Set([...initial.screenshots,...candidate.screenshots])];}}catch{}}
    const save=()=>fs.writeFileSync(path.join(out,'appearance-results.json'),JSON.stringify(report,null,2));
    const assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+6000;while(Date.now()<end){if(fn())return;await wait(70);}throw new Error('Timed out waiting for appearance');};
    const check=async(name,fn)=>{const passed=previous?.checks.find(c=>c.name===name&&c.pass);if(passed){report.checks.push({...passed,reused:true});save();return;}try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const remote=require('@electron/remote'),win=remote.getCurrentWindow();
    const errors=[],onError=e=>errors.push(e.message||String(e.reason));
    window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    let prism,note,original;
    try{
      win.show();win.setFullScreen(false);win.unmaximize();win.setBounds({x:80,y:25,width:1280,height:900});
      await until(()=>this.app.plugins.getPlugin('prism-studio'));prism=this.app.plugins.getPlugin('prism-studio');
      await prism.updateSettings({enabled:true,nativeGlass:true,material:'glass',palette:'blue',intensity:35,opacity:42,blur:20});
      await prism.openStudio('home');await wait(250);
      const palettes=['blue','ice','aurora','sunset','lagoon','violet','mint','sage','forest','teal','ocean','lavender','rose','peach','amber','sand','pearl','indigo'],materials=['glass','acrylic','frosted','blur','solid'];
      const screenshot=async(name,target=win)=>{await wait(120);const img=await target.capturePage();assert(!img.isEmpty(),'Empty image');fs.writeFileSync(path.join(out,name+'.png'),img.toPNG());report.screenshots.push(name+'.png');};
      await check('All 18 palettes × 5 materials: light/dark surfaces, matching accents and native transparency',async()=>{
        report.profiles=[];
        for(const dark of [false,true]){
          document.body.classList.toggle('theme-dark',dark);document.body.classList.toggle('theme-light',!dark);
          for(const palette of palettes)for(const material of materials){
            await prism.updateSettings({palette,material});
            const el=document.querySelector('.prism-panel'),style=getComputedStyle(el),body=getComputedStyle(document.body);
            assert(document.documentElement.classList.contains('prism-native-glass')===(material!=='solid'),`Native mode wrong: ${palette}/${material}`);
            const alpha=style.backgroundColor.startsWith('rgba(')?Number(style.backgroundColor.match(/, ([\d.]+)\)$/)?.[1]):1;
            assert(material==='solid'?alpha===1:alpha<1,`Opaque transparent panel: ${palette}/${material}: ${style.backgroundColor}`);
            assert(style.backdropFilter.includes('blur('),'Material filter absent');
            assert(body.getPropertyValue('--interactive-accent').trim()===style.getPropertyValue('--prism-accent').trim(),'Native accent mismatch');
            if(['acrylic','frosted'].includes(material))assert(style.backgroundImage.includes('feTurbulence'),'Grain missing');
            report.profiles.push({dark,palette,material,background:style.backgroundColor,filter:style.backdropFilter,accent:style.getPropertyValue('--prism-accent').trim()});
          }
        }
        assert(new Set(report.profiles.filter(p=>!p.dark&&p.material==='glass').map(p=>p.accent)).size===18,'Palette accent colors not independent');
        document.body.classList.remove('theme-dark');document.body.classList.add('theme-light');await prism.updateSettings({palette:'blue',material:'glass'});
      });
      await check('Real settings dropdowns: 18 colors, 5 finishes, solid→transparent and persistence',async()=>{
        this.app.setting.open();this.app.setting.openTabById('prism-studio');await wait(200);
        const tab=this.app.setting.activeTab.containerEl,doc=tab.ownerDocument;
        const select=name=>[...tab.querySelectorAll('.setting-item')].find(el=>el.querySelector('.setting-item-name')?.textContent===name)?.querySelector('select:not([aria-hidden])');
        const color=select('主题配色'),finish=select('界面质感');assert(color?.options.length===18,'Color dropdown missing');assert(finish?.options.length===5,'Material dropdown missing');
        color.value='violet';color.dispatchEvent(new doc.defaultView.Event('change'));await until(()=>prism.data.settings.palette==='violet');
        for(const material of materials){finish.value=material;finish.dispatchEvent(new doc.defaultView.Event('change'));await until(()=>prism.data.settings.material===material);await wait(35);assert(doc.documentElement.classList.contains('prism-native-glass')===(material!=='solid'),'Settings window native mode mismatch');}
        finish.value='frosted';finish.dispatchEvent(new doc.defaultView.Event('change'));await until(()=>prism.data.settings.material==='frosted');
        await prism.save();const saved=JSON.parse(fs.readFileSync(path.join(base,'.obsidian/plugins/prism-studio/data.json'),'utf8'));assert(saved.settings.palette==='violet'&&saved.settings.material==='frosted','Appearance not persisted');
        await screenshot('21-material-settings',doc.defaultView.require('@electron/remote').getCurrentWindow());this.app.setting.close();
      });
      await check('Reading rail, tooltip, native editor, floating note and popout share color and finish',async()=>{
        original='# Appearance\n\n'+('Text to exercise the real reading scrollbar.\n\n'.repeat(25))+'## Second heading\n\n'+('Color and surface remain transparent.\n\n'.repeat(25));
        note=await this.app.vault.create('Native appearance.md',original);const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(note);await leaf.setViewState({type:'markdown',state:{file:note.path,mode:'preview'}});this.app.workspace.setActiveLeaf(leaf,{focus:true});
        await until(()=>document.querySelector('.prism-reading-rail:not([hidden]) .prism-rail-thumb'));
        report.componentColors=[];
        for(const palette of ['lagoon','violet']){
          await prism.updateSettings({palette,material:'glass'});await wait(120);
          const rail=document.querySelector('.prism-reading-rail:not([hidden])'),thumb=rail.querySelector('.prism-rail-thumb'),tick=rail.querySelector('.prism-rail-scale.is-major');
          const accent=getComputedStyle(document.body).getPropertyValue('--prism-accent-rgb').trim();
          assert(getComputedStyle(thumb).backgroundColor.includes(accent.split(' ').join(', ')),'Scrollbar hue mismatch');
          assert(getComputedStyle(tick).backgroundColor.includes(accent.split(' ').join(', ')),'Ruler tick hue mismatch');
          const rect=rail.getBoundingClientRect();rail.dispatchEvent(new MouseEvent('pointermove',{clientX:rect.left+4,clientY:rect.top+rect.height*.4,bubbles:true}));await wait(60);
          const tooltip=rail.querySelector('.prism-rail-tooltip');assert(tooltip.textContent.trim(),'Hover heading missing');
          await prism.floats.open(note);await until(()=>document.querySelector('.prism-floating-inner'));
          const float=getComputedStyle(document.querySelector('.prism-floating-inner'));assert(float.getPropertyValue('--prism-accent-rgb').trim()===accent,'Floating accent mismatch');assert(Number(float.backgroundColor.match(/, ([\d.]+)\)$/)?.[1]||1)<1,'Floating surface opaque');
          await screenshot(`22-${palette}-glass-components`);report.componentColors.push({palette,thumb:getComputedStyle(thumb).backgroundColor,tick:getComputedStyle(tick).backgroundColor,tooltip:getComputedStyle(tooltip).backgroundColor,float:float.backgroundColor});prism.floats.closeAll();
        }
        const pop=this.app.workspace.openPopoutLeaf();await pop.openFile(note);await until(()=>pop.view.containerEl.ownerDocument!==document);const doc=pop.view.containerEl.ownerDocument;
        await prism.updateSettings({material:'frosted',palette:'lagoon'});assert(doc.body.dataset.prismMaterial==='frosted'&&doc.body.dataset.prismPalette==='lagoon','Popout appearance not propagated');assert(doc.documentElement.classList.contains('prism-native-glass'),'Popout glass missing');pop.detach();
        assert(await this.app.vault.read(note)===original,'Appearance modified note source');
      });
      await check('Green and purple glass expose actual desktop composition; finishes have different surfaces',async()=>{
        await prism.openStudio('home');for(const leaf of this.app.workspace.getLeavesOfType('markdown'))leaf.detach();await wait(150);
        const backing=new remote.BrowserWindow({show:false,frame:false,...win.getBounds(),backgroundColor:'#8cd690',webPreferences:{contextIsolation:true,nodeIntegration:false}});
        const desktopCapturer=remote.require('electron').desktopCapturer;report.composites=[];
        try{
          const capture=async(name,color)=>{
            backing.setBackgroundColor(color);await backing.loadURL('data:text/html,'+encodeURIComponent(`<html><body style="margin:0;background:${color};height:100vh"></body></html>`));backing.setAlwaysOnTop(true,'floating');backing.showInactive();win.setAlwaysOnTop(true,'screen-saver');win.show();win.moveTop();win.focus();await wait(800);
            if(!win.isFocused()){win.moveTop();win.focus();await wait(120);}
            assert(win.isFocused()&&win.isAlwaysOnTop(),'Owned window not foreground; capture discarded');
            const bounds=win.getBounds(),display=remote.screen.getDisplayMatching(bounds);
            const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
            assert(win.isFocused(),'Foreground changed; capture discarded');
            // Some Windows installers omit display_id. A single screen is unambiguous.
            const source=sources.find(s=>s.display_id===String(display.id))||(sources.length===1?sources[0]:null);assert(source&&!source.thumbnail.isEmpty(),'Screen unavailable');
            const size=source.thumbnail.getSize(),sx=size.width/display.bounds.width,sy=size.height/display.bounds.height;
            const x=Math.max(0,Math.round((bounds.x-display.bounds.x)*sx)),y=Math.max(0,Math.round((bounds.y-display.bounds.y)*sy));
            const own=source.thumbnail.crop({x,y,width:Math.min(size.width-x,Math.round(bounds.width*sx)),height:Math.min(size.height-y,Math.round(bounds.height*sy))});
            fs.writeFileSync(path.join(out,name+'.png'),own.toPNG());report.screenshots.push(name+'.png');
            const bitmap=own.toBitmap(),dim=own.getSize(),rgb=[0,0,0];let count=0;
            for(let py=Math.floor(dim.height*.74);py<Math.floor(dim.height*.8);py++)for(let px=Math.floor(dim.width*.12);px<Math.floor(dim.width*.17);px++){const pos=(py*dim.width+px)*4;rgb[0]+=bitmap[pos+2];rgb[1]+=bitmap[pos+1];rgb[2]+=bitmap[pos];count++;}
            return rgb.map(v=>v/count);
          };
          for(const palette of ['lagoon','violet']){
            await prism.updateSettings({palette,material:'glass'});
            const green=await capture(`23-${palette}-desktop-green`,'#8cd690'),pink=await capture(`24-${palette}-desktop-pink`,'#e5a8cf');
            const difference=green.reduce((n,v,i)=>n+Math.abs(v-pink[i]),0);assert(difference>12,`${palette} does not expose backdrop: ${difference}`);report.composites.push({palette,green,pink,difference});
          }
          for(const material of materials){await prism.updateSettings({material});await screenshot(`25-violet-${material}`);}
        }finally{win.setAlwaysOnTop(false);backing.close();}
        await prism.updateSettings({palette:'blue',material:'glass'});
      });
      await check('Unload and reload restore native backing and preserve appearance, data and Markdown',async()=>{
        await prism.updateSettings({palette:'violet',material:'frosted'});const before=JSON.stringify({tasks:prism.data.tasks,drafts:prism.data.drafts});
        await this.app.plugins.disablePlugin('prism-studio');assert(!document.documentElement.classList.contains('prism-native-glass'),'Glass remains after unload');assert(!document.querySelector('#prism-dynamic-skin'),'Style remains after unload');assert(!document.body.dataset.prismMaterial&&!document.body.dataset.prismPalette,'Appearance attributes remain');
        await this.app.plugins.enablePlugin('prism-studio');await until(()=>this.app.plugins.getPlugin('prism-studio'));prism=this.app.plugins.getPlugin('prism-studio');assert(prism.data.settings.palette==='violet'&&prism.data.settings.material==='frosted','Selection lost on reload');assert(before===JSON.stringify({tasks:prism.data.tasks,drafts:prism.data.drafts}),'Existing data changed');assert(await this.app.vault.read(note)===original,'Note changed');
        await prism.updateSettings({palette:'blue',material:'glass'});
      });
      report.finished=new Date().toISOString();
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{
      window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.errors=errors;report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!errors.length;
      report.environment={obsidian:this.app.getVersion?.()||require('obsidian').apiVersion,electron:process.versions.electron,os:require('os').release(),isolated:true};save();
      if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);
    }
  }
};
