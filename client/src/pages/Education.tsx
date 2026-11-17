import React,{useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {BookOpen,Plus,Trash2,CalendarDays,GraduationCap,ClipboardList,Loader2,Edit2} from 'lucide-react';
import {api} from '../lib/api';
import {useAuth} from '../contexts/AuthContext';
import {useWebSocketUpdates} from '../hooks/useWebSocketUpdates';
import {Button,Card,CardContent,Input,Select,Textarea,Badge,Dialog} from '../components/ui';

type Member={id:string;name:string;role:string};
type RecordItem={id:string;member_id:string|null;member_name?:string;kind:'homework'|'exam'|'grade'|'note';title:string;subject:string;details:string;due_date:string|null;score:number|null;max_score:number|null;status:'planned'|'in_progress'|'completed'};
const empty={member_id:'',kind:'homework' as RecordItem['kind'],title:'',subject:'',details:'',due_date:'',score:'',max_score:'',status:'planned' as RecordItem['status']};
const Education:React.FC=()=>{
 const {t}=useTranslation(['education','common']);const {user}=useAuth();const isParent=Boolean(user?.is_owner)||user?.role!=='enfant';
 const [members,setMembers]=useState<Member[]>([]);const [records,setRecords]=useState<RecordItem[]>([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const [open,setOpen]=useState(false);const [editing,setEditing]=useState<RecordItem|null>(null);const [form,setForm]=useState(empty);
 const load=async()=>{try{const [m,r]=await Promise.all([api.get<{success:boolean;data:Member[]}>('/api/family'),api.get<{success:boolean;data:RecordItem[]}>('/api/education')]);if(m.success)setMembers(m.data);if(r.success)setRecords(r.data)}catch(e){setError(e instanceof Error?e.message:t('education:errors.load'))}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);useWebSocketUpdates('education',()=>void load());
 const stats=useMemo(()=>({homework:records.filter(r=>r.kind==='homework'&&r.status!=='completed').length,exams:records.filter(r=>r.kind==='exam'&&r.status!=='completed').length,grades:records.filter(r=>r.kind==='grade').length}),[records]);
 const begin=(item?:RecordItem)=>{setEditing(item||null);setForm(item?{member_id:item.member_id||'',kind:item.kind,title:item.title,subject:item.subject||'',details:item.details||'',due_date:item.due_date?.slice(0,10)||'',score:item.score==null?'':String(item.score),max_score:item.max_score==null?'':String(item.max_score),status:item.status}:empty);setOpen(true)};
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');const payload={...form,member_id:form.member_id||null,due_date:form.due_date||null,score:form.score===''?null:Number(form.score),max_score:form.max_score===''?null:Number(form.max_score)};try{if(editing)await api.put('/api/education/'+editing.id,payload);else await api.post('/api/education',payload);setOpen(false);await load()}catch(e){setError(e instanceof Error?e.message:t('education:errors.save'))}finally{setSaving(false)}};
 const remove=async(id:string)=>{if(!window.confirm(t('education:confirmDelete')))return;try{await api.delete('/api/education/'+id);await load()}catch(e){setError(e instanceof Error?e.message:t('education:errors.delete'))}};
 const kindLabel=(kind:string)=>t('education:kinds.'+kind);const statusLabel=(status:string)=>t('education:statuses.'+status);
 if(loading)return <div className="flex min-h-[45vh] items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>{t('education:loading')}</div>;
 return <div className="mx-auto max-w-5xl space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-h1"><GraduationCap className="h-7 w-7 text-primary"/>{t('education:title')}</h1><p className="mt-1 text-body text-muted-foreground">{t('education:subtitle')}</p></div>{isParent&&<Button onClick={()=>begin()}><Plus className="mr-2 h-4 w-4"/>{t('education:add')}</Button>}</div>
  {error&&<div role="alert" className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">{error}</div>}
  <div className="grid grid-cols-3 gap-3">
   <Card><CardContent className="p-4"><ClipboardList className="mb-2 h-5 w-5 text-primary"/><p className="text-2xl font-semibold">{stats.homework}</p><p className="text-micro text-muted-foreground">{t('education:stats.homework')}</p></CardContent></Card>
   <Card><CardContent className="p-4"><CalendarDays className="mb-2 h-5 w-5 text-primary"/><p className="text-2xl font-semibold">{stats.exams}</p><p className="text-micro text-muted-foreground">{t('education:stats.exams')}</p></CardContent></Card>
   <Card><CardContent className="p-4"><GraduationCap className="mb-2 h-5 w-5 text-primary"/><p className="text-2xl font-semibold">{stats.grades}</p><p className="text-micro text-muted-foreground">{t('education:stats.grades')}</p></CardContent></Card>
  </div>
  {records.length===0?<Card><CardContent className="p-10 text-center"><BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground"/><p className="font-medium">{t('education:empty')}</p><p className="mt-1 text-caption text-muted-foreground">{t('education:emptyHint')}</p></CardContent></Card>:<div className="space-y-3">
   {records.map(item=><Card key={item.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><BookOpen className="h-5 w-5"/></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3><Badge variant="secondary">{kindLabel(item.kind)}</Badge><Badge variant={item.status==='completed'?'primary':'warning'}>{statusLabel(item.status)}</Badge></div><p className="mt-1 text-caption text-muted-foreground">{[item.member_name,item.subject,item.due_date].filter(Boolean).join(' · ')}</p>{item.details&&<p className="mt-2 whitespace-pre-wrap text-caption">{item.details}</p>}</div>
    {item.score!==null&&<div className="text-end"><p className="text-lg font-semibold tabular-nums">{item.score}{item.max_score!==null?' / '+item.max_score:''}</p><p className="text-micro text-muted-foreground">{t('education:score')}</p></div>}
    {isParent&&<div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={t('education:edit')} onClick={()=>begin(item)}><Edit2 className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label={t('education:delete')} onClick={()=>void remove(item.id)}><Trash2 className="h-4 w-4"/></Button></div>}
   </CardContent></Card>)}
  </div>}
  <Dialog open={open} onOpenChange={setOpen} title={editing?t('education:edit'):t('education:add')}>
   <form onSubmit={save} className="space-y-3">
    <Input label={t('education:fields.title')} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required maxLength={160}/>
    <div className="grid grid-cols-2 gap-3"><Select label={t('education:fields.kind')} value={form.kind} onValueChange={v=>setForm({...form,kind:v as RecordItem['kind']})} options={['homework','exam','grade','note'].map(v=>({value:v,label:kindLabel(v)}))}/><Select label={t('education:fields.member')} value={form.member_id} onValueChange={v=>setForm({...form,member_id:v})} options={[{value:'',label:t('education:allMembers')},...members.map(m=>({value:m.id,label:m.name}))]}/></div>
    <Input label={t('education:fields.subject')} value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} maxLength={100}/>
    <div className="grid grid-cols-2 gap-3"><Input label={t('education:fields.dueDate')} type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/><Select label={t('education:fields.status')} value={form.status} onValueChange={v=>setForm({...form,status:v as RecordItem['status']})} options={['planned','in_progress','completed'].map(v=>({value:v,label:statusLabel(v)}))}/></div>
    <div className="grid grid-cols-2 gap-3"><Input label={t('education:fields.score')} type="number" min="0" step="0.01" value={form.score} onChange={e=>setForm({...form,score:e.target.value})}/><Input label={t('education:fields.maxScore')} type="number" min="0.01" step="0.01" value={form.max_score} onChange={e=>setForm({...form,max_score:e.target.value})}/></div>
    <Textarea label={t('education:fields.details')} value={form.details} onChange={e=>setForm({...form,details:e.target.value})} rows={3}/>
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>{t('common:actions.cancel')}</Button><Button type="submit" disabled={saving||!form.title.trim()}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:null}{t('common:actions.save')}</Button></div>
   </form>
  </Dialog>
 </div>;
};
export default Education;
