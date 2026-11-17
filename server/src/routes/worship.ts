import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';
const router = Router();
router.use(authMiddleware);
const PRAYER_KEYS = ['fajr','dhuhr','asr','maghrib','isha'] as const;
type PrayerKey = typeof PRAYER_KEYS[number];
const emptyPrayers = (): Record<PrayerKey, boolean> => ({fajr:false,dhuhr:false,asr:false,maghrib:false,isha:false});
const validDate = (v: unknown): v is string => {
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
 const d=new Date(`${v}T00:00:00.000Z`); return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
const normalizePrayers = (v: unknown): Record<PrayerKey,boolean> => {
 const s=v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
 return Object.fromEntries(PRAYER_KEYS.map(k=>[k,s[k]===true])) as Record<PrayerKey,boolean>;
};
router.get('/',async(req:AuthRequest,res)=>{
 try{
  const date=req.query.date;if(!validDate(date))return res.status(400).json({success:false,error:'Invalid date'});
  const r=await query('SELECT * FROM worship_daily_logs WHERE user_id=$1 AND log_date=$2',[req.userId,date]);
  const row=r.rows[0]||null;
  res.json({success:true,data:row?{...row,prayers:normalizePrayers(row.prayers)}:{log_date:date,prayers:emptyPrayers(),quran_pages:0,morning_adhkar:false,evening_adhkar:false,duha:false,fasting:false,notes:''}});
 }catch(e){console.error('Get worship log error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});
router.put('/:date',async(req:AuthRequest,res)=>{
 try{
  const {date}=req.params;if(!validDate(date))return res.status(400).json({success:false,error:'Invalid date'});
  const prayers=normalizePrayers(req.body?.prayers);
  const raw=typeof req.body?.quran_pages==='number'?req.body.quran_pages:Number(req.body?.quran_pages);
  const pages=Number.isInteger(raw)&&raw>=0&&raw<=1000?raw:0;
  const morning=req.body?.morning_adhkar===true,evening=req.body?.evening_adhkar===true,duha=req.body?.duha===true,fasting=req.body?.fasting===true;
  const notes=typeof req.body?.notes==='string'?req.body.notes.trim().slice(0,2000):'';
  const r=await query(`INSERT INTO worship_daily_logs(user_id,log_date,prayers,quran_pages,morning_adhkar,evening_adhkar,duha,fasting,notes)
   VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(user_id,log_date) DO UPDATE SET prayers=EXCLUDED.prayers,quran_pages=EXCLUDED.quran_pages,morning_adhkar=EXCLUDED.morning_adhkar,evening_adhkar=EXCLUDED.evening_adhkar,duha=EXCLUDED.duha,fasting=EXCLUDED.fasting,notes=EXCLUDED.notes,updated_at=now() RETURNING *`,
   [req.userId,date,JSON.stringify(prayers),pages,morning,evening,duha,fasting,notes]);
  broadcast(req.userId!,{type:'update',entity:'worship',action:'saved'});
  res.json({success:true,data:{...r.rows[0],prayers}});
 }catch(e){console.error('Save worship log error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});
export default router;