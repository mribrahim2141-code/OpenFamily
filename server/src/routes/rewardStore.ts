import { Router } from 'express';
import { query, withTransaction } from '../db';
import { authMiddleware, AuthRequest, requireParent, isParentAccount } from '../middleware/auth';
import { broadcast } from '../lib/broadcaster';

const router = Router();
router.use(authMiddleware);

const cleanTitle = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 120 ? v.trim() : null;
const cleanDescription = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 1000) : '';
const cleanPoints = (v: unknown) => {
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isSafeInteger(n) && (n as number) > 0 && (n as number) <= 1000000 ? n as number : null;
};
const linkedMember = async (familyId: string, actualUserId: string) => {
    const r = await query('SELECT id FROM family_members WHERE user_id=$1 AND linked_user_id=$2', [familyId, actualUserId]);
    return r.rows[0]?.id as string | undefined;
};
const belongs = async (memberId: string, familyId: string) => {
    const r = await query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2', [memberId, familyId]);
    return r.rows.length > 0;
};

// Active catalogue. Empty member_ids means available to every family member.
router.get('/catalog', async (req: AuthRequest, res) => {
    try {
        const parent = await isParentAccount(req.actualUserId);
        const r = await query('SELECT * FROM reward_catalog WHERE user_id=$1 AND (is_active=true OR $2=true) ORDER BY created_at DESC', [req.userId, parent]);
        res.json({ success: true, data: r.rows });
    } catch (e) { console.error('Reward catalog error:', e); res.status(500).json({ success:false,error:'Internal server error' }); }
});

router.post('/catalog', requireParent, async (req: AuthRequest, res) => {
    try {
        const title = cleanTitle(req.body?.title), points = cleanPoints(req.body?.points);
        if (!title || points === null) return res.status(400).json({success:false,error:'Valid title and points are required'});
        const ids = Array.isArray(req.body?.member_ids) ? [...new Set(req.body.member_ids.filter((x: unknown)=>typeof x==='string'))] : [];
        for (const id of ids) if (!(await belongs(id, req.userId!))) return res.status(400).json({success:false,error:'Invalid family member'});
        const r = await query(`INSERT INTO reward_catalog(user_id,title,description,emoji,points_cost,member_ids)
            VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
            [req.userId,title,cleanDescription(req.body?.description),typeof req.body?.emoji==='string'?req.body.emoji.trim().slice(0,12):'🎁',points,JSON.stringify(ids)]);
        broadcast(req.userId!,{type:'update',entity:'rewards',action:'created'});
        res.status(201).json({success:true,data:r.rows[0]});
    } catch(e){console.error('Create reward catalog item error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});

router.put('/catalog/:id', requireParent, async (req: AuthRequest, res) => {
    try {
        const title = cleanTitle(req.body?.title), points = cleanPoints(req.body?.points);
        if (!title || points === null) return res.status(400).json({success:false,error:'Valid title and points are required'});
        const ids = Array.isArray(req.body?.member_ids) ? [...new Set(req.body.member_ids.filter((x: unknown)=>typeof x==='string'))] : [];
        for (const id of ids) if (!(await belongs(id, req.userId!))) return res.status(400).json({success:false,error:'Invalid family member'});
        const r = await query(`UPDATE reward_catalog SET title=$3,description=$4,emoji=$5,points_cost=$6,member_ids=$7::jsonb,
            is_active=COALESCE($8,is_active),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,
            [req.params.id,req.userId,title,cleanDescription(req.body?.description),typeof req.body?.emoji==='string'?req.body.emoji.trim().slice(0,12):'🎁',points,JSON.stringify(ids),typeof req.body?.is_active==='boolean'?req.body.is_active:null]);
        if(!r.rows[0]) return res.status(404).json({success:false,error:'Reward not found'});
        broadcast(req.userId!,{type:'update',entity:'rewards',action:'updated'});
        res.json({success:true,data:r.rows[0]});
    } catch(e){console.error('Update reward catalog item error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});

router.get('/store-requests', async (req: AuthRequest, res) => {
    try {
        const parent = await isParentAccount(req.actualUserId);
        const memberId = parent ? null : await linkedMember(req.userId!, req.actualUserId!);
        if (!parent && !memberId) return res.json({success:true,data:[]});
        const r = await query(`SELECT rr.*, fm.name AS member_name, rc.title AS reward_title, rc.emoji
            FROM reward_redemption_requests rr JOIN family_members fm ON fm.id=rr.member_id
            JOIN reward_catalog rc ON rc.id=rr.reward_id
            WHERE rr.user_id=$1 AND ($2::uuid IS NULL OR rr.member_id=$2)
            ORDER BY CASE WHEN rr.status='pending' THEN 0 ELSE 1 END, rr.created_at DESC LIMIT 100`,
            [req.userId,memberId]);
        res.json({success:true,data:r.rows});
    } catch(e){console.error('Get reward requests error:',e);res.status(500).json({success:false,error:'Internal server error'});}
});

// The member row serializes simultaneous requests. Pending requests reserve points
// without touching the existing ledger; points are deducted exactly once on approval.
router.post('/store-requests', async (req: AuthRequest, res) => {
    try {
        const parent = await isParentAccount(req.actualUserId);
        const memberId = parent ? req.body?.member_id : await linkedMember(req.userId!,req.actualUserId!);
        if (!memberId || !(await belongs(memberId,req.userId!))) return res.status(400).json({success:false,error:'Member not found'});
        const result = await withTransaction(async tx => {
            const member = await tx.query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2 FOR UPDATE',[memberId,req.userId]);
            if (!member.rows[0]) throw new Error('MEMBER_NOT_FOUND');
            const reward = await tx.query('SELECT * FROM reward_catalog WHERE id=$1 AND user_id=$2 AND is_active=true FOR SHARE',[req.body?.reward_id,req.userId]);
            const item = reward.rows[0];
            if (!item) throw new Error('REWARD_NOT_FOUND');
            const allowed = Array.isArray(item.member_ids) ? item.member_ids : [];
            if (allowed.length && !allowed.includes(memberId)) throw new Error('REWARD_NOT_AVAILABLE');
            const [balance, reserved] = await Promise.all([
                tx.query('SELECT COALESCE(SUM(points),0)::int AS balance FROM reward_transactions WHERE user_id=$1 AND member_id=$2',[req.userId,memberId]),
                tx.query("SELECT COALESCE(SUM(points_cost),0)::int AS reserved FROM reward_redemption_requests WHERE user_id=$1 AND member_id=$2 AND status='pending'",[req.userId,memberId])
            ]);
            const available = Number(balance.rows[0].balance)-Number(reserved.rows[0].reserved);
            if (available < item.points_cost) throw new Error('INSUFFICIENT_POINTS');
            const created = await tx.query(`INSERT INTO reward_redemption_requests(user_id,member_id,reward_id,points_cost,status)
                VALUES($1,$2,$3,$4,'pending') RETURNING *`,[req.userId,memberId,item.id,item.points_cost]);
            return created.rows[0];
        });
        broadcast(req.userId!,{type:'update',entity:'rewards',action:'created'});
        res.status(201).json({success:true,data:result});
    } catch(e) {
        const code = e instanceof Error ? e.message : '';
        if (code==='MEMBER_NOT_FOUND'||code==='REWARD_NOT_FOUND') return res.status(404).json({success:false,error:code});
        if (code==='REWARD_NOT_AVAILABLE') return res.status(403).json({success:false,error:code});
        if (code==='INSUFFICIENT_POINTS') return res.status(409).json({success:false,error:'Not enough available points'});
        console.error('Create reward request error:',e);res.status(500).json({success:false,error:'Internal server error'});
    }
});

const decideRequest = (status: 'approved'|'rejected') => async (req: AuthRequest,res: any) => {
    try {
        const data = await withTransaction(async tx => {
            const found = await tx.query('SELECT * FROM reward_redemption_requests WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.userId]);
            const request = found.rows[0];
            if (!request) throw new Error('REQUEST_NOT_FOUND');
            const member = await tx.query('SELECT id FROM family_members WHERE id=$1 AND user_id=$2 FOR UPDATE',[request.member_id,req.userId]);
            if (!member.rows[0]) throw new Error('MEMBER_NOT_FOUND');
            if (request.status !== 'pending') throw new Error('REQUEST_ALREADY_DECIDED');
            if (status==='approved') {
                const [balance,reserved] = await Promise.all([
                    tx.query('SELECT COALESCE(SUM(points),0)::int AS balance FROM reward_transactions WHERE user_id=$1 AND member_id=$2',[req.userId,request.member_id]),
                    tx.query("SELECT COALESCE(SUM(points_cost),0)::int AS reserved FROM reward_redemption_requests WHERE user_id=$1 AND member_id=$2 AND status='pending'",[req.userId,request.member_id])
                ]);
                if (Number(balance.rows[0].balance)<Number(reserved.rows[0].reserved)) throw new Error('INSUFFICIENT_POINTS');
                await tx.query(`INSERT INTO reward_transactions(user_id,member_id,points,type,note)
                    VALUES($1,$2,$3,'redeem',$4)`,[req.userId,request.member_id,-request.points_cost,`متجر المكافآت: ${request.reward_id}`]);
            }
            const updated = await tx.query(`UPDATE reward_redemption_requests SET status=$3,decided_at=now(),updated_at=now()
                WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *`,[req.params.id,req.userId,status]);
            if (!updated.rows[0]) throw new Error('REQUEST_ALREADY_DECIDED');
            return updated.rows[0];
        });
        broadcast(req.userId!,{type:'update',entity:'rewards',action:'updated'});
        res.json({success:true,data});
    } catch(e) {
        const code=e instanceof Error?e.message:'';
        if(code==='REQUEST_NOT_FOUND'||code==='MEMBER_NOT_FOUND') return res.status(404).json({success:false,error:code});
        if(code==='REQUEST_ALREADY_DECIDED') return res.status(409).json({success:false,error:code});
        if(code==='INSUFFICIENT_POINTS') return res.status(409).json({success:false,error:'Balance changed; request cannot be approved'});
        console.error('Decide reward request error:',e);res.status(500).json({success:false,error:'Internal server error'});
    }
};
router.post('/store-requests/:id/approve',requireParent,decideRequest('approved'));
router.post('/store-requests/:id/reject',requireParent,decideRequest('rejected'));

export default router;
