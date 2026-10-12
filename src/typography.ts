/** Local font families are deliberately named separately from installed fonts. */
const sansFallback='"Prism Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const serifFallback='"Prism Noto Serif SC", "Songti SC", "SimSun", serif';
const appleSans=`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Prism Inter", ${sansFallback}`;
const appleSerif=`"New York", "New York Medium", "Prism Literata", ${serifFallback}`;

export const UI_FONTS = {
  default: {name:'当前字体（默认）', family:'var(--font-interface, system-ui)', description:'沿用 Obsidian 与当前主题的界面字体。'},
  apple: {name:'系统简约', family:appleSans, description:'苹果系统字体优先；其他系统使用 Inter 搭配思源黑体，简洁清晰。'},
  inter: {name:'Inter · 清晰界面', family:`"Prism Inter", ${sansFallback}`, description:'专为屏幕设计的无衬线字体；中文搭配思源黑体。'},
  'noto-sans': {name:'思源黑体 · Noto Sans SC', family:sansFallback, description:'中文优先，中英文统一的清晰黑体。'},
  manrope: {name:'Manrope · 几何圆润', family:`"Prism Manrope", ${sansFallback}`, description:'圆润的几何无衬线；中文搭配思源黑体。'},
  plex: {name:'IBM Plex Sans · 人文现代', family:`"Prism IBM Plex Sans", ${sansFallback}`, description:'IBM 的现代人文无衬线；中文搭配思源黑体。'},
  wenkai: {name:'霞鹜文楷 · 温润手写', family:`"Prism WenKai", ${sansFallback}`, description:'轻松的楷书笔意，适合偏个人化的界面。'}
} as const;
export const NOTE_FONTS = {
  default: {name:'当前字体（默认）', family:'', description:'保留现有笔记字体与默认等宽字体开关。'},
  apple: {name:'系统简约 · 轻盈阅读', family:appleSans, description:'参考苹果 SF 与苹方的简洁审美；Windows 使用 Inter 与思源黑体。'},
  'apple-serif': {name:'系统书刊 · 雅致阅读', family:appleSerif, description:'参考苹果 New York 的书刊审美；无该字体时使用 Literata 与思源宋体。'},
  inter: {name:'Inter · 清晰阅读', family:`"Prism Inter", ${sansFallback}`, description:'清晰的屏幕无衬线；中文搭配思源黑体。'},
  'noto-sans': {name:'思源黑体 · Noto Sans SC', family:sansFallback, description:'中英文统一的黑体，适合长篇技术笔记。'},
  'noto-serif': {name:'思源宋体 · Noto Serif SC', family:serifFallback, description:'中文优先的宋体，适合文章与书刊阅读。'},
  literata: {name:'Literata · 书刊衬线', family:`"Prism Literata", ${serifFallback}`, description:'为数字阅读设计的衬线字体；中文搭配思源宋体。'},
  wenkai: {name:'霞鹜文楷 · 温润阅读', family:`"Prism WenKai", ${sansFallback}`, description:'保留楷书笔意，适合日记、摘录与随笔。'},
  plex: {name:'IBM Plex Sans · 人文阅读', family:`"Prism IBM Plex Sans", ${sansFallback}`, description:'现代人文无衬线；中文搭配思源黑体。'},
  jetbrains: {name:'JetBrains Mono · 技术等宽', family:`"Prism JetBrains Mono", ${sansFallback}`, description:'拉丁字符等宽，适合技术笔记；中文搭配思源黑体。'}
} as const;
export type UIFont = keyof typeof UI_FONTS;
export type NoteFont = keyof typeof NOTE_FONTS;
export const UI_FONT_OPTIONS=Object.fromEntries(Object.entries(UI_FONTS).map(([key,font])=>[key,font.name]));
export const NOTE_FONT_OPTIONS=Object.fromEntries(Object.entries(NOTE_FONTS).map(([key,font])=>[key,font.name]));
export const FONT_ASSETS = [
  {family:'Prism Inter',file:'Inter.ttf',weight:'100 900'},
  {family:'Prism Manrope',file:'Manrope.ttf',weight:'200 800'},
  {family:'Prism IBM Plex Sans',file:'IBMPlexSans.ttf',weight:'100 700'},
  {family:'Prism Noto Sans SC',file:'NotoSansSC.ttf',weight:'100 900'},
  {family:'Prism Noto Serif SC',file:'NotoSerifSC.ttf',weight:'200 900'},
  {family:'Prism Literata',file:'Literata.ttf',weight:'200 900'},
  {family:'Prism JetBrains Mono',file:'JetBrainsMono.ttf',weight:'100 800'},
  {family:'Prism WenKai',file:'WenKai.ttf',weight:'400'}
] as const;
export function fontFaceRules(resource:(file:string)=>string):string {
  return FONT_ASSETS.map(font=>`@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(resource(font.file))}) format("truetype");font-style:normal;font-weight:${font.weight};font-display:swap;}`).join('\n');
}
export function noteFontFamily(font:NoteFont,mono:boolean):string {
  return font==='default'?(mono?'"Cascadia Code", "SFMono-Regular", "Consolas", monospace':'var(--font-text, "Segoe UI", sans-serif)'):NOTE_FONTS[font].family;
}
export const NOTE_FONT_SIZE_MIN=10;
export const NOTE_FONT_SIZE_MAX=48;
export function adjustNoteFontSize(size:number,deltaY:number):number {
  if(!Number.isFinite(deltaY) || deltaY===0)return size;
  return Math.max(NOTE_FONT_SIZE_MIN,Math.min(NOTE_FONT_SIZE_MAX,size+(deltaY<0?1:-1)));
}
export function uiScale(size:number):number {return size===0?1:size/13;}
export function typographyRules(s:{uiFont:UIFont;uiFontSize:number;noteFont:NoteFont;mono:boolean}):string {
  const ui=UI_FONTS[s.uiFont].family,note=noteFontFamily(s.noteFont,s.mono);
  const scope='body.prism-skin, .prism-view, .prism-floating, .prism-modal';
  let css=`${scope}{--prism-ui-font:${ui};--prism-ui-scale:${uiScale(s.uiFontSize)};--prism-note-font:${note};}`;
  // Never override Obsidian's font-interface with itself; the default remains theme-owned.
  if(s.uiFont!=='default'){
    css+=`${scope}{--font-interface:${ui};--font-family-folder-file-title:${ui};font-family:${ui};}`;
    css+=`.prism-view :is(h1,h2,h3,h4,h5,h6,strong,em),.prism-modal :is(h1,h2,h3,h4,h5,h6,strong,em),.prism-floating-title,body.prism-skin .prism-material-preview-surface strong{font-family:${ui}!important;}`;
    css+=`.prism-floating-edit-bar,.prism-deck-controls,.prism-deck-collapse{font-family:${ui};}`;
  }
  if(s.uiFontSize!==0){
    const scale=uiScale(s.uiFontSize);
    css+=`body.prism-skin{--font-ui-smaller:${12*scale}px;--font-ui-small:${s.uiFontSize}px;--font-ui-medium:${15*scale}px;--font-ui-large:${20*scale}px;--nav-item-size:${s.uiFontSize}px;--font-size-folder-and-file:${s.uiFontSize}px;--font-size-file-header-title:${12*scale}px;--font-size-obsidian-titlebar:${s.uiFontSize}px;--tab-font-size:${s.uiFontSize}px;--status-bar-font-size:${12*scale}px;}`;
  }
  if(s.noteFont!=='default'){
    const roots='body.prism-skin .markdown-preview-view, body.prism-skin .markdown-source-view, .prism-note-preview';
    css+=`${roots}{--font-text:${note};--font-family-strong:${note};--font-family-em:${note};--font-family-list:${note};${[1,2,3,4,5,6].map(i=>`--h${i}-font:${note};`).join('')}}`;
    css+=`body.prism-skin .inline-title{font-family:${note};}.prism-floating-editor{font-family:${note};font-size:var(--prism-note-size);line-height:var(--prism-line-height);}`;
    css+=`body.prism-skin .markdown-rendered :is(code,pre),body.prism-skin .markdown-source-view :is(.cm-inline-code,.HyperMD-codeblock),.prism-note-preview :is(code,pre){--font-family-inline-code:var(--font-monospace);--font-family-strong:var(--font-monospace);--font-family-em:var(--font-monospace);font-family:var(--font-monospace)!important;}`;
  }
  return css;
}
