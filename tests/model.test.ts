import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, HOME_WIDGETS, activityLevel, createdNoteAgeDays, inCreatedNoteRange, hasSubstantiveModification, normalizeHomeWidgets, Task, completeTask, emptyActivity, filterTasks, heatmapDays, isToday, localDay, markdownTaskLines, metricValue, normalizeData, sanitizeFolder, score, streaks, wordDelta } from '../src/model';
const task=(values:Partial<Task>={}):Task=>({id:'one',title:'Read',description:'',lane:'inbox',priority:'none',projectId:'',sprintId:'',due:'',notePath:'',createdAt:1,inProgress:false,...values});
test('image fitting defaults to natural proportions and preserves the saved cover choice',()=>{
  assert.equal(normalizeData(null).settings.imageFit,'natural');
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,imageFit:'cover'}}).settings.imageFit,'cover');
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,imageFit:'invalid' as typeof DEFAULT_SETTINGS.imageFit}}).settings.imageFit,'natural');
});
test('workbench visibility migrates old settings, validates partial data and does not share defaults',()=>{
  const legacy={...DEFAULT_SETTINGS};delete (legacy as Partial<typeof legacy>).homeWidgets;
  const old=normalizeData({settings:legacy});
  assert(Object.values(old.settings.homeWidgets).every(Boolean));
  const partial=normalizeHomeWidgets({rhythm:false,inbox:false,summary:'false',tags:null,unknown:false});
  assert.equal(partial.rhythm,false);assert.equal(partial.inbox,false);assert.equal(partial.summary,true);assert.equal(partial.tags,true);
  assert.equal(Object.keys(partial).length,Object.keys(HOME_WIDGETS).length);
  old.settings.homeWidgets.rhythm=false;
  assert.equal(DEFAULT_SETTINGS.homeWidgets.rhythm,true);assert.equal(normalizeHomeWidgets(null).rhythm,true);
});
test('hidden workbench components survive reload while tasks, appearance and activity remain intact',()=>{
  const hidden=Object.fromEntries(Object.keys(HOME_WIDGETS).map(key=>[key,false]));
  const day=emptyActivity();day.tasks=2;
  const raw={settings:{...DEFAULT_SETTINGS,palette:'sunset',fontSize:20,homeWidgets:hidden},tasks:[task()],activity:{'2026-10-06':day}};
  const restored=normalizeData(JSON.parse(JSON.stringify(raw)));
  assert(Object.values(restored.settings.homeWidgets).every(value=>value===false));
  assert.equal(restored.settings.palette,'sunset');assert.equal(restored.settings.fontSize,20);
  assert.equal(restored.tasks[0].title,'Read');assert.deepEqual(restored.activity,raw.activity);
});
test('uses local calendar dates rather than UTC dates',()=>{
  const date=new Date(2026,9,4,0,5);assert.equal(localDay(date),'2026-10-04');
});
test('created notes use cumulative local calendar ranges',()=>{
  const now=new Date(2026,9,11,12).getTime();
  const at=(days:number,hour=9)=>new Date(2026,9,11-days,hour).getTime();
  assert.equal(createdNoteAgeDays(at(0),now),0);assert.equal(createdNoteAgeDays(at(30),now),30);
  assert.equal(createdNoteAgeDays(at(-1),now),null);assert.equal(createdNoteAgeDays(0,now),null);
  assert.equal(inCreatedNoteRange(at(0),'today',now),true);assert.equal(inCreatedNoteRange(at(1),'today',now),false);
  assert.equal(inCreatedNoteRange(at(0),'week',now),true);assert.equal(inCreatedNoteRange(at(7),'week',now),true);assert.equal(inCreatedNoteRange(at(8),'week',now),false);
  assert.equal(inCreatedNoteRange(at(0),'month',now),true);assert.equal(inCreatedNoteRange(at(7),'month',now),true);assert.equal(inCreatedNoteRange(at(30),'month',now),true);assert.equal(inCreatedNoteRange(at(31),'month',now),false);
});
test('modification detection separates edited files from newly created files',()=>{
  assert.equal(hasSubstantiveModification(10_000,1_000),true);
  assert.equal(hasSubstantiveModification(10_000,9_500),false);
  assert.equal(hasSubstantiveModification(10_000,0),false);assert.equal(hasSubstantiveModification(Number.NaN,1_000),false);
});
test('file stats migrate safely and sanitize malformed values',()=>{
  assert.deepEqual(normalizeData(null).fileStats,{});
  const data=normalizeData({fileStats:{'a.md':{opens:3.9,edits:2,lastOpened:100,lastEdited:50},'b.md':{opens:-2,edits:Number.NaN,lastOpened:-5,lastEdited:0} as never,'c.md':null as never}});
  assert.deepEqual(data.fileStats['a.md'],{opens:3,edits:2,lastOpened:100,lastEdited:50});
  assert.deepEqual(data.fileStats['b.md'],{opens:0,edits:0,lastOpened:0,lastEdited:0});assert.equal(data.fileStats['c.md'],undefined);
});
test('activity level scales intensity and guards invalid input',()=>{
  assert.equal(activityLevel(0,10),0);assert.equal(activityLevel(1,10),1);
  assert.equal(activityLevel(5,10),2);assert.equal(activityLevel(8,10),4);assert.equal(activityLevel(100,10),4);
  assert.equal(activityLevel(3,0),0);assert.equal(activityLevel(Number.NaN,10),0);
});
test('today includes overdue actionable tasks and excludes deferred and completed tasks',()=>{
  assert.equal(isToday(task({due:'2026-10-02'}),'2026-10-04'),true);
  for(const lane of ['someday','waiting','done'] as const)assert.equal(isToday(task({lane,due:'2026-10-02'}),'2026-10-04'),false);
  assert.equal(isToday(task({due:'2026-10-05'}),'2026-10-04'),false);
});
test('filtering composes lane, project, sprint, search and priority',()=>{
  const rows=[task({id:'a',lane:'next',projectId:'p',sprintId:'s',title:'Read paper'}),task({id:'b',lane:'next',projectId:'p',sprintId:'s',title:'Read code',priority:'high'}),task({id:'c',lane:'next',projectId:'q',sprintId:'s',title:'Read'})];
  assert.deepEqual(filterTasks(rows,'next','p','READ','s').map(t=>t.id),['b','a']);
});
test('completion preserves prior lane and reopening removes completion date',()=>{
  const completed=completeTask(task({lane:'next',inProgress:true}),true,123);
  assert.equal(completed.completedAt,123);assert.equal(completed.inProgress,false);
  const reopened=completeTask(completed,false);assert.equal(reopened.lane,'next');assert.equal(reopened.completedAt,undefined);
});
test('word delta distinguishes append, rewrite, deletion and unchanged content',()=>{
  assert.deepEqual(wordDelta('你好 world','你好 world today'),{added:1,revised:0});
  assert.deepEqual(wordDelta('Read old paper','Read new paper'),{added:0,revised:1});
  assert.deepEqual(wordDelta('你好世界','你好'),{added:0,revised:0});
  assert.deepEqual(wordDelta('Read paper','Read paper'),{added:0,revised:0});
  assert.deepEqual(wordDelta('','你好 Obsidian'),{added:3,revised:0});
});
test('contribution formula is directly explainable by day detail',()=>{
  const day=emptyActivity();day.notes.a={created:true,added:100,revised:20,edits:1};day.tasks=2;day.sessions=1;day.links=1;
  assert.equal(score(day),13.1);assert.equal(metricValue(day,'words'),120);
});
test('heatmap is chronological, starts Sunday and includes today without future dates',()=>{
  const today=new Date(2026,9,4);const days=heatmapDays(today);
  assert.equal(new Date(`${days[0]}T12:00:00`).getDay(),0);assert.equal(days[days.length-1],'2026-10-04');
  assert.equal(new Set(days).size,days.length);assert.ok(days.length>=365 && days.length<=371);
});
test('streak tolerates an unfinished current day and observes gaps',()=>{
  const day=emptyActivity();day.tasks=1;
  assert.deepEqual(streaks({'2026-10-01':day,'2026-10-02':day,'2026-10-03':day},new Date(2026,9,4)),{current:3,longest:3,active:3});
  assert.equal(streaks({'2026-10-01':day,'2026-10-03':day},new Date(2026,9,4)).longest,1);
});
test('Markdown import preserves original line positions and understands due dates',()=>{
  const rows=markdownTaskLines('# Tasks\n\n- [ ] Read paper 📅 2026-10-04 ⏫\n  - [x] Write notes\nNot a task');
  assert.deepEqual(rows,[{line:2,title:'Read paper',done:false,due:'2026-10-04',priority:'high'},{line:3,title:'Write notes',done:true,due:'',priority:'none'}]);
});
test('Markdown import ignores checkbox examples inside fenced code blocks',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  const rows=markdownTaskLines(`${fence}md\n- [ ] Example only\n${fence}\n- [ ] Real task`);
  assert.equal(rows.length,1);assert.equal(rows[0].title,'Real task');assert.equal(rows[0].line,3);
});
test('settings normalize bounds and paths without traversal',()=>{
  assert.equal(sanitizeFolder('../../Prism/../Inbox'),'Prism/Inbox');
  const data=normalizeData({settings:{...DEFAULT_SETTINGS,fontSize:999,blur:NaN,captureFolder:'../../Inbox'}});
  assert.equal(data.settings.fontSize,48);assert.equal(data.settings.blur,20);assert.equal(data.settings.captureFolder,'Inbox');
  assert.equal(normalizeData(null).tasks.length,0);
});
test('upgrades legacy glass defaults while preserving customized sliders and task data',()=>{
  const settings={...DEFAULT_SETTINGS,intensity:70,opacity:72};delete (settings as Partial<typeof settings>).nativeGlass;
  const legacy=normalizeData({settings});assert.equal(legacy.settings.intensity,35);assert.equal(legacy.settings.opacity,42);assert.equal(legacy.settings.nativeGlass,true);assert.equal(legacy.settings.imageDecks,true);
  const custom=normalizeData({settings:{...settings,intensity:55,opacity:60}});assert.equal(custom.settings.intensity,55);assert.equal(custom.settings.opacity,60);
});
