import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeData, normalizeTagName, normalizeTags, orderTags, pathsWithTag, renameTagIn, tagCounts, type Data, type SkinSettings } from '../src/model';
import { PALETTES, tagHue, tagPillColors, tagTone } from '../src/appearance';

const linear=(value:number)=>{const unit=value/255;return unit<=.03928?unit/12.92:Math.pow((unit+.055)/1.055,2.4);};
const luminance=(rgb:number[])=>.2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
const contrast=(a:number[],b:number[])=>{const first=luminance(a),second=luminance(b);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);};

const SAMPLES=['机器学习','论文精读','project-vla','读书笔记','Bayesian Optimization','实验记录','待复核'];

test('tag pills stay readable for every palette in both modes',()=>{
  for(const palette of Object.keys(PALETTES) as (keyof typeof PALETTES)[]){
    for(const dark of [false,true]){
      for(const name of SAMPLES){
        const {text,background,border}=tagPillColors(name,palette,dark);
        const ratio=contrast(text,background);
        assert(ratio>=4.5,`${name} on ${palette}/${dark?'dark':'light'} is ${ratio.toFixed(2)}:1`);
        // Text must also separate from the solid border, which is the pill's edge on glass.
        assert(contrast(text,border)>=1.6,`${name} text merges into its border on ${palette}`);
        for(const channel of [...text,...background,...border])assert(Number.isInteger(channel)&&channel>=0&&channel<=255,`bad channel ${channel}`);
      }
    }
  }
});

test('a tag keeps one hue across notes and palettes stay distinguishable',()=>{
  assert.equal(tagHue('机器学习'),tagHue('机器学习'));
  assert.equal(tagHue('  机器学习 '),tagHue('机器学习'));
  assert.equal(tagHue('Machine Learning'),tagHue('machine learning'));
  assert.notEqual(tagHue('机器学习'),tagHue('实验记录'));
  const tones=SAMPLES.map(name=>tagTone(name,'blue'));
  assert.equal(new Set(tones.map(tone=>tone.hue)).size,SAMPLES.length);
  // The palette only nudges the hue; the same tag still reads as the same colour family.
  const blue=tagTone('机器学习','blue').hue,forest=tagTone('机器学习','forest').hue;
  const distance=Math.min(Math.abs(blue-forest),360-Math.abs(blue-forest));
  assert(distance<40,`palette shifted the tag hue by ${distance.toFixed(1)}°`);
  assert.notEqual(blue,forest,'palette should tint the tag slightly');
});

test('tags are normalised on save and reload',()=>{
  assert.equal(normalizeTagName('#论文'),'论文');
  assert.equal(normalizeTagName('  深度   学习 '),'深度 学习');
  assert.equal(normalizeTagName(''),'');
  assert.equal(normalizeTagName(null),'');
  assert.equal(normalizeTagName('  '),'');
  assert.deepEqual(normalizeTags({'A.md':['#甲','甲','乙',null,''],'B.md':[]}),{'A.md':['甲','乙']});
  assert.deepEqual(normalizeTags({'A.md':'丙'}),{'A.md':['丙']});
  assert.deepEqual(normalizeTags(null),{});
  assert.deepEqual(normalizeTags([]),{});
  assert.deepEqual(normalizeData({tags:{'A.md':['甲','甲'],'B.md':'#乙'}} as unknown as Partial<Data>).tags,{'A.md':['甲'],'B.md':['乙']});
  assert.deepEqual(normalizeData({}).tags,{});
});

test('tag registry and lookups are stable',()=>{
  const tags={'A.md':['甲','乙'],'B.md':['乙','甲'],'C.md':['丙','乙']};
  assert.deepEqual(tagCounts(tags),[{name:'乙',count:3},{name:'甲',count:2},{name:'丙',count:1}]);
  assert.deepEqual(pathsWithTag(tags,'乙'),['A.md','B.md','C.md']);
  assert.deepEqual(pathsWithTag(tags,'#乙'),['A.md','B.md','C.md']);
  assert.deepEqual(pathsWithTag(tags,'不存在'),[]);
  assert.deepEqual(tagCounts({}),[]);
});

test('note tags are on by default and can be turned off',()=>{  const settings=(patch:Partial<SkinSettings>)=>normalizeData({settings:{...DEFAULT_SETTINGS,...patch}}).settings;
  assert.equal(DEFAULT_SETTINGS.noteTags,true);
  assert.equal(DEFAULT_SETTINGS.tagHover,true);
  assert.equal(settings({noteTags:false}).noteTags,false);
  assert.equal(settings({tagHover:false}).tagHover,false);
  assert.equal(settings({noteTags:null as unknown as boolean}).noteTags,true);
});

test('renaming a tag updates every note and collapses duplicates in place',()=>{
  const tags={'A.md':['甲','乙'],'B.md':['甲'],'C.md':['丙']};
  const first=renameTagIn(tags,'甲','甲子');
  assert.equal(first.notes,2);
  assert.deepEqual(first.tags,{'A.md':['甲子','乙'],'B.md':['甲子'],'C.md':['丙']});
  // 甲子 -> 乙 on A.md: the two become one, keeping the position of the renamed pill.
  const merge=renameTagIn(first.tags,'甲子','乙');
  assert.equal(merge.notes,2);
  assert.deepEqual(merge.tags,{'A.md':['乙'],'B.md':['乙'],'C.md':['丙']});
  // Normalisation runs on both ends and a no-op rename leaves the store untouched.
  assert.deepEqual(renameTagIn(tags,'#甲','甲').tags,tags);
  assert.equal(renameTagIn(tags,'甲','甲').notes,0);
  assert.equal(renameTagIn(tags,'不存在','新名').notes,0);
  assert.deepEqual(renameTagIn(tags,'甲','  甲子  ').tags['A.md'],['甲子','乙']);
  assert.deepEqual(renameTagIn(tags,'甲','').tags,tags);
});

test('a drag order is only accepted when it is a permutation',()=>{
  const list=['甲','乙','丙'];
  assert.deepEqual(orderTags(list,['丙','甲','乙']),['丙','甲','乙']);
  assert.deepEqual(orderTags(list,['乙','丙','甲']),['乙','丙','甲']);
  // Anything that drops, duplicates or invents a tag keeps the stored order.
  assert.deepEqual(orderTags(list,['甲','乙']),list);
  assert.deepEqual(orderTags(list,['甲','乙','丙','丁']),list);
  assert.deepEqual(orderTags(list,['甲','甲','乙']),list);
  assert.deepEqual(orderTags(list,['甲','乙','丁']),list);
  assert.equal(orderTags(list,['甲','乙','丙']),list,'an unchanged order must not rewrite');
  assert.deepEqual(orderTags([],[]),[]);
});
