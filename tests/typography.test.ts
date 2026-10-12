import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeData, DEFAULT_SETTINGS} from '../src/model';
import {NOTE_FONTS, UI_FONTS, NOTE_FONT_SIZE_MIN, NOTE_FONT_SIZE_MAX, adjustNoteFontSize, noteFontFamily, typographyRules} from '../src/typography';

test('existing data keeps its note typography and theme while receiving font defaults',()=>{
  const old=JSON.parse(JSON.stringify({settings:{...DEFAULT_SETTINGS,palette:'sage',fontSize:20,lineHeight:2,mono:false},tasks:[],drafts:{'Keep.md':{content:'unfinished',original:'text',updatedAt:1}}}));
  delete old.settings.uiFont;delete old.settings.uiFontSize;delete old.settings.noteFont;delete old.settings.noteWheelZoom;
  const upgraded=normalizeData(old);
  assert.equal(upgraded.settings.uiFont,'default');assert.equal(upgraded.settings.noteFont,'default');assert.equal(upgraded.settings.uiFontSize,0);
  assert.equal(upgraded.settings.noteWheelZoom,false);
  assert.equal(upgraded.settings.fontSize,20);assert.equal(upgraded.settings.lineHeight,2);assert.equal(upgraded.settings.mono,false);
  assert.equal(upgraded.settings.palette,'sage');assert.deepEqual(upgraded.drafts,old.drafts);
  const css=typographyRules(upgraded.settings);
  assert(!css.includes('--font-interface:'));assert(!css.includes('--font-ui-small:'));assert(!css.includes('--h1-font:'));
  assert.equal(noteFontFamily('default',false),'var(--font-text, "Segoe UI", sans-serif)');
});
test('invalid font preferences recover safely and UI size stays independent from note size',()=>{
  const settings=normalizeData(JSON.parse(JSON.stringify({settings:{...DEFAULT_SETTINGS,uiFont:'__proto__',noteFont:'missing-font',uiFontSize:100,fontSize:18}}))).settings;
  assert.equal(settings.uiFont,'default');assert.equal(settings.noteFont,'default');assert.equal(settings.uiFontSize,20);assert.equal(settings.fontSize,18);
  assert.equal(normalizeData({settings:{...settings,uiFontSize:0}}).settings.uiFontSize,0);
  assert.equal(normalizeData({settings:{...settings,uiFontSize:NaN}}).settings.uiFontSize,0);
});
test('Ctrl+wheel zoom changes only the note size within the same range as the settings slider',()=>{
  assert.equal(adjustNoteFontSize(16,-100),17);
  assert.equal(adjustNoteFontSize(16,100),15);
  assert.equal(adjustNoteFontSize(NOTE_FONT_SIZE_MIN,100),NOTE_FONT_SIZE_MIN);
  assert.equal(adjustNoteFontSize(NOTE_FONT_SIZE_MAX,-100),NOTE_FONT_SIZE_MAX);
  assert.equal(adjustNoteFontSize(16,0),16);
  assert.equal(adjustNoteFontSize(16,NaN),16);
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,noteWheelZoom:true,fontSize:42}}).settings.fontSize,42);
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,noteWheelZoom:true}}).settings.noteWheelZoom,true);
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,noteWheelZoom:'yes' as unknown as boolean}}).settings.noteWheelZoom,false);
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,fontSize:100}}).settings.fontSize,NOTE_FONT_SIZE_MAX);
});
test('chosen fonts take precedence over the legacy mono switch and use local CJK fallbacks',()=>{
  assert.equal(noteFontFamily('wenkai',true),noteFontFamily('wenkai',false));
  for(const [id,font] of Object.entries(NOTE_FONTS)){if(id!=='default')assert(font.family.includes('Prism Noto'));}
  const css=typographyRules({...DEFAULT_SETTINGS,uiFont:'manrope',noteFont:'apple-serif',uiFontSize:18});
  assert(css.includes('--font-interface:"Prism Manrope"'));assert(css.includes('--font-text:"New York"'));
  assert(!css.includes('--font-monospace:'));assert.equal(Object.keys(UI_FONTS).length,7);assert.equal(Object.keys(NOTE_FONTS).length,10);
});
