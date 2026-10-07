import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSources, imageRuns, inlineImageSources, fitImage } from '../src/image-groups';
const image=(target:string)=>/\.(png|jpg|svg)$/i.test(target)||target==='resolved-image';
test('natural card sizing preserves landscape, portrait and long-image ratios without enlarging small images',()=>{
  for(const [width,height] of [[1600,900],[900,1600],[300,2400],[80,60]]){
    const fit=fitImage(width,height,692,412);
    assert(fit.width<=692&&fit.height<=412);assert(fit.width<=width&&fit.height<=height);
    assert(Math.abs(fit.width/fit.height-width/height)<.0001);
  }
  assert.deepEqual(fitImage(80,60,692,412),{width:80,height:60});
});
test('automatic groups accept adjacent Wiki and Markdown images on the same line',()=>{
  assert.deepEqual(imageSources(' ![[a.png|300]]  ![plot](Assets/b(1).png) ![[resolved-image]] ',image),['![[a.png|300]]','![plot](Assets/b(1).png)','![[resolved-image]]']);
  assert.deepEqual(imageSources('![[a.svg]]',image),['![[a.svg]]']);
});
test('automatic grouping leaves captions, links, embedded notes and code rows alone',()=>{
  for(const line of ['caption ![[a.png]]','![[a.png]] caption','![[note]]','![[paper.pdf]]','[![plot](a.png)](link)','`![[a.png]]`',''])assert.deepEqual(imageSources(line,image),[]);
});
test('remote Markdown image paths and titles remain intact',()=>{
  assert.deepEqual(imageSources('![plot](https://host/image.png "Figure 1")',image),['![plot](https://host/image.png "Figure 1")']);
});
test('image runs can start immediately after list text without hiding the list',()=>{
  const lines=['- [ ] First task','- [ ] Second task','![[a.png]]![[b.jpg]]','','Caption','![[c.svg]]'];
  assert.deepEqual(imageRuns(lines,image),[{start:2,end:2,sources:['![[a.png]]','![[b.jpg]]']}]);
  assert.deepEqual(inlineImageSources('- [ ] Text ![[a.png]]',image),['![[a.png]]']);
});
