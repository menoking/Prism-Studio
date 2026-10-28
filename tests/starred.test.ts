import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeData, normalizeStarred, starredPaths, type SkinSettings } from '../src/model';
import { PALETTES, starTone } from '../src/appearance';

const channel=(value:string)=>value.split(' ').map(Number);
const linear=(value:number)=>{const unit=value/255;return unit<=.03928?unit/12.92:Math.pow((unit+.055)/1.055,2.4);};
const luminance=(rgb:number[])=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
const contrast=(a:number[],b:number[])=>{const first=luminance(a),second=luminance(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);};

test('star highlight is readable for every palette in both modes',()=>{
  const light:string[]=[],dark:string[]=[];
  for(const palette of Object.keys(PALETTES) as (keyof typeof PALETTES)[]){
    for(const [mode,tone] of [[false,starTone(palette)],[true,starTone(palette,true)]] as [boolean,string][]){
      assert.match(tone,/^\d{1,3} \d{1,3} \d{1,3}$/);
      for(const value of channel(tone))assert(Number.isInteger(value)&&value>=0&&value<=255,`${palette}: ${tone}`);
      const ratio=contrast(channel(tone),mode?[27,38,54]:[255,255,255]);
      assert(ratio>=4.5,`${palette}/${mode?'dark':'light'} contrast ${ratio.toFixed(2)}`);
      (mode?dark:light).push(tone);
    }
  }
  // Each palette keeps its own hue, so no two palettes collapse onto the same highlight.
  assert.equal(new Set(light).size,Object.keys(PALETTES).length);
  assert.equal(new Set(dark).size,Object.keys(PALETTES).length);
  assert.equal(starTone('blue'),starTone('blue'));
  assert.notEqual(starTone('blue'),starTone('blue',true));
});

test('starred paths survive save and reload, and reject junk',()=>{
  const raw={starred:{'B.md':20,'A.md':10,'':9,'C.md':'x','D.md':-3}};
  assert.deepEqual(normalizeStarred(raw.starred),{'B.md':20,'A.md':10,'C.md':0,'D.md':0});
  assert.deepEqual(normalizeStarred(null),{});
  assert.deepEqual(normalizeStarred([]),{});
  assert.deepEqual(normalizeStarred('A.md'),{});
  const loaded=normalizeData(JSON.parse(JSON.stringify({starred:{'A.md':10,'B.md':20}})));
  assert.deepEqual(loaded.starred,{'A.md':10,'B.md':20});
  assert.deepEqual(normalizeData({starred:{'A.md':1}}).starred,{'A.md':1});
  assert.deepEqual(normalizeData({}).starred,{});
});
test('starred list is newest first with a stable tie-break',()=>{
  assert.deepEqual(starredPaths({'A.md':5,'B.md':9,'C.md':5}),['B.md','A.md','C.md']);
  assert.deepEqual(starredPaths({}),[]);
  assert.deepEqual(starredPaths({'Z.md':0,'Y.md':0}),['Y.md','Z.md']);
});
test('starred highlighting is on by default and can be turned off',()=>{
  const settings=(patch:Partial<SkinSettings>)=>normalizeData({settings:{...DEFAULT_SETTINGS,...patch}}).settings;
  assert.equal(DEFAULT_SETTINGS.starredTint,true);
  assert.equal(DEFAULT_SETTINGS.starredMark,true);
  assert.equal(settings({starredTint:false}).starredTint,false);
  assert.equal(settings({starredMark:false}).starredMark,false);
  assert.equal(settings({starredTint:null as unknown as boolean}).starredTint,true);
});
