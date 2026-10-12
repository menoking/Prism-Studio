/* Focused workbench checks; installed only into the isolated test vault. */
const {Plugin}=require('obsidian');
const fs=require('fs'),path=require('path');
module.exports=class DashboardHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),500));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();
    if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const remote=require('@electron/remote'),win=remote.getCurrentWindow();
    const out=path.join(path.dirname(base),'verification');fs.mkdirSync(out,{recursive:true});
    const report={started:new Date().toISOString(),suite:'dashboard',checks:[],errors:[]};
    const save=()=>fs.writeFileSync(path.join(out,'dashboard-results.json'),JSON.stringify(report,null,2));
    const assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await wait(50);}throw new Error('Timed out waiting for workbench');};
    const onError=e=>report.errors.push(e.message||String(e.reason));
    window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    try{
      win.show();win.setFullScreen(false);win.unmaximize();win.setBounds({x:80,y:25,width:1280,height:900});
      await until(()=>this.app.plugins.getPlugin('prism-studio'));
      const prism=this.app.plugins.getPlugin('prism-studio');await prism.openStudio('home');
      const view=this.app.workspace.getLeavesOfType('prism-studio-view')[0].view;
      const keys=Object.keys(prism.data.settings.homeWidgets),all=Object.fromEntries(keys.map(k=>[k,true]));
      await prism.updateSettings({homeWidgets:all});await wait(180);
      const click=(root,label)=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(b,`Missing button ${label}`);b.click();};
      await check('Task ribbon removed; task command and workbench navigation remain',async()=>{
        assert(!document.querySelector('.side-dock-ribbon-action[aria-label="Prism · 任务"]'),'Task ribbon remains');
        assert(this.app.commands.commands['prism-studio:open-tasks'],'Task command removed');
        view.selectTab('tasks');assert(view.contentEl.textContent.includes('Tempo · 任务'),'Task page missing');view.selectTab('home');
      });
      await check('Contribution wall fills its card at desktop and narrow widths',async()=>{
        report.layout=[];
        for(const width of [1280,640]){
          win.setBounds({x:80,y:25,width,height:900});await wait(180);
          const heat=view.contentEl.querySelector('.prism-mini-heatmap');
          const cells=[...heat.querySelectorAll('.prism-heat-cell')];assert(cells.length===84,'Contribution dates changed');
          const h=heat.getBoundingClientRect(),first=cells[0].getBoundingClientRect(),last=cells.at(-1).getBoundingClientRect();
          assert(h.width>100,'Contribution wall has no usable width');
          assert(Math.abs(first.left-h.left)<2 && Math.abs(last.right-h.right)<2,'Cells do not span the wall');
          assert(heat.scrollWidth<=heat.clientWidth+1,'Contribution wall overflows');
          report.layout.push({width,wallWidth:h.width,firstLeft:first.left,lastRight:last.right});
        }
        win.setBounds({x:80,y:25,width:1280,height:900});await wait(180);
        fs.writeFileSync(path.join(out,'31-dashboard-full-width.png'),(await win.capturePage()).toPNG());
      });
      await check('Every component can hide, persist and restore across workbench sections',async()=>{
        click(view.contentEl,'自定义工作台');await until(()=>document.querySelector('[data-prism-widget-toggle]'));
        const modal=document.querySelector('[data-prism-widget-toggle]').closest('.modal');
        assert(modal.querySelectorAll('[data-prism-widget-toggle]').length===keys.length,'Missing component switches');
        for(const key of keys){
          modal.querySelector(`[data-prism-widget-toggle="${key}"]`).click();
          await until(()=>prism.data.settings.homeWidgets[key]===false);
        }
        await prism.save();await wait(180);
        const saved=await prism.loadData();assert(Object.values(saved.settings.homeWidgets).every(v=>v===false),'Visibility not persisted');
        click(modal,'完成');
        for(const label of ['今天','创作','知识','复盘']){
          click(view.contentEl,label);assert(!view.contentEl.querySelector('[data-prism-widget]'),`Hidden widgets present in ${label}`);
          assert(!view.contentEl.querySelector('.prism-home-grid'),'Empty grid leaves a gap');
          assert(view.contentEl.textContent.includes('当前分区的组件已隐藏'),'Empty-state recovery missing');
        }
        click(view.contentEl,'自定义工作台');await until(()=>document.querySelector('[data-prism-widget-toggle]'));
        const restoredModal=document.querySelector('[data-prism-widget-toggle]').closest('.modal');
        click(restoredModal,'显示全部');await until(()=>Object.values(prism.data.settings.homeWidgets).every(Boolean));await wait(180);
        click(restoredModal,'完成');
        assert(view.contentEl.querySelector('[data-prism-widget="createdNotes"]'),'Created-note timeline not restored');
        click(view.contentEl,'创作');assert(view.contentEl.querySelectorAll('[data-prism-widget]').length===6,'Creative widgets not restored');
        assert(view.contentEl.querySelector('.prism-home-wide'),'Last unpaired card does not fill row');
        click(view.contentEl,'知识');assert(view.contentEl.querySelector('[data-prism-widget="tags"]'),'Knowledge tags not restored');
        click(view.contentEl,'今天');assert(view.contentEl.querySelectorAll('[data-prism-widget]').length===7,'Home widgets not restored');
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{
      window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);
      report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();
      if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);
    }
  }
};
