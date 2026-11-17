export type GlassPreset='default'|'readable'|'crystal'|'performance';
export type MotionPreset='normal'|'performance'|'spring'|'bouncy';
export interface GlassSettings {
 preset:GlassPreset;blur:number;refractionHeight:number;refractionAmount:number;tint:number;vibrancy:number;brightness:number;gloss:number;radius:number;depth:boolean;chromatic:boolean;
 motionPreset:MotionPreset;bounce:number;speed:number;compression:number;haptics:boolean;pullStretch:number;longPressInflation:number;
}
export const DEFAULT_GLASS_SETTINGS:GlassSettings={preset:'default',blur:22,refractionHeight:18,refractionAmount:35,tint:18,vibrancy:72,brightness:108,gloss:58,radius:28,depth:true,chromatic:false,motionPreset:'normal',bounce:35,speed:55,compression:35,haptics:false,pullStretch:30,longPressInflation:24};
export const GLASS_SETTINGS_KEY='openfamily.glass-settings.v1';
const clamp=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
export function normalizeGlassSettings(value:unknown):GlassSettings{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const d=DEFAULT_GLASS_SETTINGS;
 const choices=(v:string[],x:unknown,f:string)=>typeof x==='string'&&v.includes(x)?x:f;
 return {
  preset:choices(['default','readable','crystal','performance'],v.preset,d.preset) as GlassPreset,
  blur:clamp(v.blur,0,40,d.blur),refractionHeight:clamp(v.refractionHeight,0,40,d.refractionHeight),refractionAmount:clamp(v.refractionAmount,0,100,d.refractionAmount),
  tint:clamp(v.tint,0,50,d.tint),vibrancy:clamp(v.vibrancy,0,100,d.vibrancy),brightness:clamp(v.brightness,70,130,d.brightness),gloss:clamp(v.gloss,0,100,d.gloss),radius:clamp(v.radius,12,36,d.radius),
  depth:typeof v.depth==='boolean'?v.depth:d.depth,chromatic:typeof v.chromatic==='boolean'?v.chromatic:d.chromatic,
  motionPreset:choices(['normal','performance','spring','bouncy'],v.motionPreset,d.motionPreset) as MotionPreset,
  bounce:clamp(v.bounce,0,100,d.bounce),speed:clamp(v.speed,20,100,d.speed),compression:clamp(v.compression,0,100,d.compression),haptics:typeof v.haptics==='boolean'?v.haptics:d.haptics,
  pullStretch:clamp(v.pullStretch,0,100,d.pullStretch),longPressInflation:clamp(v.longPressInflation,0,100,d.longPressInflation)
 };
}
export function readGlassSettings():GlassSettings{
 try{const raw=localStorage.getItem(GLASS_SETTINGS_KEY);return raw?normalizeGlassSettings(JSON.parse(raw)):DEFAULT_GLASS_SETTINGS;}
 catch{return DEFAULT_GLASS_SETTINGS;}
}
export function applyGlassSettings(settings:GlassSettings){
 const root=document.documentElement;const s=normalizeGlassSettings(settings);
 root.classList.toggle('glass-theme',s.blur>0||s.tint>0||s.gloss>0||s.depth);
 const vars:Record<string,string>={
  '--glass-blur':s.blur+'px','--glass-refraction-height':s.refractionHeight+'px','--glass-refraction':String(s.refractionAmount/100),
  '--glass-tint':String(s.tint/100),'--glass-vibrancy':String(s.vibrancy/100),'--glass-brightness':String(s.brightness/100),
  '--glass-gloss':String(s.gloss/100),'--glass-radius':s.radius+'px','--glass-shadow':s.depth?'1':'0',
  '--glass-chromatic':s.chromatic?'1':'0','--glass-speed':(2200/s.speed)+'ms','--glass-bounce':String(s.bounce/100),
  '--glass-compression':String(s.compression/100),'--glass-pull':String(s.pullStretch/100),'--glass-inflate':String(s.longPressInflation/100)
 };
 for(const [key,value] of Object.entries(vars))root.style.setProperty(key,value);
 root.dataset.glassPreset=s.preset;root.dataset.motionPreset=s.motionPreset;
}
export function saveGlassSettings(settings:GlassSettings){
 const safe=normalizeGlassSettings(settings);
 try{localStorage.setItem(GLASS_SETTINGS_KEY,JSON.stringify(safe));}catch{/* Storage may be unavailable; in-memory preview still works. */}
 applyGlassSettings(safe);return safe;
}
export function presetGlassSettings(preset:GlassPreset,current:GlassSettings):GlassSettings{
 const presets:Record<GlassPreset,Partial<GlassSettings>>={
  default:{blur:22,refractionHeight:18,refractionAmount:35,tint:18,vibrancy:72,brightness:108,gloss:58,radius:28,depth:true,chromatic:false},
  readable:{blur:8,refractionHeight:8,refractionAmount:10,tint:30,vibrancy:45,brightness:112,gloss:20,radius:22,depth:false,chromatic:false},
  crystal:{blur:30,refractionHeight:30,refractionAmount:75,tint:12,vibrancy:92,brightness:116,gloss:88,radius:32,depth:true,chromatic:true},
  performance:{blur:4,refractionHeight:0,refractionAmount:0,tint:10,vibrancy:45,brightness:105,gloss:12,radius:20,depth:false,chromatic:false,motionPreset:'performance',speed:85,bounce:10}
 };
 return normalizeGlassSettings({...current,...presets[preset],preset});
}
export function presetMotionSettings(preset:MotionPreset,current:GlassSettings):GlassSettings{
 const presets:Record<MotionPreset,Partial<GlassSettings>>={
  normal:{bounce:28,speed:55,compression:30,pullStretch:25,longPressInflation:18},
  performance:{bounce:8,speed:90,compression:12,pullStretch:8,longPressInflation:8},
  spring:{bounce:62,speed:48,compression:48,pullStretch:60,longPressInflation:42},
  bouncy:{bounce:92,speed:40,compression:70,pullStretch:88,longPressInflation:75}
 };
 return normalizeGlassSettings({...current,...presets[preset],motionPreset:preset});
}
