import { PALETTES, MATERIALS } from './appearance';
import { UI_FONTS, NOTE_FONTS, NOTE_FONT_SIZE_MIN, NOTE_FONT_SIZE_MAX, type UIFont, type NoteFont } from './typography';

export const LANES = {
  inbox: '收集箱', today: '今天', next: '接下来', anytime: '随时可做',
  someday: '将来也许', waiting: '等待依赖', done: '已完成'
} as const;
export type Lane = keyof typeof LANES;
export type Priority = 'none' | 'low' | 'medium' | 'high';
export const HOME_WIDGETS = {
  summary:'统一复盘', actions:'行动收口', review:'待回写与复核', inbox:'收件箱积压',
  projects:'内容项目', recentEdits:'最近编辑', creation:'开始创作',
  recentNotes:'最近查看', createdNotes:'最近创作动态', tags:'知识标签', rhythm:'系统节奏'
} as const;
export type HomeWidget = keyof typeof HOME_WIDGETS;
export type HomeVisibility = Record<HomeWidget,boolean>;
export function normalizeHomeWidgets(value:unknown):HomeVisibility {
  const source=value && typeof value==='object'?value as Record<string,unknown>:{};
  return Object.fromEntries(Object.keys(HOME_WIDGETS).map(key=>[key,source[key]!==false])) as HomeVisibility;
}
export interface Task {
  id: string; title: string; description: string; lane: Lane; previousLane?: Lane;
  priority: Priority; projectId: string; sprintId: string; due: string; notePath: string;
  createdAt: number; completedAt?: number; inProgress: boolean;
  source?: { path: string; line: number; text: string };
  autoAction?: {kind:'review'|'inbox'|'project';mtime:number};
}
export interface Project { id: string; name: string; color: string }
export interface Sprint { id: string; name: string; start: string; end: string; archived: boolean }
export interface NoteActivity { added: number; revised: number; created: boolean; edits: number }
export interface FileStats { opens: number; edits: number; lastOpened: number; lastEdited: number }
export function emptyFileStats(): FileStats { return { opens: 0, edits: 0, lastOpened: 0, lastEdited: 0 }; }
export interface Activity {
  notes: Record<string, NoteActivity>; tasks: number; seconds: number;
  focusSeconds: number; sessions: number; links: number;
}
export interface SkinSettings {
  enabled: boolean; palette: keyof typeof PALETTES;
  material: keyof typeof MATERIALS;
  intensity: number; opacity: number; blur: number; radius: number;
  fontSize: number; lineHeight: number; noteWidth: number; mono: boolean; noteWheelZoom: boolean;
  uiFont: UIFont; uiFontSize: number; noteFont: NoteFont;
  backgroundPath: string; homeOnStartup: boolean; recordActivity: boolean;
  captureFolder: string; dailyFolder: string;
  nativeGlass: boolean; readingRail: boolean; imageMotion: boolean; imageDecks: boolean;
  imageFit: 'natural'|'cover';
  homeWidgets: HomeVisibility;
}
export interface Data {
  version: 1; settings: SkinSettings; tasks: Task[]; projects: Project[];
  sprints: Sprint[]; activity: Record<string, Activity>;
  drafts: Record<string,{content:string;original:string;updatedAt:number}>;
  fileStats: Record<string, FileStats>;
}
export const DEFAULT_SETTINGS: SkinSettings = {
  enabled: true, palette: 'blue', material: 'glass', intensity: 35, opacity: 42, blur: 20,
  radius: 14, fontSize: 16, lineHeight: 1.8, noteWidth: 820, mono: true, noteWheelZoom: false,
  uiFont:'default', uiFontSize:0, noteFont:'default',
  backgroundPath: '', homeOnStartup: false, recordActivity: true,
  captureFolder: 'Prism/Inbox', dailyFolder: 'Prism/Daily',
  nativeGlass: true, readingRail: true, imageMotion: true, imageDecks: true,
  imageFit: 'natural',
  homeWidgets: normalizeHomeWidgets(undefined)
};
export function localDay(value: Date | number = new Date()): string {
  const date = typeof value === 'number' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export type CreatedNoteRange = 'today'|'week'|'month';
const CREATED_RANGE_DAYS:Record<CreatedNoteRange,number> = { today:0, week:7, month:30 };
export function createdNoteAgeDays(timestamp:number,now=Date.now()):number|null {
  if(!Number.isFinite(timestamp)||timestamp<=0||!Number.isFinite(now))return null;
  const created=new Date(timestamp),current=new Date(now);
  const createdDay=Date.UTC(created.getFullYear(),created.getMonth(),created.getDate());
  const currentDay=Date.UTC(current.getFullYear(),current.getMonth(),current.getDate());
  const days=Math.round((currentDay-createdDay)/86_400_000);
  return days>=0?days:null;
}
export function inCreatedNoteRange(timestamp:number,range:CreatedNoteRange,now=Date.now()):boolean {
  const days=createdNoteAgeDays(timestamp,now);
  if(days===null)return false;
  return range==='today'?days===0:days<=CREATED_RANGE_DAYS[range];
}
export function hasSubstantiveModification(mtime:number,ctime:number,tolerance=1000):boolean {
  return Number.isFinite(mtime)&&Number.isFinite(ctime)&&mtime>0&&ctime>0&&mtime-ctime>tolerance;
}
export function activityLevel(count:number,max:number):number {
  if(!Number.isFinite(count)||count<=0||!Number.isFinite(max)||max<=0)return 0;
  return Math.min(4,Math.max(1,Math.ceil(count/max*4)));
}
export function emptyActivity(): Activity {
  return { notes: {}, tasks: 0, seconds: 0, focusSeconds: 0, sessions: 0, links: 0 };
}
export function isLane(value: unknown): value is Lane { return typeof value === 'string' && value in LANES; }
export function sanitizeFolder(value: string): string {
  return value.trim().replace(/\\/g,'/').split('/').filter(p => p && p!=='.' && p!=='..')
    .map(p => p.replace(/[<>:"|?*\u0000-\u001f]/g,'-')).join('/');
}
export function normalizeData(raw: Partial<Data> | null | undefined): Data {
  const settings = {...DEFAULT_SETTINGS, ...raw?.settings};
  // Upgrade the old default gradient sliders to the corrected glass defaults. Preserve custom values.
  if(raw?.settings && raw.settings.nativeGlass===undefined){
    if(settings.intensity===70)settings.intensity=DEFAULT_SETTINGS.intensity;
    if(settings.opacity===72)settings.opacity=DEFAULT_SETTINGS.opacity;
  }
  // 1.1 reused the legacy aurora/sunset IDs for blue/ice. Preserve their visible choice.
  if(raw?.settings && raw.settings.material===undefined && raw.settings.nativeGlass!==undefined){
    if(settings.palette==='aurora')settings.palette='blue';
    else if(settings.palette==='sunset')settings.palette='ice';
  }
  if (!Object.prototype.hasOwnProperty.call(PALETTES,settings.palette)) settings.palette=DEFAULT_SETTINGS.palette;
  if (!Object.prototype.hasOwnProperty.call(MATERIALS,settings.material)) settings.material=DEFAULT_SETTINGS.material;
  if (!Object.prototype.hasOwnProperty.call(UI_FONTS,settings.uiFont)) settings.uiFont='default';
  if (!Object.prototype.hasOwnProperty.call(NOTE_FONTS,settings.noteFont)) settings.noteFont='default';
  const uiSize=Number(settings.uiFontSize);
  settings.uiFontSize=Number.isFinite(uiSize)?(uiSize===0?0:Math.round(Math.max(12,Math.min(20,uiSize)))):0;
  settings.noteWheelZoom=settings.noteWheelZoom===true;
  for (const [key,min,max] of [['intensity',0,100],['opacity',15,100],['blur',0,40],['radius',0,24],['fontSize',NOTE_FONT_SIZE_MIN,NOTE_FONT_SIZE_MAX],['lineHeight',1.3,2.4],['noteWidth',500,1400]] as const) {
    const value=Number(settings[key]); settings[key]=Number.isFinite(value)?Math.max(min,Math.min(max,value)):DEFAULT_SETTINGS[key];
  }
  settings.captureFolder=sanitizeFolder(settings.captureFolder) || DEFAULT_SETTINGS.captureFolder;
  settings.dailyFolder=sanitizeFolder(settings.dailyFolder) || DEFAULT_SETTINGS.dailyFolder;
  settings.homeWidgets=normalizeHomeWidgets(settings.homeWidgets);
  if(settings.imageFit!=='cover')settings.imageFit='natural';
  const fileStats: Record<string, FileStats> = {};
  if(raw?.fileStats && typeof raw.fileStats==='object'){
    for(const [path,stats] of Object.entries(raw.fileStats)){
      if(!stats || typeof stats!=='object')continue;
      const value=stats as Partial<FileStats>;
      fileStats[path]={
        opens:Math.max(0,Math.floor(Number(value.opens)||0)),
        edits:Math.max(0,Math.floor(Number(value.edits)||0)),
        lastOpened:Math.max(0,Number(value.lastOpened)||0),
        lastEdited:Math.max(0,Number(value.lastEdited)||0)
      };
    }
  }
  return {
    version: 1, settings, tasks: Array.isArray(raw?.tasks) ? raw.tasks.filter(t=>t && typeof t.id==='string' && typeof t.title==='string' && isLane(t.lane)).map(t=>Object.assign({description:'',due:'',projectId:'',sprintId:'',notePath:'',inProgress:false,priority:'none' as Priority,createdAt:Date.now()},t)) : [],
    projects: Array.isArray(raw?.projects)?raw.projects:[], sprints: Array.isArray(raw?.sprints)?raw.sprints:[],
    activity: raw?.activity && typeof raw.activity==='object'?raw.activity:{},
    drafts: raw?.drafts && typeof raw.drafts==='object'?raw.drafts:{},
    fileStats
  };
}
export function isToday(task: Task, today=localDay()): boolean {
  return task.lane!=='done' && (task.lane==='today' || (!!task.due && task.due<=today && task.lane!=='someday' && task.lane!=='waiting'));
}
export function filterTasks(tasks: Task[], lane: Lane, projectId='', query='', sprintId=''): Task[] {
  const needle=query.toLocaleLowerCase();
  return tasks.filter(t=>(lane==='today'?isToday(t):t.lane===lane) && (!projectId || t.projectId===projectId) && (!sprintId || t.sprintId===sprintId) && `${t.title} ${t.description}`.toLocaleLowerCase().includes(needle))
    .sort((a,b)=>({high:0,medium:1,low:2,none:3}[a.priority]-{high:0,medium:1,low:2,none:3}[b.priority]) || (a.due||'9999').localeCompare(b.due||'9999') || a.createdAt-b.createdAt);
}
export function completeTask(task: Task, complete: boolean, time=Date.now()): Task {
  if (complete) return {...task,previousLane:task.lane==='done'?(task.previousLane||'inbox'):task.lane,lane:'done',completedAt:time,inProgress:false};
  const restored={...task,lane:task.previousLane || 'inbox'}; delete restored.completedAt; delete restored.previousLane; return restored;
}
export function words(content: string): string[] {
  return content.match(/[\u3400-\u9fff]|[\p{L}\p{N}_]+/gu) || [];
}
export function wordDelta(before: string, after: string): {added:number;revised:number} {
  const a=words(before),b=words(after); let start=0;
  while(start<a.length && start<b.length && a[start]===b[start]) start++;
  let endA=a.length,endB=b.length;
  while(endA>start && endB>start && a[endA-1]===b[endB-1]){endA--;endB--;}
  const removed=endA-start,inserted=endB-start;
  return {added:Math.max(0,inserted-removed),revised:Math.min(removed,inserted)};
}
export function score(day: Activity): number {
  const notes=Object.values(day.notes);
  return notes.filter(n=>n.created).length*5+day.sessions*2+day.tasks*2+day.links+notes.reduce((s,n)=>s+n.added+n.revised*.5,0)/100;
}
export function metricValue(day: Activity, metric: string): number {
  if(metric==='time') return day.seconds/60;
  if(metric==='focus') return day.focusSeconds/60;
  if(metric==='words') return Object.values(day.notes).reduce((s,n)=>s+n.added+n.revised,0);
  if(metric==='notes') return Object.values(day.notes).filter(n=>n.created).length;
  if(metric==='tasks') return day.tasks;
  return score(day);
}
export function heatmapDays(today=new Date()): string[] {
  const end=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const start=new Date(end);start.setDate(start.getDate()-364-start.getDay());
  const result: string[]=[];const cursor=new Date(start);
  while(cursor<=end){result.push(localDay(cursor));cursor.setDate(cursor.getDate()+1);} return result;
}
export function streaks(activity: Record<string,Activity>,today=new Date()): {current:number;longest:number;active:number} {
  const days=Object.keys(activity).filter(d=>score(activity[d])>0).sort();let longest=0,run=0,prev='';
  for(const day of days){const previous=new Date(`${day}T12:00:00`);previous.setDate(previous.getDate()-1);run=localDay(previous)===prev?run+1:1;longest=Math.max(longest,run);prev=day;}
  let current=0;const cursor=new Date(today);
  if(!days.includes(localDay(cursor)))cursor.setDate(cursor.getDate()-1);
  while(days.includes(localDay(cursor))){current++;cursor.setDate(cursor.getDate()-1);}return {current,longest,active:days.length};
}
export function markdownTaskLines(content: string): {line:number;title:string;done:boolean;due:string;priority:Priority}[] {
  let fence='';let fenceLength=0;
  return content.split(/\r?\n/).flatMap((text,line)=>{
    const marker=text.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){if(!fence){fence=marker[1][0];fenceLength=marker[1].length;}else if(marker[1][0]===fence && marker[1].length>=fenceLength)fence='';return [];}
    if(fence)return [];
    const match=text.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);if(!match)return [];
    const due=match[2].match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1]||'';
    const priority: Priority=match[2].includes('⏫')?'high':match[2].includes('🔼')?'medium':match[2].includes('🔽')?'low':'none';
    return [{line,title:match[2].replace(/📅\s*\d{4}-\d{2}-\d{2}|[⏫🔼🔽]/gu,'').trim(),done:match[1].toLowerCase()==='x',due,priority}];
  });
}

