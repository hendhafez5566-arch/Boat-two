'use client';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import {useData} from '../business/useData';
import {useLocale} from '../product/locale';
import {statusLabel} from '../product/status';
import {ExternalDeliveryNotice} from '../product/ExternalDeliveryNotice';
import {Dialog} from '../product/ProductUI';
import {api} from '../../lib/api';
import {SOCIAL_FORMATS,SocialFormat,SocialPost,socialFormat,socialMedia,socialKind} from '../../lib/social-posts';
import styles from '../../app/dashboard/social/social.module.css';
type Channel={id:string;name:string;type:string;status:string};
type Index={items:SocialPost[];total:number;counts:{format:string;status:string;count:number}[];publishingEnabled:boolean};
type Draft={name:string;channel:string;kind:string;body:string;media:string;link:string};
const blank=(format:SocialFormat):Draft=>({name:'',channel:'',kind:format==='cta'?'cta':format==='carousel'?'carousel':'text',body:'',media:'',link:''});
const validUrl=(value:string,httpsOnly=false)=>{try{const u=new URL(value);return (httpsOnly?u.protocol==='https:':['http:','https:'].includes(u.protocol))&&!u.username&&!u.password&&u.href.length<=2048;}catch{return false;}};
export default function SocialWorkspace({format,create=false}:{format:SocialFormat;create?:boolean}){
 const {t}=useLocale(),descriptor=SOCIAL_FORMATS[format],base='/dashboard/social/'+format;
 const channels=useData<Channel[]>('/channels',[]);
 const accounts=channels.data.filter(c=>format==='multimedia'?['facebook','instagram'].includes(c.type):c.type==='facebook');
 const [search,setSearch]=useState(''),[channelFilter,setChannelFilter]=useState(''),[kindFilter,setKindFilter]=useState(''),[status,setStatus]=useState('');
 const [page,setPage]=useState(1),[size,setSize]=useState(10);
 const path='/commerce/social/index?'+new URLSearchParams({format,q:search,page:String(page),limit:String(size),...(channelFilter?{channelId:channelFilter}:{}),...(kindFilter?{kind:kindFilter}:{}),...(status?{status}:{})});
 const posts=useData<Index>(path,{items:[],total:0,counts:[],publishingEnabled:false});
 const ready=posts.loadedPath===path&&!posts.loading&&!posts.error;
 const total=ready?posts.data.total:0,pages=Math.max(1,Math.ceil(total/size));
 useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
 const [draftId,setDraftId]=useState<string|null>(null);
 useEffect(()=>{setDraftId(create?new URLSearchParams(window.location.search).get('id')||'':'');},[create,format]);
 const detailPath=create&&draftId?'/commerce/social/'+encodeURIComponent(draftId)+'/detail':null;
 const detail=useData<SocialPost|null>(detailPath,null);
 const [draft,setDraft]=useState<Draft>(()=>blank(format)),[snapshot,setSnapshot]=useState(''),[initialized,setInitialized]=useState(false);
 const [preview,setPreview]=useState<SocialPost|null>(null),[scheduling,setScheduling]=useState<SocialPost|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showMedia,setShowMedia]=useState(false);
 const lock=useRef(false),savedNavigation=useRef(false);
 const dirty=create&&initialized&&snapshot!==JSON.stringify(draft);
 useEffect(()=>{
  if(!create||draftId===null||initialized)return;
  if(!draftId){const next=blank(format);setDraft(next);setSnapshot(JSON.stringify(next));setInitialized(true);return;}
  if(detail.loading||detail.error||detail.loadedPath!==detailPath)return;
  const p=detail.data;
  if(!p||socialFormat(p)!==format||p.status!=='draft'){setError(t('المسودة غير متاحة للتعديل.','Draft unavailable for editing.'));return;}
  const next={name:p.name||'',channel:p.channel_id,kind:socialKind(p),body:p.body,media:p.media_urls.join('\n'),link:p.link_url||''};
  setDraft(next);setSnapshot(JSON.stringify(next));setInitialized(true);
 },[create,draftId,initialized,detail.loading,detail.error,detail.loadedPath,detail.data,detailPath,format,t]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(!create){const key='boat-social-saved-'+format;if(sessionStorage.getItem(key)){sessionStorage.removeItem(key);setNotice(t('تم حفظ المسودة','Draft saved'));}}},[create,format,t]);
 useEffect(()=>{
  if(!create)return;
  const unload=(event:BeforeUnloadEvent)=>{if(!savedNavigation.current&&(dirty||lock.current)){event.preventDefault();event.returnValue='';}};
  const click=(event:MouseEvent)=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const a=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a||a.download||a.target==='_blank'||a.href===location.href)return;if(lock.current||(dirty&&!window.confirm(t('توجد تغييرات غير محفوظة. تجاهلها؟','Discard unsaved post changes?')))){event.preventDefault();event.stopPropagation();}else savedNavigation.current=true;};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',click,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',click,true);};
 },[create,dirty,t]);
 useEffect(()=>{savedNavigation.current=false;},[draft]);
 useEffect(()=>setShowMedia(false),[draft.media,draft.kind,preview?.id]);
 const patch=(change:Partial<Draft>)=>setDraft(d=>({...d,...change}));
 const kinds:Record<string,string>={text:t('نص','Text'),link:t('رابط','Link'),image:t('صورة / صور متعددة','Image / Carousel'),video:t('فيديو','Video'),carousel:t('صور متعددة','Carousel'),cta:t('دعوة لاتخاذ إجراء','Call to action')};
 const typeOptions=format==='cta'?['cta']:format==='carousel'?['carousel','video']:['text','link','image','video'];
 const urls=socialMedia(draft.media),chosen=accounts.find(c=>c.id===draft.channel),mediaKind=['image','carousel','video'].includes(draft.kind),linkKind=['link','cta'].includes(draft.kind);
 const validMedia=!mediaKind||(urls.length>=(draft.kind==='carousel'?2:1)&&urls.length<=(draft.kind==='video'?1:10)&&new Set(urls).size===urls.length&&urls.every(u=>validUrl(u,true)));
 const compatible=chosen?.type!=='instagram'||mediaKind;
 const canSave=initialized&&!busy&&!channels.loading&&!channels.error&&!detail.error&&!!chosen&&!!draft.name.trim()&&draft.name.length<=120&&!!draft.body.trim()&&draft.body.length<=4096&&compatible&&validMedia&&(!linkKind||validUrl(draft.link.trim()));
 async function act(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const counts=posts.data.counts.filter(c=>c.format===format);
 const count=(states:string[])=>counts.filter(c=>states.includes(c.status)).reduce((n,c)=>n+c.count,0);
 const mediaPreview=(links:string[],video:boolean)=> <>{links.length>0&&<button type="button" className="btn" onClick={()=>setShowMedia(v=>!v)}>{showMedia?t('إخفاء الوسائط','Hide media'):t('تحميل معاينة الوسائط','Load media preview')}</button>}{showMedia&&links.filter(u=>validUrl(u,true)).map((u,i)=>video?<video key={i} controls preload="none" src={u}/>:<img key={i} src={u} referrerPolicy="no-referrer" loading="lazy" alt={t('معاينة الوسائط','Media preview')}/>)}</>;
 const err=error||posts.error||channels.error||detail.error;
 return <main className={styles.page} aria-busy={busy}>
  <ExternalDeliveryNotice publishing/>
  <header className={styles.heading}><div><h1>{t(descriptor.ar,descriptor.en)}{create?' — '+t('إنشاء','Create'):''}</h1><p>{t(descriptor.descriptionAr,descriptor.descriptionEn)}</p></div>{!create&&<Link className="btn btn-primary" href={base+'/create'}>＋ {t('إنشاء منشور جديد','Create New Post')}</Link>}</header>
  <nav className={styles.breadcrumb}><Link href="/dashboard/social">{t('النشر الاجتماعي','Social Posting')}</Link> / {create?<Link href={base}>{t(descriptor.ar,descriptor.en)}</Link>:t(descriptor.ar,descriptor.en)}{create?' / '+t('إنشاء','Create'):''}</nav>
  {err&&<p role="alert" className="notice error">{err} {(posts.error||channels.error||detail.error)&&<button className="btn" disabled={busy} onClick={()=>void Promise.all([posts.reload(),channels.reload(),detail.reload()])}>{t('إعادة المحاولة','Retry')}</button>}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  {!create&&ready&&<div className={styles.metrics}>{[['draft'],['scheduled','sending'],['published'],['failed','ambiguous']].map((states,i)=><div key={states[0]} data-tone={states[0]}><small>{[t('مسودات','Drafts'),t('مجدولة وقيد الإرسال','Scheduled and sending'),t('منشورة','Published'),t('فشل أو نتيجة غير مؤكدة','Failed or uncertain')][i]}</small><strong>{count(states)}</strong></div>)}</div>}
  {create?<div className={styles.composer}>
   <form className={styles.card} onSubmit={e=>{e.preventDefault();if(!canSave)return;void act(async()=>{await api('/commerce/social'+(draftId?'/'+draftId:''),{method:draftId?'PATCH':'POST',body:JSON.stringify({name:draft.name.trim(),format,channelId:draft.channel,kind:draft.kind==='link'?'text':draft.kind==='image'&&urls.length>1?'carousel':draft.kind,body:draft.body.trim(),mediaUrls:mediaKind?urls:[],...(linkKind?{linkUrl:draft.link.trim()}:{})})});sessionStorage.setItem('boat-social-saved-'+format,'1');savedNavigation.current=true;window.location.assign(base);});}}>
    {(!initialized&&!err)&&<p role="status">{t('جارٍ تحميل المحرر…','Loading editor…')}</p>}
    <fieldset disabled={busy||!initialized} className={styles.fields}>
     {dirty&&<p className="notice" role="status">{t('تغييرات غير محفوظة','Unsaved changes')}</p>}
     {!channels.loading&&!channels.error&&!accounts.length&&<p className="notice">{t('اربط حسابًا أولًا لحفظ المنشور.','Connect an account before saving.')} <Link href="/dashboard/channels">{t('ربط حساب','Connect account')}</Link></p>}
     <label className="field">{t('الصفحة أو الحساب','Page or account')}<select required aria-label={t('الصفحة أو الحساب','Page or account')} value={draft.channel} onChange={e=>patch({channel:e.target.value})}><option value="">{t('اختر','Choose')}</option>{accounts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.type} · {c.id.slice(0,8)} · {statusLabel(c.status,t)}</option>)}</select></label>
     <div className={styles.tabs} role="group" aria-label={t('نوع المنشور','Post type')}>{typeOptions.map(k=><button key={k} type="button" aria-pressed={draft.kind===k||(k==='image'&&draft.kind==='carousel')} disabled={chosen?.type==='instagram'&&['text','link','cta'].includes(k)} onClick={()=>{if(draft.kind===k||(k==='image'&&draft.kind==='carousel'))return;if((draft.media||draft.link)&&!window.confirm(t('تغيير النوع سيمسح الروابط الحالية. متابعة؟','Changing the type clears current links. Continue?')))return;patch({kind:k,media:'',link:''});}}>{kinds[k]}</button>)}</div>
     <label className="field">{t('اسم الحملة','Campaign Name')}<input required maxLength={120} value={draft.name} onChange={e=>patch({name:e.target.value})}/></label>
     <label className="field">{t('النص','Text')}<textarea required maxLength={4096} rows={6} value={draft.body} onChange={e=>patch({body:e.target.value})}/><small>{draft.body.length} / 4096</small></label>
     {mediaKind&&<label className="field">{t('رابط الوسائط HTTPS — كل رابط في سطر','HTTPS media URLs — one per line')}<textarea required rows={3} dir="ltr" value={draft.media} onChange={e=>patch({media:e.target.value})}/><small>{urls.length} / {draft.kind==='video'?1:10}</small></label>}
     {linkKind&&<label className="field">{t('الرابط','Link')}<input type="url" required value={draft.link} onChange={e=>patch({link:e.target.value})}/></label>}
     {!compatible&&<p role="alert" className="notice error">{t('Instagram يتطلب صورة أو فيديو أو شرائح.','Instagram requires an image, video or carousel.')}</p>}
     {mediaKind&&!validMedia&&draft.media.trim()&&<p role="alert" className="notice error">{t('راجع عدد الروابط وتأكد أنها HTTPS وغير مكررة.','Check media count and use unique HTTPS URLs.')}</p>}
     {chosen&&chosen.status!=='active'&&<p className="notice">{t('الحساب غير نشط. يمكنك حفظ مسودة فقط.','Account inactive; you can only save a draft.')}</p>}
     <footer className={styles.formFooter}><Link href={base}>{t('رجوع','Back')}</Link><button className="btn btn-primary" disabled={!canSave}>{busy?t('جارٍ الحفظ…','Saving…'):t('حفظ مسودة','Save Draft')}</button></footer>
    </fieldset>
   </form>
   <section className={styles.card+' '+styles.preview} aria-label={t('معاينة المحتوى','Content preview')}><strong>{chosen?.name||t('معاينة المنشور','Post preview')}</strong><p>{draft.body||t('النص يظهر هنا…','Text goes here…')}</p>{mediaKind&&mediaPreview(urls,draft.kind==='video')}<small>{draft.link}</small></section>
  </div>:<section className={styles.card}>
   <div className={styles.filters}>
    <select aria-label={t('نوع المنشور','Post type')} value={kindFilter} onChange={e=>{setKindFilter(e.target.value);setPage(1);}}><option value="">{t('أي نوع','Any Type')}</option>{(format==='multimedia'?['text','link','image','carousel','video']:typeOptions).map(k=><option key={k} value={k}>{kinds[k]}</option>)}</select>
    <select aria-label={t('الصفحة','Page')} value={channelFilter} onChange={e=>{setChannelFilter(e.target.value);setPage(1);}}><option value="">{t('كل الصفحات والحسابات','All Pages / Accounts')}</option>{accounts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select>
    <select aria-label={t('حالة المنشور','Post status')} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">{t('كل الحالات','All statuses')}</option>{['draft','scheduled','sending','published','failed','ambiguous'].map(v=><option key={v} value={v}>{statusLabel(v,t)}</option>)}</select>
    <input type="search" maxLength={150} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} aria-label={t('بحث المنشورات','Search posts')} placeholder={t('بحث بالاسم أو النص أو المعرف','Name, text or ID')}/>
    <button className="btn" disabled={!search&&!channelFilter&&!kindFilter&&!status} onClick={()=>{setSearch('');setChannelFilter('');setKindFilter('');setStatus('');setPage(1);}}>{t('مسح الفلاتر','Clear filters')}</button>
    <button className="btn" disabled={posts.loading||busy} onClick={()=>void posts.reload()}>{t('تحديث','Refresh')}</button>
   </div>
   <div className={styles.tableWrap} aria-busy={posts.loading}><table><thead><tr>{['#',t('معرف الحملة','Campaign ID'),t('الاسم','Name'),t('نوع الحملة','Campaign Type'),t('الناشر','Publisher'),t('نوع المنشور','Post Type'),t('الإجراءات','Actions'),t('الحالة','Status'),t('موعد النشر','Scheduled At'),t('الخطأ','Error Message')].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {ready&&posts.data.items.map((p,i)=><tr key={p.id}><td>{(page-1)*size+i+1}</td><td>{p.id}</td><td>{p.name||'—'}</td><td>{t(descriptor.ar,descriptor.en)}</td><td>{p.channel_name}</td><td>{kinds[socialKind(p)]||socialKind(p)}</td><td><div className={styles.actions}>
     <button type="button" onClick={()=>setPreview(p)}>{t('عرض','View')}</button>
     {p.status==='draft'&&<><Link href={base+'/create?id='+encodeURIComponent(p.id)}>{t('تعديل','Edit')}</Link><button type="button" disabled={busy||!posts.data.publishingEnabled||!channels.data.some(c=>c.id===p.channel_id&&c.status==='active')} onClick={()=>{setError('');setScheduling(p);}}>{t('جدولة','Schedule')}</button></>}
     {p.status==='scheduled'&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm(t('إلغاء الجدولة وإعادة المنشور إلى مسودة؟','Cancel scheduling and return post to draft?')))void act(async()=>{await api('/commerce/social/'+p.id+'/cancel',{method:'POST',body:JSON.stringify({confirm:true})});await posts.reload();setNotice(t('تم إلغاء الجدولة','Schedule canceled'));});}}>{t('إلغاء الجدولة','Cancel schedule')}</button>}
     {['failed','ambiguous'].includes(p.status)&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm(p.status==='ambiguous'?t('هل تحققت من المزود وتأكدت أن المنشور لم يُنشر؟ سيتم إنشاء مسودة فقط.','Have you verified with the provider that the post was not published? This creates a draft only.'):t('إنشاء مسودة للمراجعة دون نشر؟','Create a review draft without publishing?')))void act(async()=>{await api('/commerce/social/'+p.id+'/retry-draft',{method:'POST',body:JSON.stringify({reconciled:true})});await posts.reload();setNotice(t('تم إنشاء مسودة للمراجعة','Review draft created'));});}}>{t('نسخ كمسودة','Copy as draft')}</button>}
    </div></td><td><span className={styles.status} data-status={p.status}>{statusLabel(p.status,t)}</span></td><td>{p.scheduled_at?new Date(p.scheduled_at).toLocaleString():'—'}</td><td>{p.error||'—'}</td></tr>)}
    {(!ready||!posts.data.items.length)&&<tr><td colSpan={10}>{posts.error?t('تعذر تحميل المنشورات','Unable to load posts'):!ready?t('جارٍ التحميل…','Loading…'):t('لا توجد منشورات مطابقة','No matching posts')}</td></tr>}
   </tbody></table></div>
   <footer className={styles.pagination}><select aria-label={t('الصفوف','Rows')} value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select><span>{ready?(total?(page-1)*size+1:0)+'–'+Math.min(page*size,total)+' / '+total:'—'}</span><button disabled={!ready||page<=1} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><button disabled={!ready||page>=pages} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></footer>
   {!posts.data.publishingEnabled&&ready&&<p className="muted">{t('النشر الخارجي معطل في هذه البيئة. حفظ المسودات والمعاينة متاحان.','External publishing is disabled in this environment. Drafts and preview are available.')}</p>}
  </section>}
  <Dialog open={!!preview} onClose={()=>setPreview(null)} title={t('معاينة المنشور','Post preview')}>{preview&&<div className={styles.preview}><strong>{preview.name||preview.channel_name}</strong><p>{preview.body}</p><p>{preview.link_url}</p><small>{statusLabel(preview.status,t)} · {preview.provider_id||'—'}</small>{mediaPreview(preview.media_urls,preview.kind==='video')}</div>}</Dialog>
  <Dialog open={!!scheduling} onClose={()=>{if(!busy)setScheduling(null);}} title={t('جدولة النشر','Schedule post')}>{scheduling&&<form className="stack" onSubmit={e=>{e.preventDefault();if(lock.current||!posts.data.publishingEnabled)return;const at=new Date(String(new FormData(e.currentTarget).get('at')));if(!Number.isFinite(at.getTime())||at.getTime()<=Date.now()){setError(t('اختر موعدًا مستقبليًا صالحًا','Choose a valid future time'));return;}if(!window.confirm(t('نشر هذا المنشور خارجيًا في الموعد المحدد؟','Publish this post externally at the selected time?')))return;void act(async()=>{await api('/commerce/social/'+scheduling.id+'/queue',{method:'POST',body:JSON.stringify({confirm:true,scheduledAt:at.toISOString()})});setScheduling(null);await posts.reload();setNotice(t('تمت الجدولة','Post scheduled'));});}}><p>{scheduling.name||scheduling.channel_name}</p>{error&&<p role="alert" className="notice error">{error}</p>}<label className="field">{t('الموعد حسب توقيت جهازك','Time in your device timezone')}<input type="datetime-local" name="at" required disabled={busy}/></label><button className="btn btn-primary" disabled={busy||!posts.data.publishingEnabled}>{t('تأكيد الجدولة','Confirm schedule')}</button></form>}</Dialog>
 </main>;
}
