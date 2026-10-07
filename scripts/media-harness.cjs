/* Image grouping and expansion checks, only in .test-vault. */
const {Plugin}=require('obsidian');const fs=require('fs'),path=require('path');
module.exports=class MediaHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),500));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const remote=require('@electron/remote'),win=remote.getCurrentWindow(),out=path.join(path.dirname(base),'verification');
    const report={started:new Date().toISOString(),suite:'media',checks:[],errors:[]};
    const save=()=>fs.writeFileSync(path.join(out,'media-results.json'),JSON.stringify(report,null,2));
    const assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+6000;while(Date.now()<end){if(fn())return;await wait(60);}throw new Error('Timed out waiting for image grouping');};
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const onError=e=>report.errors.push(e.message||String(e.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    try{
      win.show();win.setBounds({x:80,y:25,width:1200,height:900});await until(()=>this.app.plugins.getPlugin('prism-studio'));
      const prism=this.app.plugins.getPlugin('prism-studio');
      assert(prism.data.settings.imageDecks,'Automatic grouping is not enabled by default');
      for(let i=1;i<=3;i++)await this.app.vault.create(`Native expansion ${i}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><rect width="800" height="420" fill="${['#b6d9ee','#c3e4d6','#e6c5df'][i-1]}"/><text x="80" y="230" font-size="60">Image ${i}</text></svg>`);
      const pics=[1,2,3].map(i=>`![[Native expansion ${i}.svg]]`);
      const source='# Images\n\n## Inline\n\n'+pics.join(' ')+'\n\n## Consecutive\n\n'+pics.join('\n')+'\n\n## Blank lines\n\n'+pics.join('\n\n')+'\n\n## Text boundary\n\n'+pics[0]+'\n\nThis caption separates the images.\n\n'+pics[1];
      const file=await this.app.vault.create('Native expansion.md',source),leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});this.app.workspace.setActiveLeaf(leaf,{focus:true});
      let root=leaf.view.containerEl;
      await check('Ordinary images automatically stack without an explicit code block',async()=>{
        await until(()=>root.querySelector('.prism-deck-stage .prism-deck-card'));
        const deck=root.querySelector('.prism-deck');assert(deck.dataset.prismAuto==='true','Automatic grouping missing');assert(deck.querySelectorAll('.prism-deck-card').length===3,'Same-line images not split into cards');
        assert(!deck.classList.contains('is-static'),'Default stack is expanded');
      });
      await check('Subtle toggle expands and collapses without changing Markdown; refresh preserves state',async()=>{
        const deck=root.querySelector('.prism-deck'),toggle=deck.querySelector('.prism-deck-toggle');assert(toggle,'Expansion button missing');
        toggle.click();await wait(100);assert(deck.classList.contains('is-static')&&toggle.getAttribute('aria-expanded')==='true','Expand failed');
        for(const card of deck.querySelectorAll('.prism-deck-card'))assert(getComputedStyle(card).position==='relative','Expanded card still overlaps');
        prism.media.refresh();assert(deck.classList.contains('is-expanded'),'Refresh reset expansion');
        toggle.click();await wait(100);assert(!deck.classList.contains('is-static')&&toggle.getAttribute('aria-expanded')==='false','Collapse failed');
        assert(await this.app.vault.read(file)===source,'Source changed');
      });
      await check('Floating notes group images automatically and restore ordinary images on disable',async()=>{
        await prism.floats.open(file);await until(()=>document.querySelector('.prism-floating .prism-deck-toggle'));
        const floating=document.querySelector('.prism-floating');
        const decks=[...floating.querySelectorAll('.prism-deck')];assert(decks.length===3,'Image runs did not group independently, or text boundary was crossed');
        for(const deck of decks)assert(deck.querySelectorAll('.prism-deck-card').length===3,'Floating image count wrong');
        const originalCount=11;assert(floating.querySelectorAll('img').length===originalCount,'Images lost or duplicated');
        await prism.updateSettings({imageDecks:false});assert(!floating.querySelector('.prism-deck-toggle,.prism-deck-stage'),'Deck controls remain on disable');assert(floating.querySelectorAll('img').length===originalCount,'Restore lost images');
        await prism.updateSettings({imageDecks:true});await until(()=>floating.querySelectorAll('.prism-deck-toggle').length===3);
        assert(await this.app.vault.read(file)===source,'Source changed on disable/enable');prism.floats.closeAll(true);
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);}
  }
};
