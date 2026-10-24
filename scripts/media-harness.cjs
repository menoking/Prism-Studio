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
        const looseImages=container=>[...container.querySelectorAll('img')].filter(img=>!img.closest('.prism-deck,.prism-deck-original,.prism-deck-consumed')&&img.getClientRects().length>0).length;
        const group=heading=>{
          const title=[...root.querySelectorAll('h2')].find(el=>el.textContent.trim()===heading);if(!title)return null;
          const blocks=[];let node=title.closest('.el-h2')||title.parentElement;
          while((node=node.nextElementSibling)&&!node.matches('.el-h1,.el-h2,.el-h3'))blocks.push(node);
          return {blocks,decks:blocks.flatMap(block=>[...block.querySelectorAll('.prism-deck')]),loose:blocks.reduce((sum,block)=>sum+looseImages(block),0)};
        };
        await until(()=>root.querySelector('.prism-deck-stage .prism-deck-card'));
        const deck=root.querySelector('.prism-deck');assert(deck.dataset.prismAuto==='true','Automatic grouping missing');assert(deck.querySelectorAll('.prism-deck-card').length===3,'Same-line images not split into cards');
        assert(!deck.classList.contains('is-static'),'Default stack is expanded');
        assert(looseImages(root)===0,`${looseImages(root)} raw pictures stayed beside the first stack`);
        // Sections outside the viewport are not rendered, so reach each run before inspecting its blocks.
        for(const heading of ['Inline','Consecutive','Blank lines','Text boundary']){
          await this.app.workspace.openLinkText(`${file.path}#${heading}`,file.path,false);await wait(900);
          const found=group(heading);assert(found,`${heading}: heading not rendered`);
          report[`group-${heading}`]={blocks:found.blocks.length,decks:found.decks.length,cards:found.decks.map(d=>d.querySelectorAll('.prism-deck-card').length),loose:found.loose};
          if(heading==='Text boundary'){
            assert(found.decks.length===0,'A caption did not separate two image runs');
            assert(found.loose===2,`Text boundary: expected two plain images, got ${found.loose}`);
          }else{
            assert(found.decks.length===1,`${heading}: expected one stack, got ${found.decks.length}`);
            assert(found.decks[0].querySelectorAll('.prism-deck-card').length===3,`${heading}: stack lost pictures`);
            assert(found.loose===0,`${heading}: ${found.loose} raw pictures stayed beside the stack`);
          }
        }
        await this.app.workspace.openLinkText(`${file.path}#Inline`,file.path,false);await wait(900);
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
      await check('Repeated identical embeds plus live edits never show pictures twice',async()=>{
        const link='![[Native expansion 1.svg]]\n';
        const list='- [ ] 深度图/点云图/视差图\n\t- [ ] 李群与李变换\n- [x] 正逆运动学变换\n- [ ] TAMP\n\n';
        const stats=root=>{const decks=[...root.querySelectorAll('.prism-deck')];const loose=[...root.querySelectorAll('img')].filter(i=>!i.closest('.prism-deck,.prism-deck-original,.prism-deck-consumed')&&i.getClientRects().length>0).length;return {decks:decks.length,cards:decks.map(d=>d.querySelectorAll('.prism-deck-card').length),loose};};
        // One reused leaf: tab churn leaves the next preview unrendered in some sessions.
        const leaf=this.app.workspace.getLeaf('tab');await this.app.workspace.setActiveLeaf(leaf,{focus:true});
        const run=async(label,steps,content=list+link)=>{const file=await this.app.vault.create(`Native scenario ${label}.md`,content);await leaf.openFile(file);
          for(const step of steps)await step({file,leaf});
          const box=leaf.view.containerEl,view=()=>box.querySelector('.markdown-preview-view');
          const waitDeck=async()=>{const deadline=Date.now()+9000;while(Date.now()<deadline){if(box.querySelector('.prism-deck-stage'))return true;await wait(100);}return false;};
          let rendered=await waitDeck()?1:0;
          if(!rendered){await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'source'}});await wait(400);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});rendered=await waitDeck()?1:0;}
          if(!rendered)throw new Error(`${label}: stack never rendered (state=${JSON.stringify(leaf.view.getState?.())} source=${!!box.querySelector('.markdown-source-view')} preview=${!!box.querySelector('.markdown-preview-view')} sizer=${box.querySelector('.markdown-preview-sizer')?.children.length} imgs=${box.querySelectorAll('img').length})`);
          const scroll=view();if(scroll)scroll.scrollTop=scroll.scrollHeight;
          await wait(1200);
          const row=stats(box);
          report.scenarios=[...(report.scenarios||[]),{label,...row}];
          if(row.loose||row.decks!==1){
            const view=leaf.view.containerEl.querySelector('.markdown-preview-view');
            const sections=[...(view?.querySelectorAll('.markdown-preview-section')||[])].map(sec=>({cls:sec.className,children:[...sec.children].map(c=>({tag:c.tagName,cls:c.className,imgs:c.querySelectorAll('img').length,hidden:c.querySelectorAll('.prism-deck-original').length,html:c.outerHTML.replace(/app:\/\/[^"']+/g,'SRC').slice(0,900)}))}));
            report.dump=[...(report.dump||[]),{label,viewHeight:view?.scrollHeight,sections}];
          }
          assert(row.decks===1,`${label}: expected one stack, got ${row.decks}`);
          assert(row.cards[0]===3,`${label}: expected 3 cards, got ${row.cards[0]}`);
          assert(row.loose===0,`${label}: ${row.loose} raw pictures stayed beside the stack`);
          await wait(200);};
        await run('open-reading-three',[async({file,leaf})=>{await this.app.vault.modify(file,list+link+link+link);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await wait(1200);}]);
        await run('edit-while-reading',[async({file,leaf})=>{await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await wait(900);await this.app.vault.modify(file,list+link+link+link);await wait(1500);}]);
        await run('source-then-preview',[async({file,leaf})=>{await this.app.vault.modify(file,list+link+link+link);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'source'}});await wait(700);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await wait(1400);}]);
        await run('grow-images-in-preview',[async({file,leaf})=>{await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await wait(800);await this.app.vault.modify(file,list+link+link);await wait(1200);await this.app.vault.modify(file,list+link+link+link);await wait(1500);}]);
        // The reported note, verbatim, with its real PNG: three identical embeds under a checklist.
        const notePath=process.env.PRISM_TARGET_NOTE||'D:/Academic/Papers/Notes/Meno‘s Academic Notes/todo/Target.md';
        const imagePath=process.env.PRISM_TARGET_IMAGE||'D:/Academic/Papers/Notes/Meno‘s Academic Notes/Attachment/pic/Pasted image 20261024223302.png';
        if(fs.existsSync(notePath)&&fs.existsSync(imagePath)){
          const name=path.basename(imagePath),bytes=fs.readFileSync(imagePath);
          await this.app.vault.adapter.writeBinary(name,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
          const real=(await fs.promises.readFile(notePath,'utf8')).replace(/\r\n/g,'\n');
          const rows=real.split('\n'),trimmed=()=>{const out=[...rows];for(let i=out.length-1;i>=0;i--)if(out[i].trim()){out.splice(i,1);break;}return out.join('\n').replace(/\n+$/,'\n');};
          await run('real-note-open',[async({file,leaf})=>{await this.app.vault.modify(file,real);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await wait(1200);}],real);
          await run('real-note-grow',[async({file,leaf})=>{await this.app.vault.modify(file,trimmed());await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await wait(1200);await this.app.vault.modify(file,real);await wait(1500);}],trimmed());
        }
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);}
  }
};
