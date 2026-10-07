/* A single focused run in the isolated vault: font loading, independent settings and theme fallback. */
const {Plugin}=require('obsidian');const fs=require('fs'),path=require('path');
module.exports=class TypographyHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),500));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const remote=require('@electron/remote'),win=remote.getCurrentWindow(),out=path.join(path.dirname(base),'verification');
    fs.mkdirSync(out,{recursive:true});const report={started:new Date().toISOString(),suite:'typography',checks:[],errors:[],screenshots:[],fonts:[]};
    const save=()=>fs.writeFileSync(path.join(out,'typography-results.json'),JSON.stringify(report,null,2));
    const assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await wait(60);}throw new Error('Timed out waiting for typography view');};
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const onError=e=>report.errors.push(e.message||String(e.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    let themeStyle;
    try{
      win.show();win.setBounds({x:80,y:25,width:1280,height:920});await until(()=>this.app.plugins.getPlugin('prism-studio'));
      const prism=this.app.plugins.getPlugin('prism-studio');await prism.updateSettings({enabled:true,nativeGlass:false,uiFont:'default',noteFont:'default',uiFontSize:0,fontSize:18,mono:true});
      const file=await this.app.vault.create('Native Typography.md','# 阅读与思考\n\n让思考清晰，让阅读从容。Read, reflect, and connect. 0123456789\n\n## 同一份笔记\n\n保留 **重要线索**，将 *想法* 连在一起。\n\n`const font = "code";`\n\n```js\nconst value = 42;\n```\n');
      const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});
      const noteRoot=()=>leaf.view.containerEl.querySelector('.markdown-preview-sizer');await until(noteRoot);
      await prism.openStudio('home');const uiHeading=()=>document.querySelector('.prism-view h1');await until(uiHeading);
      const originalUIFamily=getComputedStyle(uiHeading()).fontFamily,originalUISize=getComputedStyle(uiHeading()).fontSize,originalNoteFamily=getComputedStyle(noteRoot()).fontFamily;
      await check('All eight bundled fonts load from local plugin resources',async()=>{
        for(const family of ['Prism Inter','Prism Manrope','Prism IBM Plex Sans','Prism Noto Sans SC','Prism Noto Serif SC','Prism Literata','Prism JetBrains Mono','Prism WenKai']){
          const faces=await Promise.race([document.fonts.load(`400 16px "${family}"`,'阅读与思考 Read 0123456789'),wait(15000).then(()=>{throw new Error('Font load timeout: '+family);})]);
          assert(faces.length&&faces.every(f=>f.status==='loaded'),'Local font did not load: '+family);
          report.fonts.push({family,status:faces.map(f=>f.status)});
        }
        assert(!document.getElementById('prism-font-faces').textContent.match(/url\("https?:/),'Remote font URL found');
      });
      await check('UI family and size change without affecting the note family or size',async()=>{
        await prism.updateSettings({uiFont:'manrope',uiFontSize:18});await wait(80);
        assert(getComputedStyle(uiHeading()).fontFamily.includes('Prism Manrope'),'Workbench did not adopt UI font');
        assert(Math.abs(parseFloat(getComputedStyle(uiHeading()).fontSize)-parseFloat(originalUISize)*18/13)<.1,'Workbench heading did not scale');
        assert(getComputedStyle(noteRoot()).fontFamily===originalNoteFamily,'UI font changed note font');
        assert(parseFloat(getComputedStyle(noteRoot()).fontSize)===18,'UI size changed note size');
        const nav=document.querySelector('.nav-file-title');assert(nav&&Math.abs(parseFloat(getComputedStyle(nav).fontSize)-18)<.1,'File tree did not adopt UI size');
      });
      await check('Reading, live editor and floating notes use the selected note font; code stays monospace',async()=>{
        await prism.updateSettings({noteFont:'apple-serif',fontSize:21});await wait(60);
        await this.app.workspace.revealLeaf(leaf);this.app.workspace.setActiveLeaf(leaf,{focus:true});await until(()=>noteRoot()?.querySelector('code'));
        assert(getComputedStyle(noteRoot()).fontFamily.includes('Prism Literata'),'Reading font not applied');
        assert(parseFloat(getComputedStyle(noteRoot()).fontSize)===21,'Note size not applied');
        const code=noteRoot().querySelector('code');assert(code&&!getComputedStyle(code).fontFamily.includes('Prism Literata'),'Code font was replaced by prose font');
        assert(getComputedStyle(uiHeading()).fontFamily.includes('Prism Manrope'),'Note font changed UI font');
        await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'source'}});await until(()=>leaf.view.containerEl.querySelector('.cm-content'));
        const editor=leaf.view.containerEl.querySelector('.cm-content');assert(getComputedStyle(editor).fontFamily.includes('Prism Literata'),'Live editor font not applied');
        await prism.floats.open(file);await until(()=>document.querySelector('.prism-note-preview'));
        const floating=document.querySelector('.prism-floating');assert(getComputedStyle(floating.querySelector('.prism-note-preview')).fontFamily.includes('Prism Literata'),'Floating reader font not applied');
        const edit=floating.querySelector('button[aria-label="阅读 / 编辑"]')||floating.querySelector('button[title="阅读 / 编辑"]');assert(edit,'Floating edit button missing');edit.click();await until(()=>floating.querySelector('.prism-floating-editor'));
        assert(getComputedStyle(floating.querySelector('.prism-floating-editor')).fontFamily.includes('Prism Literata'),'Floating editor font not applied');
        assert(parseFloat(getComputedStyle(floating.querySelector('.prism-floating-editor')).fontSize)===21,'Floating editor note size not applied');
        prism.floats.closeAll(true);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await until(noteRoot);
      });
      await check('Blue Topaz heading, emphasis and file tree fonts respect independent custom choices',async()=>{
        await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await this.app.workspace.revealLeaf(leaf);this.app.workspace.setActiveLeaf(leaf,{focus:true});await until(()=>noteRoot()?.querySelector('strong'));
        const css=path.join(base,'.obsidian','themes','Blue Topaz','theme.css');assert(fs.existsSync(css),'Blue Topaz fixture missing');
        themeStyle=document.createElement('style');themeStyle.textContent=fs.readFileSync(css,'utf8');document.head.appendChild(themeStyle);
        prism.refreshSkin();await wait(120);
        assert(getComputedStyle(noteRoot().querySelector('h1')).fontFamily.includes('Prism Literata'),'Theme heading overrode note font');
        assert(getComputedStyle(noteRoot().querySelector('strong')).fontFamily.includes('Prism Literata'),'Theme emphasis overrode note font');
        const nav=document.querySelector('.nav-file-title');assert(getComputedStyle(nav).fontFamily.includes('Prism Manrope'),'Theme file tree overrode UI font');
        assert(Math.abs(parseFloat(getComputedStyle(nav).fontSize)-18)<.1,'Theme file tree ignored UI size');
        assert(getComputedStyle(document.querySelector('.prism-brand strong')).fontFamily.includes('Prism Manrope'),'Theme replaced UI brand font');
        themeStyle.remove();themeStyle=undefined;
      });
      await check('Settings controls update live previews, disable legacy mono, and reset only font preferences',async()=>{
        this.app.setting.open();this.app.setting.openTabById('prism-studio');await until(()=>this.app.setting.activeTab?.id==='prism-studio'&&this.app.setting.activeTab.containerEl.isConnected&&this.app.setting.activeTab.containerEl.querySelector('.prism-typography-settings'));
        const section=this.app.setting.activeTab.containerEl.querySelector('.prism-typography-settings'),settingsDoc=section.ownerDocument,row=name=>[...section.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent===name);
        const ui=row('界面字体').querySelector('select'),notes=row('笔记字体').querySelector('select');
        assert(ui.options.length===7&&notes.options.length===10,'Font options missing');
        notes.value='wenkai';notes.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>getComputedStyle(section.querySelector('.prism-font-preview-note')).fontFamily.includes('Prism WenKai'));
        assert(row('默认笔记使用等宽字体').querySelector('.checkbox-container').classList.contains('is-disabled'),'Legacy mono toggle stays enabled');
        const input=row('界面字号').querySelector('input[type="number"]');input.value='20';input.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>prism.data.settings.uiFontSize===20);
        assert(prism.data.settings.fontSize===21,'Changing UI size changed note size');
        section.scrollIntoView({block:'start'});const settingsWindow=settingsDoc.defaultView.require('@electron/remote').getCurrentWindow();
        const screenshot=await settingsWindow.capturePage();fs.writeFileSync(path.join(out,'41-typography-settings.png'),screenshot.toPNG());report.screenshots.push('41-typography-settings.png');
        row('重置字体').querySelector('button').click();await until(()=>prism.data.settings.uiFont==='default'&&prism.data.settings.noteFont==='default'&&prism.data.settings.uiFontSize===0);
        assert(prism.data.settings.fontSize===21&&prism.data.settings.palette==='blue'&&prism.data.settings.material==='glass','Font reset altered existing note size or appearance');
        this.app.setting.close();await wait(100);
        assert(getComputedStyle(uiHeading()).fontFamily===originalUIFamily,'UI default did not restore previous font');
        assert(getComputedStyle(uiHeading()).fontSize===originalUISize,'UI default did not restore previous size');
        assert(getComputedStyle(noteRoot()).fontFamily===originalNoteFamily,'Note default did not restore previous font');
      });
      await check('Unloading removes font and size overrides without rewriting note content',async()=>{
        assert(await this.app.vault.read(file)==='# 阅读与思考\n\n让思考清晰，让阅读从容。Read, reflect, and connect. 0123456789\n\n## 同一份笔记\n\n保留 **重要线索**，将 *想法* 连在一起。\n\n`const font = "code";`\n\n```js\nconst value = 42;\n```\n','Typography changed Markdown content');
        await this.app.plugins.disablePlugin('prism-studio');
        assert(!document.getElementById('prism-font-faces')&&!document.getElementById('prism-dynamic-skin')&&!document.body.classList.contains('prism-skin'),'Overrides remain after unload');
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{
      themeStyle?.remove();window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);
      report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();
      if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);
    }
  }
};
