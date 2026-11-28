'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {api,apiBlob} from '../../../../lib/api';
import {useLocale} from '../../../../components/product/locale';
import {useData} from '../../../../components/business/useData';
import {useTransientNotice} from '../../../../components/product/useTransientNotice';
import {NavIcon} from '../../../../components/product/NavIcon';
import {WorkspaceHeading} from '../../../../components/product/ProductUI';
type Attachment={name:string;original_name:string;mime:string;size:number;deleted_at:string|null;revoked_at:string|null;created_at:string};
export default function Attachments(){
 const {t,language}=useLocale();
 const workspace=useData<{role:string}>('/workspace',{role:''});
 const manager=!workspace.error&&['owner','admin'].includes(workspace.data.role);
 const [query,setQuery]=useState(''),[state,setState]=useState('all'),[size,setSize]=useState(25),[cursors,setCursors]=useState<string[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),input=useRef<HTMLInputElement>(null);
 const params=new URLSearchParams({q:query,state,limit:String(size)});if(cursors.length)params.set('after',cursors[cursors.length-1]);
 const path=manager?'/uploads?'+params:null;
 const list=useData<{items:Attachment[];total:number;nextAfter:string|null}>(path,{items:[],total:0,nextAfter:null});
 const ready=manager&&list.loadedPath===path&&!list.loading&&!list.error;
 const items=ready?list.data.items:[];
 useTransientNotice(notice,()=>setNotice(''));
 async function mutate(work:()=>Promise<unknown>,success:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await work();setNotice(success);if(cursors.length)setCursors([]);else await list.reload();}
  catch(cause){const e=cause as Error & {details?:{code?:string}};setError(e.details?.code==='ATTACHMENT_IN_USE'?t('المرفق مرتبط ببيانات محفوظة. يمكنك إيقاف رابطه بدل حذفه.','This attachment is referenced by saved data. You can revoke its link instead.'):e.message);}
  finally{lock.current=false;setBusy(false);}
 }
 function change(file:Attachment,action:'delete'|'revoke'|'restore'){
  if(lock.current||!window.confirm(action==='revoke'?t('إيقاف رابط هذا الملف؟ ستتوقف طلبات التنزيل العامة الجديدة حتى استعادته.','Revoke this file link? New public downloads stop until it is restored.'):action==='delete'?t('حذف المرفق غير المستخدم؟ يمكنك استعادته لاحقًا.','Delete this unused attachment? You can restore it later.'):t('استعادة المرفق وإتاحة رابطه مجددًا؟','Restore this attachment and enable its link again?')))return;
  void mutate(()=>api('/uploads/'+file.name+(action==='delete'?'':'/'+action),{method:action==='delete'?'DELETE':'POST',...(action==='revoke'?{body:JSON.stringify({confirm:true})}:{})}),t('تم تحديث المرفق.','Attachment updated.'));
 }
 async function download(file:Attachment){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const blob=await apiBlob('/uploads/'+file.name+'/content'),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.original_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(cause){setError((cause as Error).message);}finally{lock.current=false;setBusy(false);}}
 const back=<Link className="btn" href="/dashboard/settings">{t('رجوع للإعدادات','Back to settings')}</Link>;
 return <main className="stack" data-workbench="attachments">
 <WorkspaceHeading title={t('إدارة المرفقات','Attachment management')} description={t('إدارة مشاركة الملفات واستعادتها.','Manage file sharing and recovery.')} actions={<>{back}{manager&&<button className="btn btn-primary" disabled={busy} onClick={()=>input.current?.click()}>{t('رفع مرفق','Upload attachment')}</button>}</>}/>
 {workspace.loading?<p role="status">{t('جارٍ التحقق من الصلاحيات…','Checking access…')}</p>:workspace.error?<p role="alert" className="notice error">{workspace.error} <button className="btn" onClick={()=>void workspace.reload()}>{t('إعادة المحاولة','Retry')}</button></p>:!manager?<p role="alert" className="notice error">{t('تحتاج صلاحية مالك أو مدير لإدارة المرفقات.','Owner or manager access is required to manage attachments.')}</p>:<>
 <input ref={input} type="file" hidden disabled={busy} aria-label={t('رفع مرفق','Upload attachment')} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>10*1024*1024){setError(t('الحد الأقصى للملف 10 ميجابايت.','Maximum file size is 10 MB.'));return;}const form=new FormData();form.append('file',file);void mutate(()=>api('/uploads',{method:'POST',body:form}),t('تم رفع المرفق.','Attachment uploaded.'));}}/>
 <p className="notice">{t('الحذف قابل للاسترجاع. المرفقات المرتبطة ببيانات محفوظة محمية من الحذف، وإيقاف الرابط لا يسترجع النسخ المنزلة سابقًا.','Deletion is recoverable. Referenced files cannot be deleted, and revoking a link cannot recall previously downloaded copies.')}</p>
 {(error||list.error)&&<p className="notice error" role="alert">{error||list.error} {list.error&&<button className="btn" onClick={()=>void list.reload()}>{t('إعادة المحاولة','Retry')}</button>}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
 <section className="card stack">
 <div className="workbench-toolbar"><input type="search" maxLength={200} disabled={busy} value={query} onChange={e=>{setQuery(e.target.value);setCursors([]);}} placeholder={t('بحث في جميع المرفقات','Search all attachments')} aria-label={t('بحث المرفقات','Search attachments')}/><select disabled={busy} value={state} onChange={e=>{setState(e.target.value);setCursors([]);}} aria-label={t('حالة الملف','File status')}><option value="all">{t('كل الحالات','All states')}</option><option value="active">{t('نشط','Active')}</option><option value="revoked">{t('موقوف','Revoked')}</option><option value="deleted">{t('محذوف','Deleted')}</option></select><button className="btn" disabled={busy} onClick={()=>{setQuery('');setState('all');setCursors([]);}}>{t('مسح الفلاتر','Clear filters')}</button><button className="btn" disabled={busy||list.loading} onClick={()=>void list.reload()}>{t('تحديث','Refresh')}</button></div>
 {!ready&&!list.error&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}
 {ready&&!items.length&&<p className="empty">{t('لا توجد مرفقات مطابقة.','No matching attachments.')}</p>}
 <div className="table-wrap"><table className="product-table"><thead><tr><th>{t('الملف','File')}</th><th>{t('الحجم','Size')}</th><th>{t('التاريخ','Date')}</th><th>{t('الحالة','Status')}</th><th>{t('الإجراءات','Actions')}</th></tr></thead><tbody>{items.map(file=><tr key={file.name} aria-label={file.original_name}><td style={{overflowWrap:'anywhere'}}><strong>{file.original_name}</strong><div className="muted"><bdi>{file.mime}</bdi></div></td><td>{Math.ceil(file.size/1024)} KB</td><td>{new Date(file.created_at).toLocaleDateString(language)}</td><td><span className="workbench-state" data-active={!file.deleted_at&&!file.revoked_at}>{file.deleted_at?t('محذوف قابل للاسترجاع','Recoverably deleted'):file.revoked_at?t('الرابط موقوف','Link revoked'):t('نشط','Active')}</span></td><td><div className="form-actions"><button className="btn" disabled={busy||!!file.deleted_at} onClick={()=>void download(file)}>{t('تنزيل مصرح','Authorized download')}</button>{file.deleted_at||file.revoked_at?<button className="btn" disabled={busy} onClick={()=>change(file,'restore')}>{t('استعادة وإتاحة الرابط','Restore and enable link')}</button>:<><button className="btn" disabled={busy} onClick={()=>change(file,'revoke')}>{t('إيقاف الرابط','Revoke link')}</button><button className="btn btn-danger" disabled={busy} onClick={()=>change(file,'delete')}><NavIcon name="trash"/>{t('حذف غير المستخدم','Delete unused')}</button></>}</div></td></tr>)}</tbody></table></div>
 <div className="form-actions"><label>{t('عدد الصفوف','Rows per page')} <select disabled={busy} value={size} onChange={e=>{setSize(Number(e.target.value));setCursors([]);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><span aria-live="polite">{ready?list.data.total:'…'} {t('نتيجة','results')}</span><button className="btn" disabled={busy||!ready||!cursors.length} onClick={()=>setCursors(c=>c.slice(0,-1))}>{t('السابق','Previous')}</button><span>{cursors.length+1}</span><button className="btn" disabled={busy||!ready||!list.data.nextAfter} onClick={()=>{if(list.data.nextAfter)setCursors(c=>[...c,list.data.nextAfter!]);}}>{t('التالي','Next')}</button></div>
 </section></>}
 </main>;
}
