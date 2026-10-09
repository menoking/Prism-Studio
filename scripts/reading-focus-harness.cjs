/* Focus regression uses a read-only copy of the supplied note and the installed Dataview runtime. */
const {Plugin}=require('obsidian');const fs=require('fs'),path=require('path');
module.exports=class ReadingFocusHarness extends Plugin {
  onload(){this.app.workspace.onLayoutReady(()=>setTimeout(()=>void this.run(),500));}
  async run(){
    const base=this.app.vault.adapter.getBasePath();if(path.basename(base)!=='.test-vault')throw new Error('Expected isolated test vault');
    const remote=require('@electron/remote'),win=remote.getCurrentWindow(),out=path.join(path.dirname(base),'verification');fs.mkdirSync(out,{recursive:true});
    const report={started:new Date().toISOString(),suite:'reading-focus',checks:[],errors:[],screenshots:[]};
    const save=()=>fs.writeFileSync(path.join(out,'reading-focus-results.json'),JSON.stringify(report,null,2));
    const assert=(value,message)=>{if(!value)throw new Error(message);},wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async(fn)=>{const end=Date.now()+12000;while(Date.now()<end){if(fn())return;await wait(60);}throw new Error('Timed out waiting for editor or Dataview');};
    const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:String(e),stack:e.stack});}save();};
    const onError=e=>report.errors.push(e.message||String(e.reason));window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onError);
    try{
      win.show();win.focus();win.setBounds({x:80,y:30,width:1280,height:850});
      await until(()=>this.app.plugins.getPlugin('prism-studio')&&this.app.plugins.getPlugin('dataview'));
      const prism=this.app.plugins.getPlugin('prism-studio');await prism.updateSettings({enabled:true,nativeGlass:false,readingRail:true,homeOnStartup:false});
      const file=this.app.vault.getAbstractFileByPath('Native Dataview Focus.md'),original=await this.app.vault.read(file),lines=original.split(/\r?\n/);
      const start=lines.findIndex(line=>line.trim()==='```dataviewjs'),end=lines.findIndex((line,i)=>i>start&&line.trim()==='```');
      assert(start>=0&&end-start>100,'Expected the supplied long dataviewjs block');report.codeLines=end-start-1;
      const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'source',source:false}});
      this.app.workspace.setActiveLeaf(leaf,{focus:true});const view=leaf.view,editor=view.editor;
      const scroll=view.containerEl.querySelector('.cm-scroller');assert(scroll,'Editor scroller missing');
      const rail=()=>[...document.querySelectorAll('.prism-reading-rail')].find(el=>!el.hidden&&el.querySelector('.prism-rail-heading[title="Search Path"]'));
      const result=()=>view.containerEl.querySelector('[data-result]');
      const cursor={line:Math.min(start+80,end-2),ch:2};
      const openCode=async()=>{win.focus();editor.setCursor(cursor);editor.focus();editor.scrollIntoView({from:cursor,to:cursor},true);await until(()=>editor.hasFocus()&&!result()&&rail());await wait(100);};
      editor.setCursor({line:start-1,ch:0});editor.focus();editor.scrollIntoView({from:{line:start-1,ch:0},to:{line:start+2,ch:0}},true);
      await until(()=>result()&&rail());assert(result().textContent==='1.000','Reference chart did not execute');
      await check('Old rail focus reproduces the source-to-chart collapse without changing the note',async()=>{
        await openCode();const sourceHeight=scroll.scrollHeight;rail().focus();await until(()=>!editor.hasFocus()&&result());
        report.baseline={sourceHeight,previewHeight:scroll.scrollHeight};assert(scroll.scrollHeight<sourceHeight,'Old rail focus did not collapse the long code');
      });
      await check('Real mouse drag preserves editor focus, cursor and expanded Dataview source',async()=>{
        await openCode();const before=editor.getCursor(),top=scroll.scrollTop,r=rail().getBoundingClientRect(),t=rail().querySelector('.prism-rail-thumb').getBoundingClientRect();
        const x=Math.round(t.left+t.width/2),y=Math.round(t.top+t.height/2);
        const input=event=>win.webContents.sendInputEvent(event);
        input({type:'mouseMove',x,y});input({type:'mouseDown',x,y,button:'left',clickCount:1});await wait(80);
        assert(editor.hasFocus()&&!result(),'Pointer down collapsed the code or stole focus');
        input({type:'mouseMove',x,y:Math.round(r.top+r.height*.78)});await wait(100);
        assert(editor.hasFocus()&&!result(),'Dragging collapsed the code or stole focus');
        input({type:'mouseUp',x,y:Math.round(r.top+r.height*.78),button:'left',clickCount:1});await wait(120);
        assert(editor.hasFocus()&&!result(),'Mouse release collapsed the code or stole focus');
        assert(JSON.stringify(editor.getCursor())===JSON.stringify(before),'Drag moved the caret');assert(Math.abs(scroll.scrollTop-top)>200,'Native mouse drag did not scroll');
        report.drag={beforeTop:top,afterTop:scroll.scrollTop,cursor:editor.getCursor(),sourceHeight:scroll.scrollHeight};
      });
      await check('Heading pointer navigation preserves focus; keyboard rail navigation still works',async()=>{
        await openCode();const before=editor.getCursor(),tick=rail().querySelector('.prism-rail-heading[title="Search Path"]'),r=tick.getBoundingClientRect();
        win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),button:'left',clickCount:1});
        win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),button:'left',clickCount:1});await wait(150);
        assert(editor.hasFocus(),'Heading pointer navigation stole editor focus');assert(JSON.stringify(editor.getCursor())===JSON.stringify(before),'Heading navigation moved the caret');
        rail().focus();rail().dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));await wait(100);assert(scroll.scrollTop===0,'Keyboard Home no longer scrolls');
        rail().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));await wait(100);assert(scroll.scrollTop>0,'Keyboard arrow no longer scrolls');
      });
      await check('Original Markdown stays unchanged and the chart remains usable in reading view',async()=>{
        assert(await this.app.vault.read(file)===original,'Scrolling modified the note');
        await leaf.setViewState({type:'markdown',state:{file:file.path,mode:'preview'}});await until(result);
        const slider=view.containerEl.querySelector('[data-slider="0"]');assert(slider,'Reference chart slider missing');slider.value='.25';slider.dispatchEvent(new Event('input',{bubbles:true}));
        assert(result().textContent!=='1.000','Chart interaction no longer updates');
      });
    }catch(e){report.fatal={error:String(e),stack:e.stack};}
    finally{
      window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onError);report.finished=new Date().toISOString();report.pass=!report.fatal&&report.checks.every(c=>c.pass)&&!report.errors.length;save();
      if(path.resolve(remote.app.getPath('userData'))===path.resolve(path.dirname(base),'.test-profile'))setTimeout(()=>remote.app.quit(),500);
    }
  }
};
