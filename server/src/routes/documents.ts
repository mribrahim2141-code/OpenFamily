import { Router } from 'express';
import express from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent, isParentAccount } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);
const uploadParser = express.json({ limit: '8mb' });
const allowed = new Set(['national_id','passport','residence_permit','birth_certificate','medical_insurance','driving_license','other']);
const clean = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const dateOnly = (v: unknown) => typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v) ? v : null;
const metadata = (r: any) => ({ id:r.id, member_id:r.member_id, doc_type:r.doc_type, title:r.title, issuer:r.issuer, document_number:r.document_number, issue_date:r.issue_date, expiry_date:r.expiry_date, notes:r.notes, file_name:r.file_name, mime_type:r.mime_type, file_size:r.file_size, created_at:r.created_at });
function decodeFile(value: unknown, mime: unknown) {
 if (typeof value !== 'string' || value.length > 6990508 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
 const buffer = Buffer.from(value, 'base64'); if (!buffer.length || buffer.length > 5242880) return null;
 let actual = '';
 if (buffer.subarray(0,5).toString() === '%PDF-') actual='application/pdf';
 else if (buffer[0]===0xff && buffer[1]===0xd8 && buffer[2]===0xff) actual='image/jpeg';
 else if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) actual='image/png';
 else if (buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP') actual='image/webp';
 return actual && actual===mime ? {buffer, actual} : null;
}
router.get('/', async (req: AuthRequest,res) => {
 try {
  const parent=await isParentAccount(req.actualUserId);
  const linked=parent?null:await query('SELECT id FROM family_members WHERE user_id=$1 AND linked_user_id=$2',[req.userId,req.actualUserId]);
  if(!parent&&!linked?.rows[0]) return res.json({success:true,data:[]});
  const result=parent
   ? await query('SELECT * FROM official_documents WHERE user_id=$1 ORDER BY expiry_date NULLS LAST,created_at DESC',[req.userId])
   : await query('SELECT * FROM official_documents WHERE user_id=$1 AND member_id=$2 ORDER BY expiry_date NULLS LAST,created_at DESC',[req.userId,linked!.rows[0].id]);
  res.json({success:true,data:result.rows.map(metadata)});
 } catch(e){ console.error('Documents list error:',e); res.status(500).json({success:false,error:'Internal server error'}); }
});
router.post('/', requireParent, uploadParser, async (req: AuthRequest,res) => {
 try {
  const b=req.body||{}, title=clean(b.title,160), type=clean(b.doc_type,32), mime=clean(b.mime_type,80);
  const file=decodeFile(b.file_base64,mime);
  if(!title||!allowed.has(type)||!file) return res.status(400).json({success:false,error:'Invalid document details or file. Use PDF/JPEG/PNG/WebP up to 5 MB.'});
  const memberId=clean(b.member_id,64)||null;
  if(memberId){const m=await query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2',[memberId,req.userId]);if(!m.rows[0])return res.status(400).json({success:false,error:'Invalid family member'});}
  const result=await query(`INSERT INTO official_documents(user_id,member_id,doc_type,title,issuer,document_number,issue_date,expiry_date,notes,file_name,mime_type,file_size,file_base64)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[req.userId,memberId,type,title,clean(b.issuer,160),clean(b.document_number,100),dateOnly(b.issue_date),dateOnly(b.expiry_date),clean(b.notes,2000),clean(b.file_name,180)||'document',mime,file.buffer.length,file.buffer.toString('base64')]);
  broadcast(req.userId!,{type:'update',entity:'documents',action:'created'}); res.status(201).json({success:true,data:metadata(result.rows[0])});
 } catch(e){console.error('Documents create error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});
router.get('/:id/file', async (req: AuthRequest,res) => {
 try {
  const parent=await isParentAccount(req.actualUserId);
  const linked=parent?null:await query('SELECT id FROM family_members WHERE user_id=$1 AND linked_user_id=$2',[req.userId,req.actualUserId]);
  if(!parent&&!linked?.rows[0])return res.status(403).json({success:false,error:'Forbidden'});
  const result=parent?await query('SELECT file_base64,file_name,mime_type FROM official_documents WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]):await query('SELECT file_base64,file_name,mime_type FROM official_documents WHERE id=$1 AND user_id=$2 AND member_id=$3',[req.params.id,req.userId,linked!.rows[0].id]);
  const row=result.rows[0]; if(!row)return res.status(404).json({success:false,error:'Document not found'});
  const bytes=Buffer.from(row.file_base64,'base64'); res.setHeader('Content-Type',row.mime_type);res.setHeader('Content-Length',bytes.length);res.setHeader('Content-Disposition',`attachment; filename="${String(row.file_name).replace(/["\\\\\\r\\n]/g,'_')}"`);res.setHeader('X-Content-Type-Options','nosniff');return res.send(bytes);
 }catch(e){console.error('Document download error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});
router.delete('/:id', requireParent, async (req: AuthRequest,res) => {
 try {const r=await query('DELETE FROM official_documents WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.userId]);if(!r.rows[0])return res.status(404).json({success:false,error:'Document not found'});broadcast(req.userId!,{type:'update',entity:'documents',action:'deleted'});res.json({success:true});}
 catch(e){console.error('Document delete error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});
export default router;
