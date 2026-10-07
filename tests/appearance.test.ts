import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, normalizeData, type SkinSettings } from '../src/model';
import { PALETTES, MATERIALS, appearanceTokens } from '../src/appearance';

test('palette migrations preserve 1.1 blue/ice and 1.0 legacy gradients',()=>{
  const old={...DEFAULT_SETTINGS,palette:'aurora' as const};delete (old as Partial<SkinSettings>).material;
  assert.equal(normalizeData({settings:old}).settings.palette,'blue');
  assert.equal(normalizeData({settings:{...old,palette:'sunset'}}).settings.palette,'ice');
  delete (old as Partial<SkinSettings>).nativeGlass;
  assert.equal(normalizeData({settings:old}).settings.palette,'aurora');
  assert.equal(normalizeData({settings:{...old,palette:'sunset'}}).settings.palette,'sunset');
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,palette:'aurora'}}).settings.palette,'aurora');
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,material:'unknown' as SkinSettings['material']}}).settings.material,'glass');
});
test('existing colors and material profiles are unchanged from the approved release',()=>{
  const baseline=JSON.parse(readFileSync('tests/fixtures/palette-baseline-1.2.1.json','utf8'));
  const withoutName=({name,...rest}:Record<string,unknown>)=>rest;
  for(const [key,value] of Object.entries(baseline.palettes))assert.deepEqual(withoutName(PALETTES[key as SkinSettings['palette']]),withoutName(value as Record<string,unknown>));
  for(const [key,value] of Object.entries(baseline.materials))assert.deepEqual(withoutName(MATERIALS[key as SkinSettings['material']]),withoutName(value as Record<string,unknown>));
  for(const sample of baseline.tokens)assert.deepEqual(appearanceTokens({...DEFAULT_SETTINGS,palette:sample.palette,material:sample.material},sample.dark),sample.tokens);
});
test('all library choices survive save/reload and have formal labels',()=>{
  for(const [palette,profile] of Object.entries(PALETTES)){
    const settings={...DEFAULT_SETTINGS,palette:palette as SkinSettings['palette'],fontSize:20,blur:18,opacity:27};
    const loaded=normalizeData(JSON.parse(JSON.stringify({settings})));
    assert.equal(loaded.settings.palette,palette);assert.equal(loaded.settings.opacity,27);assert.equal(loaded.settings.fontSize,20);
    assert(!/视频|原版|\d\.\d/.test(profile.name));
  }
  for(const profile of Object.values(MATERIALS))assert(!/视频|原版|\d\.\d/.test(profile.name));
  assert.equal(normalizeData({settings:{...DEFAULT_SETTINGS,palette:'__proto__' as SkinSettings['palette']}}).settings.palette,DEFAULT_SETTINGS.palette);
});
test('every palette supports translucent materials and its own light/dark accent',()=>{
  for(const palette of Object.keys(PALETTES) as SkinSettings['palette'][]){
    for(const material of Object.keys(MATERIALS) as SkinSettings['material'][]){
      const settings={...DEFAULT_SETTINGS,palette,material};
      for(const dark of [false,true]){
        const tokens=appearanceTokens(settings,dark);
        assert.equal(tokens['--prism-accent-rgb'],dark?PALETTES[palette].darkAccent:PALETTES[palette].accent);
        const alpha=Number(tokens['--prism-glass'].match(/\/ ([\d.]+)\)/)?.[1]);
        assert.equal(material==='solid'?alpha===1:alpha>0&&alpha<1,true);
        assert(!JSON.stringify(tokens).includes('undefined'));
      }
    }
  }
  assert(appearanceTokens({...DEFAULT_SETTINGS,palette:'aurora'})['--prism-backdrop'].includes('243 181 200'));
  assert(!appearanceTokens(DEFAULT_SETTINGS)['--prism-backdrop'].includes('radial-gradient'));
});
test('glass restores 1.1 surface and blur, while matte presets retain their identity at low sliders',()=>{
  const styles=Object.keys(MATERIALS).map(material=>appearanceTokens({...DEFAULT_SETTINGS,material:material as SkinSettings['material']}));
  assert.equal(new Set(styles.map(t=>JSON.stringify(t))).size,5);
  assert.equal(styles[0]['--prism-texture'],'none');assert(styles[1]['--prism-texture'].includes('feTurbulence'));
  assert.equal(styles[4]['--prism-material-blur'],'0px');
  assert(Number.parseFloat(styles[2]['--prism-material-blur'])>Number.parseFloat(styles[0]['--prism-material-blur']));
  const glass=appearanceTokens(DEFAULT_SETTINGS);
  assert.equal(glass['--prism-glass'],'rgb(237 248 255 / 0.42)');
  assert.equal(glass['--prism-material-blur'],'20px');assert.equal(glass['--prism-sheen'],'0');
  assert.equal(glass['--prism-native-finish'],'none');assert.equal(glass['--prism-soft'],'rgb(218 237 249 / 0.09)');
  assert.equal(glass['--prism-floating-frame'],'rgb(190 222 242 / 0.55)');
  assert.equal(appearanceTokens({...DEFAULT_SETTINGS,blur:0})['--prism-material-blur'],'0px');
  const low={...DEFAULT_SETTINGS,blur:0,opacity:15};
  const acrylic=appearanceTokens({...low,material:'acrylic'}),frosted=appearanceTokens({...low,material:'frosted'});
  assert.equal(acrylic['--prism-material-blur'],'18px');assert.equal(frosted['--prism-material-blur'],'36px');
  assert(acrylic['--prism-glass'].endsWith('/ 0.64)'));assert(frosted['--prism-glass'].endsWith('/ 0.78)'));
  assert.notEqual(acrylic['--prism-veil'],frosted['--prism-veil']);
});
