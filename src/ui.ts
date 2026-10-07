import { setIcon } from 'obsidian';
export function icon(parent:HTMLElement,name:string,cls='prism-icon'):HTMLElement {const el=parent.createSpan({cls});setIcon(el,name);return el;}
export function button(parent:HTMLElement,label:string,name:string,action:()=>void,cls=''):HTMLButtonElement {
  const el=parent.createEl('button',{cls:`prism-button ${cls}`,attr:{type:'button','aria-label':label}});
  if(name)icon(el,name);el.createSpan({text:label});el.addEventListener('click',action);return el;
}
export function heading(parent:HTMLElement,title:string,subtitle?:string):void{parent.createEl('h2',{text:title});if(subtitle)parent.createEl('p',{text:subtitle,cls:'prism-muted'});}
export function empty(parent:HTMLElement,message:string,name='inbox'):void{const el=parent.createDiv({cls:'prism-empty'});icon(el,name);el.createEl('p',{text:message});}
export function stat(parent:HTMLElement,label:string,value:string,description:string,action?:()=>void):void{
  const el=parent.createEl(action?'button':'div',{cls:'prism-stat'});
  el.createSpan({text:label,cls:'prism-muted'});el.createEl('strong',{text:value});el.createEl('small',{text:description});
  if(action)el.addEventListener('click',action);
}
export function formatDate(date=new Date()):string{return date.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'});}
export function catchAction(action:()=>Promise<unknown>):void{void action().catch(error=>console.error('Prism action failed',error));}
