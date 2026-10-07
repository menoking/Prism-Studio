import type { SkinSettings } from './model';

export const PALETTES = {
  blue: {name:'浅蓝', tint:'190 222 242', secondary:'190 222 242', tertiary:'190 222 242', accent:'79 129 155', darkAccent:'141 192 212', surface:'237 248 255', darkSurface:'27 38 54', gradient:false},
  ice: {name:'冰蓝', tint:'207 228 242', secondary:'207 228 242', tertiary:'207 228 242', accent:'76 119 149', darkAccent:'167 202 224', surface:'242 250 255', darkSurface:'30 41 55', gradient:false},
  aurora: {name:'极光', tint:'187 204 240', secondary:'243 181 200', tertiary:'237 237 168', accent:'112 94 164', darkAccent:'191 174 235', surface:'245 241 255', darkSurface:'37 32 53', gradient:true},
  sunset: {name:'落日', tint:'225 181 218', secondary:'248 184 154', tertiary:'242 218 163', accent:'167 86 111', darkAccent:'235 164 185', surface:'255 241 239', darkSurface:'52 32 40', gradient:true},
  lagoon: {name:'湖泊', tint:'165 219 207', secondary:'173 202 243', tertiary:'206 231 176', accent:'46 123 108', darkAccent:'132 211 189', surface:'235 251 246', darkSurface:'25 43 41', gradient:true},
  violet: {name:'紫雾', tint:'209 192 240', secondary:'209 192 240', tertiary:'209 192 240', accent:'125 91 177', darkAccent:'198 166 236', surface:'247 240 255', darkSurface:'39 31 51', gradient:false},
  mint: {name:'薄荷', tint:'176 228 207', secondary:'176 228 207', tertiary:'176 228 207', accent:'46 127 96', darkAccent:'144 218 184', surface:'239 252 245', darkSurface:'26 43 35', gradient:false},
  sage: {name:'鼠尾草', tint:'177 199 179', secondary:'177 199 179', tertiary:'177 199 179', accent:'79 113 83', darkAccent:'172 199 160', surface:'242 248 238', darkSurface:'33 41 32', gradient:false},
  forest: {name:'松林', tint:'137 187 169', secondary:'137 187 169', tertiary:'137 187 169', accent:'45 103 82', darkAccent:'132 191 162', surface:'233 246 239', darkSurface:'23 38 33', gradient:false},
  teal: {name:'青瓷', tint:'157 217 217', secondary:'157 217 217', tertiary:'157 217 217', accent:'35 122 126', darkAccent:'127 208 213', surface:'235 250 250', darkSurface:'24 41 44', gradient:false},
  ocean: {name:'深海', tint:'154 191 220', secondary:'154 191 220', tertiary:'154 191 220', accent:'43 102 157', darkAccent:'133 183 232', surface:'236 245 253', darkSurface:'26 36 50', gradient:false},
  lavender: {name:'薰衣草', tint:'218 203 235', secondary:'218 203 235', tertiary:'218 203 235', accent:'133 101 164', darkAccent:'211 180 235', surface:'251 244 255', darkSurface:'44 37 51', gradient:false},
  rose: {name:'玫瑰', tint:'239 195 210', secondary:'239 195 210', tertiary:'239 195 210', accent:'167 86 123', darkAccent:'232 159 190', surface:'255 241 247', darkSurface:'49 31 38', gradient:false},
  peach: {name:'蜜桃', tint:'245 207 183', secondary:'245 207 183', tertiary:'245 207 183', accent:'172 106 73', darkAccent:'237 179 141', surface:'255 244 235', darkSurface:'50 38 29', gradient:false},
  amber: {name:'琥珀', tint:'236 215 160', secondary:'236 215 160', tertiary:'236 215 160', accent:'155 116 46', darkAccent:'227 198 119', surface:'255 248 227', darkSurface:'51 43 29', gradient:false},
  sand: {name:'沙丘', tint:'229 216 193', secondary:'229 216 193', tertiary:'229 216 193', accent:'133 110 78', darkAccent:'210 192 160', surface:'250 246 236', darkSurface:'45 40 34', gradient:false},
  pearl: {name:'珍珠', tint:'226 230 237', secondary:'226 230 237', tertiary:'226 230 237', accent:'101 110 128', darkAccent:'179 188 206', surface:'248 249 252', darkSurface:'33 37 42', gradient:false},
  indigo: {name:'暮色', tint:'165 182 223', secondary:'204 187 229', tertiary:'187 210 234', accent:'80 96 154', darkAccent:'165 186 238', surface:'240 244 255', darkSurface:'28 34 51', gradient:true}
} as const;

// Desktop blur is controlled by the OS; these profiles affect the actual UI surfaces.
export const MATERIALS = {
  glass: {name:'玻璃', opacityFloor:0, opacityScale:1, tintScale:1, blurFloor:0, blurScale:1, saturation:1, grain:0, sheen:0, soft:.09, veil:0, frame:.55, edge:.65},
  acrylic: {name:'亚克力', opacityFloor:.64, opacityScale:1.5, tintScale:1.45, blurFloor:18, blurScale:1.2, saturation:1.65, grain:.055, sheen:.10, soft:.19, veil:.08, frame:.36, edge:.32},
  frosted: {name:'毛玻璃', opacityFloor:.78, opacityScale:1.8, tintScale:.35, blurFloor:36, blurScale:1.8, saturation:.65, grain:.12, sheen:0, soft:.34, veil:.42, frame:.2, edge:.2},
  blur: {name:'柔焦模糊', opacityFloor:.18, opacityScale:.65, tintScale:.45, blurFloor:48, blurScale:2.4, saturation:1, grain:0, sheen:0, soft:.05, veil:.015, frame:.16, edge:.15},
  solid: {name:'纯色', opacityFloor:1, opacityScale:1, tintScale:1, blurFloor:0, blurScale:0, saturation:1, grain:0, sheen:0, soft:1, veil:1, frame:1, edge:.2}
} as const;
export const PALETTE_OPTIONS=Object.fromEntries(Object.entries(PALETTES).map(([key,value])=>[key,value.name]));
export const MATERIAL_OPTIONS=Object.fromEntries(Object.entries(MATERIALS).map(([key,value])=>[key,value.name]));

export function appearanceTokens(settings:SkinSettings,dark=false):Record<string,string> {
  const p=PALETTES[settings.palette],m=MATERIALS[settings.material],solid=settings.material==='solid';
  const glass=settings.material==='glass';
  const alpha=settings.intensity/100*m.tintScale*(dark?.35:1);
  const tintRgb=dark&&glass&&settings.palette==='blue'?'25 48 65':p.tint;
  const tintAlpha=dark&&glass&&settings.palette==='blue'?settings.intensity/100:alpha;
  const noise=m.grain ? `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="${m.grain}"/></svg>`)}")` : 'none';
  const gradient=p.gradient
    ? `radial-gradient(ellipse at 58% 38%,rgb(${p.tertiary} / ${alpha*.6}),transparent 45%),radial-gradient(ellipse at 48% 90%,rgb(${p.secondary} / ${alpha*.85}),transparent 65%),radial-gradient(ellipse at 9% 48%,rgb(${p.tint} / ${alpha*.6}),transparent 65%),radial-gradient(ellipse at 94% 18%,rgb(${p.tint} / ${alpha*.85}),transparent 60%)`
    : `linear-gradient(rgb(${tintRgb} / ${tintAlpha}),rgb(${tintRgb} / ${tintAlpha}))`;
  const glassSoft=dark?'44 59 77':settings.palette==='blue'?'218 237 249':p.tint;
  const veilRgb=dark?'18 24 32':'250 252 255';
  return {
    '--prism-blue':p.tint,'--prism-accent-rgb':dark?p.darkAccent:p.accent,
    '--prism-accent':`rgb(${dark?p.darkAccent:p.accent})`,
    '--prism-accent-hover':`color-mix(in srgb,rgb(${dark?p.darkAccent:p.accent}),${dark?'white':'black'} 18%)`,
    '--prism-surface-rgb':dark?p.darkSurface:p.surface,
    '--prism-glass':`rgb(${dark?p.darkSurface:p.surface} / ${solid?1:Math.min(.92,Math.max(m.opacityFloor,settings.opacity/100*m.opacityScale))})`,
    '--prism-soft':`rgb(${glass?glassSoft:dark?p.darkSurface:p.tint} / ${glass&&dark?.12:m.soft})`,
    '--prism-solid':glass&&settings.palette==='blue'?(dark?'#1d2838':'#e8f3fa'):`rgb(${dark?p.darkSurface:p.surface})`,
    '--prism-line':glass&&settings.palette==='blue'?(dark?'rgb(202 221 234 / .15)':'rgb(58 85 103 / .12)'):`rgb(${dark?p.darkAccent:p.accent} / ${dark?.24:.2})`,
    '--prism-backdrop':gradient,'--prism-material-blur':`${Math.max(m.blurFloor,settings.blur*m.blurScale)}px`,
    '--prism-veil':`linear-gradient(rgb(${veilRgb} / ${m.veil}),rgb(${veilRgb} / ${m.veil}))`,
    '--prism-native-finish':glass?'none':`blur(${Math.max(m.blurFloor,settings.blur*m.blurScale)}px) saturate(${m.saturation})`,
    '--prism-floating-frame':`rgb(${p.tint} / ${m.frame})`,
    '--prism-material-border':glass&&settings.palette==='blue'?'rgb(221 244 255 / .65)':`rgb(${dark?p.darkAccent:p.surface} / ${m.edge})`,
    '--prism-saturation':String(m.saturation),'--prism-grain-opacity':String(m.grain),
    '--prism-sheen':String(m.sheen),'--prism-texture':noise
  };
}

export function tokenDeclarations(settings:SkinSettings,dark=false):string {
  return Object.entries(appearanceTokens(settings,dark)).map(([key,value])=>`${key}:${value};`).join('');
}
