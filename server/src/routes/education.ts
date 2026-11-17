import { Router } from 'express';
import { query } from '../db';
import { authMiddleware, AuthRequest, requireParent, isParentAccount } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';

const router=Router();
router.use(authMiddleware);
const kinds=new Set(['homework','exam','grade','note']);
const statuses=new Set(['planned','in_progress','completed']);
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;

router.get('/',async(req:AuthRequest,res)=>{
 try{
  const parent=await isParentAccount(req.actualUserId);
  const linked=parent?null:await query('SELECT id FROM family_members WHERE user_id=$1 AND linked_user_id=$2',[req.userId,req.actualUserId]);
  if(!parent&&!linked?.rows[0])return res.json({success:true,data:[]});
  const result=await query(`SELECT e.*,fm.name AS member_name FROM education_records e
   LEFT JOIN family_members fm ON fm.id=e.member_id
   WHERE e.user_id=$1 AND ($2::uuid IS NULL OR e.member_id=$2)
   ORDER BY e.due_date NULLS LAST,e.created_at DESC`,[req.userId,parent?null:linked!.rows[0].id]);
  res.json({success:true,data:result.rows});
 }catch(error){console.error('Education list error:',error);res.status(500).json({success:false,error:'Internal server error'});}
});

router.post('/',requireParent,async(req:AuthRequest,res)=>{
 try{
  const title=text(req.body?.title,160),subject=text(req.body?.subject,100),kind=text(req.body?.kind,20);
  if(!title||!kinds.has(kind))return res.status(400).json({success:false,error:'A title and valid record type are required'});
  const memberId=req.body?.member_id||null;
  if(memberId){const m=await query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2',[memberId,req.userId]);if(!m.rows[0])return res.status(400).json({success:false,error:'Invalid family member'});}
  const score=req.body?.score===''||req.body?.score==null?null:Number(req.body.score);
  const max=req.body?.max_score===''||req.body?.max_score==null?null:Number(req.body.max_score);
  if((score!==null&&(!Number.isFinite(score)||score<0))||(max!==null&&(!Number.isFinite(max)||max<=0))||(score!==null&&max!==null&&score>max))return res.status(400).json({success:false,error:'Invalid score'});
  const r=await query(`INSERT INTO education_records(user_id,member_id,kind,title,subject,details,due_date,score,max_score,status)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
   [req.userId,memberId,kind,title,subject,text(req.body?.details,2000),date(req.body?.due_date),score,max,statuses.has(req.body?.status)?req.body.status:'planned']);
  broadcast(req.userId!,{type:'update',entity:'education',action:'created'});
  res.status(201).json({success:true,data:r.rows[0]});
 }catch(error){console.error('Education create error:',error);res.status(500).json({success:false,error:'Internal server error'});}
});

router.put('/:id',requireParent,async(req:AuthRequest,res)=>{
 try{
  const title=text(req.body?.title,160),subject=text(req.body?.subject,100),kind=text(req.body?.kind,20);
  if(!title||!kinds.has(kind))return res.status(400).json({success:false,error:'A title and valid record type are required'});
  const memberId=req.body?.member_id||null;
  if(memberId){const m=await query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2',[memberId,req.userId]);if(!m.rows[0])return res.status(400).json({success:false,error:'Invalid family member'});}
  const score=req.body?.score===''||req.body?.score==null?null:Number(req.body.score),max=req.body?.max_score===''||req.body?.max_score==null?null:Number(req.body.max_score);
  if((score!==null&&(!Number.isFinite(score)||score<0))||(max!==null&&(!Number.isFinite(max)||max<=0))||(score!==null&&max!==null&&score>max))return res.status(400).json({success:false,error:'Invalid score'});
  const r=await query(`UPDATE education_records SET member_id=$3,kind=$4,title=$5,subject=$6,details=$7,due_date=$8,score=$9,max_score=$10,status=$11,updated_at=now()
   WHERE id=$1 AND user_id=$2 RETURNING *`,
   [req.params.id,req.userId,memberId,kind,title,subject,text(req.body?.details,2000),date(req.body?.due_date),score,max,statuses.has(req.body?.status)?req.body.status:'planned']);
  if(!r.rows[0])return res.status(404).json({success:false,error:'Record not found'});
  broadcast(req.userId!,{type:'update',entity:'education',action:'updated'});res.json({success:true,data:r.rows[0]});
 }catch(error){console.error('Education update error:',error);res.status(500).json({success:false,error:'Internal server error'});}
});

router.delete('/:id',requireParent,async(req:AuthRequest,res)=>{
 try{const r=await query('DELETE FROM education_records WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.userId]);if(!r.rows[0])return res.status(404).json({success:false,error:'Record not found'});broadcast(req.userId!,{type:'update',entity:'education',action:'deleted'});res.json({success:true});}
 catch(error){console.error('Education delete error:',error);res.status(500).json({success:false,error:'Internal server error'});}
});
export default router;
