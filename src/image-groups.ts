/** Recognize standalone image rows, including multiple images on the same row. */
export function fitImage(width:number,height:number,maxWidth:number,maxHeight:number):{width:number;height:number} {
  const w=width>0?width:640,h=height>0?height:360;
  const scale=Math.min(1,Math.max(1,maxWidth)/w,Math.max(1,maxHeight)/h);
  return {width:w*scale,height:h*scale};
}
export function imageSources(line:string,isWikiImage:(target:string)=>boolean):string[] {
  let rest=line.trim();const sources:string[]=[];
  while(rest){
    const wiki=rest.match(/^!\[\[([^\]]+)\]\]/);
    const markdown=rest.match(/^!\[[^\]]*\]\((?:[^()\\]|\\.|\([^()]*\))*\)/);
    const match=wiki||markdown;if(!match)return [];
    if(wiki&&!isWikiImage(wiki[1].split('|')[0]))return [];
    sources.push(match[0]);rest=rest.slice(match[0].length).trim();
  }
  return sources;
}

export function inlineImageSources(line:string,isWikiImage:(target:string)=>boolean):string[] {
  return [...line.matchAll(/!\[\[[^\]]+\]\]|!\[[^\]]*\]\((?:[^()\\]|\\.|\([^()]*\))*\)/g)]
    .flatMap(match=>imageSources(match[0],isWikiImage));
}
export function imageRuns(lines:string[],isWikiImage:(target:string)=>boolean):{start:number;end:number;sources:string[]}[] {
  const runs:{start:number;end:number;sources:string[]}[]=[];
  for(let i=0;i<lines.length;i++){
    const sources=imageSources(lines[i],isWikiImage);if(!sources.length)continue;
    const start=i;let end=i;
    while(end+1<lines.length){let next=end+1;while(next<lines.length&&!lines[next].trim())next++;if(next>=lines.length)break;const more=imageSources(lines[next],isWikiImage);if(!more.length)break;sources.push(...more);end=next;}
    if(sources.length>=2)runs.push({start,end,sources});i=end;
  }
  return runs;
}
