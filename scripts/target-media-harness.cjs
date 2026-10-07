/* Reproduces the user-provided Target note in an isolated vault; never edits the original. */
const {Plugin}=require('obsidian');const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=class TargetMediaHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),500));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const remote=require('@electron/remote'),win=remote.getCurrentWindow(),out=path.join(path.dirname(base),'verification');
    const fixture=JSON.parse(fs.readFileSync(path.join(out,'target-fixture.json'),'utf8').replace(/^\uFEFF/,''));
    const report={started:new Date().toISOString(),suite:'target-media',checks:[],errors:[],screenshots:[]};
    const save=()=>fs.writeFileSync(path.join(out,'target-media-results.json'),JSON.stringify(report,null,2));
    const assert=(v,m)=>{if(!v)throw new Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await wait(60);}throw new Error('Timed out waiting for Target image grouping');};
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const onError=e=>report.errors.push(e.message||String(e.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    try{
      win.show();win.setBounds({x:80,y:25,width:1280,height:900});await until(()=>this.app.plugins.getPlugin('prism-studio'));
      const prism=this.app.plugins.getPlugin('prism-studio');await prism.updateSettings(fixture.settings);
      const folder='Native Target assets';if(!this.app.vault.getAbstractFileByPath(folder))await this.app.vault.createFolder(folder);
      for(const asset of fixture.assets){const buffer=fs.readFileSync(asset),filePath=folder+'/'+path.basename(asset),existing=this.app.vault.getAbstractFileByPath(filePath);if(existing)await this.app.vault.modifyBinary(existing,buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));else await this.app.vault.createBinary(filePath,buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));}
      const source=fs.readFileSync(fixture.note,'utf8'),sourceHash=crypto.createHash('sha256').update(source).digest('hex');
      const file=await this.app.vault.create('Native Target.md',source),leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});this.app.workspace.setActiveLeaf(leaf,{focus:true});
      const root=leaf.view.containerEl.querySelector('.markdown-reading-view'),scroll=root.querySelector('.markdown-preview-view');
      let auto,explicit;
      await check('Exact Target syntax: automatic and explicit groups each contain two separate cards',async()=>{
        await until(()=>root.querySelector('[data-prism-auto] .prism-deck-stage')&&root.querySelector('[data-prism-explicit] .prism-deck-stage'));
        auto=root.querySelector('[data-prism-auto]');explicit=root.querySelector('[data-prism-explicit]');
        for(const deck of [auto,explicit]){const cards=[...deck.querySelectorAll('.prism-deck-card')];assert(cards.length===2,'Same-line image pair did not become two cards');assert(cards.every(c=>c.querySelectorAll('img').length===1),'Several pictures share a card');}
        const tasks=[...root.querySelectorAll('input.task-list-item-checkbox')];assert(tasks.length>5,'Task list was lost');assert(tasks.every(t=>t.getClientRects().length>0),'Task list was hidden with the original images');
      });
      await check('Visible centered overlap, no offscreen second picture; both groups expand and collapse',async()=>{
        report.geometry=[];
        for(const [name,deck] of [['auto',auto],['explicit',explicit]]){
          scroll.scrollTop+=deck.getBoundingClientRect().top-scroll.getBoundingClientRect().top-80;await wait(200);
          const cards=[...deck.querySelectorAll('.prism-deck-card')],a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect();
          const overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
          assert(overlap>Math.min(a.width*a.height,b.width*b.height)*.65,'Pictures do not form an overlapping deck');
          assert(cards.every(c=>Number(getComputedStyle(c).opacity)>0),'Back card is invisible');
          const stage=deck.querySelector('.prism-deck-stage'),rect=stage.getBoundingClientRect();assert(rect.width<=761,'Stage is stretched across the entire wide page');
          assert(rect.height<500,'Deck stage is too tall');report.geometry.push({name,cards:cards.length,stageWidth:rect.width,stageHeight:rect.height,overlap});
          const img=await win.capturePage({x:Math.max(0,Math.floor(rect.left-12)),y:Math.max(0,Math.floor(rect.top-12)),width:Math.ceil(rect.width+24),height:Math.ceil(rect.height+24)});
          const screenshot=`32-target-${name}-stack.png`;fs.writeFileSync(path.join(out,screenshot),img.toPNG());report.screenshots.push(screenshot);
          const toggle=deck.querySelector('.prism-deck-toggle');toggle.click();await wait(80);assert(deck.classList.contains('is-expanded'),'Expand failed');assert(cards.every(c=>getComputedStyle(c).position==='relative'),'Expanded images still overlap');toggle.click();await wait(80);assert(!deck.classList.contains('is-expanded'),'Collapse failed');
        }
      });
      await check('Original Target and image files stay unchanged',async()=>{
        assert(await this.app.vault.read(file)===source,'Reproduction source changed');
        assert(crypto.createHash('sha256').update(fs.readFileSync(fixture.note)).digest('hex')===sourceHash,'Original Target changed');
        for(const asset of fixture.assets){const copy=fs.readFileSync(path.join(base,'Native Target assets',path.basename(asset)));assert(copy.equals(fs.readFileSync(asset)),'Image bytes changed');}
      });
      await check('Natural proportions fit card edges; cover is optional and expansion always shows the full image',async()=>{
        await prism.updateSettings({imageFit:'natural'});await wait(150);
        for(const deck of [auto,explicit])for(const card of deck.querySelectorAll('.prism-deck-card')){
          const img=card.querySelector('img'),style=getComputedStyle(card);
          assert(img.naturalWidth>0,'Image not loaded');
          assert(Math.abs(parseFloat(style.width)/parseFloat(style.height)-img.naturalWidth/img.naturalHeight)<.015,'Natural card has mismatched image ratio');
        }
        await prism.updateSettings({imageFit:'cover'});await wait(100);
        const cards=[...explicit.querySelectorAll('.prism-deck-card')];
        assert(getComputedStyle(cards[0]).width===getComputedStyle(cards[1]).width&&getComputedStyle(cards[0]).height===getComputedStyle(cards[1]).height,'Cover cards have different sizes');
        assert(getComputedStyle(cards[0].querySelector('img')).objectFit==='cover','Cover does not fill');
        explicit.querySelector('.prism-deck-toggle').click();await wait(80);
        assert(getComputedStyle(cards[0].querySelector('img')).objectFit==='contain','Expanded cover image remains cropped');
        explicit.querySelector('.prism-deck-collapse').click();await wait(80);
        await prism.updateSettings({imageFit:'natural'});
      });
      await check('Long expanded group retains a visible sticky collapse icon and a bottom recovery button',async()=>{
        const folder='Native Target assets';
        const longPath=folder+'/Native long-image.svg';
        const svg='<svg xmlns="http://www.w3.org/2000/svg" width="500" height="2400"><rect width="500" height="2400" fill="#b9d8e8"/><text x="40" y="100" font-size="30">Long image</text></svg>';
        const existing=this.app.vault.getAbstractFileByPath(longPath);if(existing)await this.app.vault.modify(existing,svg);else await this.app.vault.create(longPath,svg);
        const longFile=await this.app.vault.create('Native long-group.md','# Mixed ratios\n\n![[Native long-image.svg]]![[cloudblack.png]]');
        await leaf.openFile(longFile);await leaf.setViewState({type:'markdown',state:{file:longFile.path,mode:'preview'}});
        const longRoot=leaf.view.containerEl.querySelector('.markdown-reading-view'),longScroll=longRoot.querySelector('.markdown-preview-view');
        await until(()=>longRoot.querySelector('.prism-deck-toggle'));
        const deck=longRoot.querySelector('.prism-deck'),toggle=deck.querySelector('.prism-deck-toggle');
        toggle.click();await wait(100);
        longScroll.scrollTop+=deck.getBoundingClientRect().top-longScroll.getBoundingClientRect().top+600;await wait(100);
        const b=toggle.getBoundingClientRect(),s=longScroll.getBoundingClientRect();assert(b.top>=s.top&&b.bottom<=s.bottom,'Collapse icon scrolled out of view');
        const button=deck.querySelector('.prism-deck-collapse');assert(getComputedStyle(button).display!=='none','Bottom collapse missing');
        button.click();await wait(100);assert(!deck.classList.contains('is-expanded'),'Bottom collapse failed');
        assert(Math.abs(deck.getBoundingClientRect().top-longScroll.getBoundingClientRect().top-24)<6,'Collapse did not return to the deck');
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);}
  }
};
