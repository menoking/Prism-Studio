const {Plugin}=require('obsidian');const fs=require('fs'),path=require('path');
module.exports=class ScreenshotsHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),600));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated demonstration vault');
    const root=path.dirname(base),out=path.join(root,'docs/screenshots');fs.mkdirSync(out,{recursive:true});
    const remote=require('@electron/remote'),win=remote.getCurrentWindow(),wait=ms=>new Promise(r=>setTimeout(r,ms));
    const report={started:new Date().toISOString(),version:'1.5.1',screenshots:[],source:'Actual Windows Obsidian; isolated demonstration notes and tasks'};
    const until=async fn=>{for(let end=Date.now()+10000;Date.now()<end;){if(fn())return;await wait(80);}throw new Error('Demonstration view unavailable');};
    let backing;
    try{
      win.show();win.setFullScreen(false);win.unmaximize();win.setBounds({x:80,y:25,width:1280,height:900});
      await until(()=>this.app.plugins.getPlugin('prism-studio'));const prism=this.app.plugins.getPlugin('prism-studio');
      await prism.updateSettings({enabled:true,nativeGlass:true,uiFont:'inter',uiFontSize:0,noteFont:'apple',fontSize:16,mono:false,homeOnStartup:false,recordActivity:false});
      backing=new remote.BrowserWindow({show:false,frame:false,...win.getBounds(),webPreferences:{contextIsolation:true,nodeIntegration:false}});
      await backing.loadURL('data:text/html,'+encodeURIComponent('<html><body style="margin:0;height:100vh;background:radial-gradient(ellipse at 80% 15%,#d5b6dc,transparent 48%),radial-gradient(ellipse at 15% 80%,#a7c9bb,transparent 55%),linear-gradient(110deg,#b9d9d0,#e8dcb6 55%,#c1cbe5)"></body></html>'));
      const capture=async(name,owner=win)=>{
        backing.setAlwaysOnTop(true,'floating');backing.showInactive();owner.setAlwaysOnTop(true,'screen-saver');owner.show();owner.moveTop();owner.focus();await wait(750);
        if(!owner.isFocused())throw new Error('Owned demonstration window is not focused; capture discarded');
        const bounds=owner.getBounds(),display=remote.screen.getDisplayMatching(bounds),sources=await remote.require('electron').desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
        if(!owner.isFocused())throw new Error('Focus changed; capture discarded');
        const source=sources.find(s=>s.display_id===String(display.id))||(sources.length===1?sources[0]:null);if(!source||source.thumbnail.isEmpty())throw new Error('Display capture unavailable');
        const dim=source.thumbnail.getSize(),sx=dim.width/display.bounds.width,sy=dim.height/display.bounds.height,x=Math.max(0,Math.round((bounds.x-display.bounds.x)*sx)),y=Math.max(0,Math.round((bounds.y-display.bounds.y)*sy));
        const own=source.thumbnail.crop({x,y,width:Math.min(dim.width-x,Math.round(bounds.width*sx)),height:Math.min(dim.height-y,Math.round(bounds.height*sy))});
        fs.writeFileSync(path.join(out,name),own.toPNG());report.screenshots.push({file:name,palette:prism.data.settings.palette,material:prism.data.settings.material});owner.setAlwaysOnTop(false);
      };
      await prism.openStudio('home');await document.fonts.ready;await capture('blue-glass.png');
      await prism.updateSettings({palette:'mint',material:'glass'});await capture('mint-glass.png');
      await prism.updateSettings({palette:'violet',material:'acrylic'});await capture('violet-acrylic.png');
      document.body.classList.remove('theme-light');document.body.classList.add('theme-dark');await prism.updateSettings({palette:'violet',material:'glass'});await capture('violet-dark.png');
      document.body.classList.remove('theme-dark');document.body.classList.add('theme-light');await prism.updateSettings({palette:'blue',material:'glass'});
      const assets='Demo Assets';if(!this.app.vault.getAbstractFileByPath(assets))await this.app.vault.createFolder(assets);
      const illustrations=[['#a8cbbb','#477e71','清晨 · Morning'],['#bcc5e3','#676f9b','远山 · Mountains'],['#e1c7b8','#a8796c','日落 · Sunset']];
      for(let i=0;i<illustrations.length;i++){const [bg,fg,title]=illustrations[i];const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="${bg}"/><circle cx="730" cy="160" r="78" fill="#fbf3dd"/><path d="M0 520L220 220L450 460L660 260L960 520V600H0Z" fill="${fg}"/><text x="55" y="92" font-family="sans-serif" font-size="35" fill="#263843">${title}</text></svg>`;await this.app.vault.create(`${assets}/landscape-${i}.svg`,svg);}
      const file=await this.app.vault.create('Native Demo Reading.md','# 阅读与思考\n\n让阅读轻盈，让知识在连接中生长。\n\n## 片刻风景\n\n![[Demo Assets/landscape-0.svg]]\n![[Demo Assets/landscape-1.svg]]\n![[Demo Assets/landscape-2.svg]]\n\n## 一段清晰的思考\n\n同一张纸上，记录问题、证据与下一步。\n\n> [!tip] 阅读之后\n> 用自己的语言解释，再链接到已有的笔记。\n');
      const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});this.app.workspace.setActiveLeaf(leaf,{focus:true});
      await until(()=>leaf.view.containerEl.querySelector('.prism-deck-stage'));await capture('reading-deck.png');
      this.app.setting.open();this.app.setting.openTabById('prism-studio');await until(()=>this.app.setting.activeTab?.containerEl.isConnected&&this.app.setting.activeTab.containerEl.querySelector('.prism-typography-settings'));
      const settings=this.app.setting.activeTab.containerEl,doc=settings.ownerDocument,settingsWin=doc.defaultView.require('@electron/remote').getCurrentWindow();
      settingsWin.setBounds({x:80,y:25,width:1280,height:1050});await prism.updateSettings({noteFont:'wenkai'});this.app.setting.activeTab.display();
      const section=settings.querySelector('.prism-typography-settings');section.scrollIntoView({block:'start',behavior:'instant'});await wait(400);await capture('font-settings.png',settingsWin);
      this.app.setting.close();
    }catch(e){report.error=String(e)+'\n'+e.stack;}
    finally{backing?.destroy();win.setAlwaysOnTop(false);report.finished=new Date().toISOString();fs.writeFileSync(path.join(root,'verification/screenshots-results.json'),JSON.stringify(report,null,2));if(path.resolve(remote.app.getPath('userData'))===path.resolve(root,'.test-profile'))setTimeout(()=>remote.app.quit(),500);}
  }
};
