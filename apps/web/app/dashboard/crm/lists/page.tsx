'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { useData } from '../../../../components/business/useData';
import { useLocale } from '../../../../components/product/locale';

type Member = { id:string; name:string; email:string|null; phone:string|null };
export default function ContactLists() {
  const {t}=useLocale();
  const lists=useData<{id:string;name:string;members:number}[]>('/contact-lists',[]);
  const [selected,setSelected]=useState('');
  const [members,setMembers]=useState<Member[]>([]);
  const [candidates,setCandidates]=useState<Member[]>([]);
  const [contactId,setContactId]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function load(id:string) { const result=await api<Member[]>(`/contact-lists/${id}/members`);setMembers(result);setSelected(id); }
  async function create(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();const form=e.currentTarget;setBusy(true);setError('');
    try { const row=await api<{id:string}>('/contact-lists',{method:'POST',body:JSON.stringify({name:new FormData(form).get('name')})});form.reset();lists.reload();await load(row.id); } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function search(q:string){
    try {const result=await api<{items:Member[]}>(`/crm/contacts?q=${encodeURIComponent(q)}&limit=20`);setCandidates(result.items??[]);}catch(e){setError((e as Error).message);}
  }
  async function change(id:string,remove=false){setBusy(true);setError('');try{await api(`/contact-lists/${selected}/members${remove?'/'+id:''}`,{method:remove?'DELETE':'POST',...(!remove?{body:JSON.stringify({contactId:id})}:{})});await load(selected);lists.reload();setContactId('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <main className="stack"><Link href="/dashboard/crm">← {t('إدارة العملاء','Customer management')}</Link><h1>{t('قوائم المشتركين','Subscriber lists')}</h1><p>{t('قوائم مستقلة عن الوسوم. استخدم أفعال الأزرار لإضافة العميل أو إزالته تلقائيًا.','Lists are separate from labels. Button actions can add or remove a customer automatically.')}</p>
    {(error||lists.error)&&<p className="notice error" role="alert">{error||lists.error}</p>}
    <form onSubmit={create} className="card form-actions"><label className="field">{t('اسم قائمة جديدة','New list name')}<input name="name" maxLength={120} required/></label><button className="btn btn-primary" disabled={busy}>{t('إنشاء القائمة','Create list')}</button></form>
    <section className="card stack"><label className="field">{t('اختر القائمة','Choose list')}<select disabled={busy} value={selected} onChange={e=>{if(e.target.value){setBusy(true);setError('');void load(e.target.value).catch(e=>setError(e.message)).finally(()=>setBusy(false));}else{setSelected('');setMembers([]);}}}><option value="">{t('اختر…','Choose…')}</option>{lists.data.map(l=><option key={l.id} value={l.id}>{l.name} ({l.members})</option>)}</select></label>
    {selected&&<><label className="field">{t('ابحث عن عميل لإضافته','Search for a customer to add')}<input type="search" onChange={e=>void search(e.target.value)}/></label><label className="field">{t('نتائج البحث','Search results')}<select value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">{t('اختر العميل','Choose customer')}</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name||c.email||c.phone||c.id}</option>)}</select></label><button className="btn" disabled={busy||!contactId} onClick={()=>void change(contactId)}>{t('إضافة للقائمة','Add to list')}</button><p>{t('آخر 500 عضو كحد أقصى','Up to the latest 500 members')}</p><ul className="stack">{members.map(m=><li key={m.id} className="form-actions"><span>{m.name||m.email||m.phone||m.id}</span><button className="btn" disabled={busy} onClick={()=>void change(m.id,true)}>{t('إزالة من القائمة','Remove from list')}</button></li>)}</ul></>}
    </section></main>;
}
