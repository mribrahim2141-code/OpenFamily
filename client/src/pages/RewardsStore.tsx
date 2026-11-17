import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {Gift,Plus,Check,X,Star,Store,Loader2,ArrowLeft} from 'lucide-react';
import {Card,CardContent,Button,Input,Badge} from '../components/ui';
import {api} from '../lib/api';
import {useAuth} from '../contexts/AuthContext';

type Member={id:string;name:string;role:string;balance:number;linked_user_id?:string|null};
type Item={id:string;title:string;description:string;emoji:string;points_cost:number;member_ids:string[];is_active:boolean};
type Request={id:string;member_id:string;member_name:string;reward_id:string;reward_title:string;emoji:string;points_cost:number;status:'pending'|'approved'|'rejected';created_at:string};
const RewardsStore:React.FC=()=>{
 const {t}=useTranslation(['rewards','common']);const {user}=useAuth();
 const isParent=Boolean(user?.is_owner)||user?.role!=='enfant';
 const [members,setMembers]=useState<Member[]>([]);const [items,setItems]=useState<Item[]>([]);const [requests,setRequests]=useState<Request[]>([]);
 const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [emoji,setEmoji]=useState('🎁');const [points,setPoints]=useState('');const [eligible,setEligible]=useState<string[]>([]);
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const [summary,catalog,reqs]=await Promise.all([
    api.get<{success:boolean;data:{members:Member[]}}>('/api/rewards/summary'),
    api.get<{success:boolean;data:Item[]}>('/api/rewards/catalog'),
    api.get<{success:boolean;data:Request[]}>('/api/rewards/store-requests')
   ]);
   if(summary.success)setMembers(summary.data.members||[]);if(catalog.success)setItems(catalog.data||[]);if(reqs.success)setRequests(reqs.data||[]);
  }catch(e){setError(e instanceof Error?e.message:t('rewards:errors.load'))}finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[]);
 const myMember=useMemo(()=>members.find(m=>m.linked_user_id===user?.id),[members,user?.id]);
 const visibleItems=items.filter(i=>i.is_active&&(!i.member_ids?.length||i.member_ids.includes(myMember?.id||'')));
 const createItem=async(e:React.FormEvent)=>{
  e.preventDefault();setSaving(true);setError('');
  try{await api.post('/api/rewards/catalog',{title,description,emoji,points:Number(points),member_ids:eligible});setTitle('');setDescription('');setEmoji('🎁');setPoints('');setEligible([]);await load()}
  catch(e){setError(e instanceof Error?e.message:t('rewards:errors.action'))}finally{setSaving(false)}
 };
 const requestItem=async(item:Item)=>{
  setSaving(true);setError('');
  try{await api.post('/api/rewards/store-requests',{reward_id:item.id,member_id:myMember?.id});await load()}
  catch(e){setError(e instanceof Error?e.message:t('rewards:errors.action'))}finally{setSaving(false)}
 };
 const decide=async(id:string,decision:'approve'|'reject')=>{
  setSaving(true);setError('');
  try{await api.post(`/api/rewards/store-requests/${id}/${decision}`,{});await load()}
  catch(e){setError(e instanceof Error?e.message:t('rewards:errors.action'))}finally{setSaving(false)}
 };
 const toggleItem=async(item:Item)=>{
  setSaving(true);setError('');
  try{await api.put(`/api/rewards/catalog/${item.id}`,{title:item.title,description:item.description,emoji:item.emoji,points:item.points_cost,member_ids:item.member_ids||[],is_active:!item.is_active});await load()}
  catch(e){setError(e instanceof Error?e.message:t('rewards:errors.action'))}finally{setSaving(false)}
 };
 if(loading)return <div className="flex min-h-[45vh] items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>{t('rewards:loading')}</div>;
 return <div className="mx-auto max-w-5xl space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><Link to="/rewards" className="mb-2 inline-flex items-center gap-2 text-caption text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4"/>{t('store.back')}</Link><h1 className="flex items-center gap-2 text-h1"><Store className="h-6 w-6 text-primary"/>{t('store.title')}</h1><p className="mt-1 text-body text-muted-foreground">{t('store.subtitle')}</p></div>
   {!isParent&&myMember&&<Badge variant="primary"><Star className="mr-1 h-3 w-3"/>{myMember.balance} {t('store.points')}</Badge>}
  </div>
  {error&&<div role="alert" className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">{error}</div>}
  {isParent&&<Card><CardContent className="space-y-4 p-5">
   <h2 className="flex items-center gap-2 text-h2"><Plus className="h-5 w-5"/>{t('store.add')}</h2>
   <form onSubmit={createItem} className="grid gap-3 sm:grid-cols-2">
    <Input label={t('store.name')} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required/>
    <div className="grid grid-cols-[84px_1fr] gap-2"><Input label={t('store.emoji')} value={emoji} onChange={e=>setEmoji(e.target.value)} maxLength={8}/><Input label={t('store.cost')} type="number" min="1" max="1000000" step="1" value={points} onChange={e=>setPoints(e.target.value)} required/></div>
    <div className="sm:col-span-2"><label className="mb-1 block text-caption font-medium">{t('store.description')}</label><textarea className="min-h-20 w-full rounded-input border border-border bg-background px-3 py-2 text-body" value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000}/></div>
    <div className="sm:col-span-2 space-y-2"><p className="text-caption font-medium">{t('store.availableTo')}</p><div className="flex flex-wrap gap-3">{members.map(m=><label key={m.id} className="flex items-center gap-2 text-caption"><input type="checkbox" checked={eligible.includes(m.id)} onChange={e=>setEligible(old=>e.target.checked?[...old,m.id]:old.filter(id=>id!==m.id))}/>{m.name}</label>)}</div><p className="text-micro text-muted-foreground">{t('store.allMembersHint')}</p></div>
    <div className="sm:col-span-2"><Button type="submit" disabled={saving||!title.trim()||!(Number(points)>0)}><Plus className="mr-2 h-4 w-4"/>{t('store.create')}</Button></div>
   </form>
  </CardContent></Card>}
  <section className="space-y-3"><h2 className="text-h2">{t('store.catalog')}</h2>
   {items.filter(i=>isParent||i.is_active).length===0?<Card><CardContent className="p-8 text-center text-muted-foreground">{t('store.empty')}</CardContent></Card>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {items.filter(i=>isParent||i.is_active).map(item=><Card key={item.id} className="overflow-hidden"><CardContent className="flex h-full flex-col gap-3 p-5">
     <div className="flex items-start justify-between"><span className="text-4xl" aria-hidden="true">{item.emoji||'🎁'}</span><Badge variant={item.is_active?'primary':'secondary'}>{item.is_active?t('store.active'):t('store.disabled')}</Badge></div>
     <div className="flex-1"><h3 className="text-body font-semibold">{item.title}</h3><p className="mt-1 text-caption text-muted-foreground">{item.description}</p></div>
     <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 font-semibold text-amber-600"><Star className="h-4 w-4 fill-current"/>{item.points_cost} {t('store.points')}</span>
      {isParent?<Button size="sm" variant="secondary" disabled={saving} onClick={()=>void toggleItem(item)}>{item.is_active?t('store.disable'):t('store.enable')}</Button>:<Button size="sm" disabled={saving||!myMember||myMember.balance<item.points_cost||requests.some(r=>r.reward_id===item.id&&r.status==='pending')} onClick={()=>void requestItem(item)}><Gift className="mr-1 h-4 w-4"/>{t('store.request')}</Button>}
     </div>
    </CardContent></Card>)}
   </div>}
  </section>
  <section className="space-y-3"><h2 className="text-h2">{isParent?t('store.requestsTitle'):t('store.myRequests')}</h2>
   {requests.length===0?<Card><CardContent className="p-6 text-center text-muted-foreground">{t('store.noRequests')}</CardContent></Card>:<Card><CardContent className="divide-y divide-border p-0">
    {requests.map(r=><div key={r.id} className="flex flex-wrap items-center gap-3 p-4"><span className="text-2xl">{r.emoji||'🎁'}</span><div className="min-w-0 flex-1"><p className="font-medium">{r.reward_title}</p><p className="text-caption text-muted-foreground">{isParent?r.member_name+' · ':''}{r.points_cost} {t('store.points')}</p></div><Badge variant={r.status==='approved'?'primary':r.status==='rejected'?'secondary':'warning'}>{t(`store.status.${r.status}`)}</Badge>
     {isParent&&r.status==='pending'&&<div className="flex gap-2"><Button size="sm" disabled={saving} onClick={()=>void decide(r.id,'approve')}><Check className="mr-1 h-4 w-4"/>{t('store.approve')}</Button><Button size="sm" variant="secondary" disabled={saving} onClick={()=>void decide(r.id,'reject')}><X className="mr-1 h-4 w-4"/>{t('store.reject')}</Button></div>}
    </div>)}
   </CardContent></Card>}
  </section>
 </div>;
};
export default RewardsStore;
