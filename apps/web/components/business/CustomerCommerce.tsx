'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useData} from './useData';
import {useLocale} from '../product/locale';
import {NavIcon} from '../product/NavIcon';
import design from './crm-design.module.css';
type RecordItem={id:string;status:string;name:string|null;created_at?:string;starts_at?:string;currency?:string;total_cents?:string|null};
type Records={orders:number;appointments:number;items:RecordItem[]};
export function useCustomerCommerce(contactId:string,enabled:boolean){
 const [kind,setKind]=useState<'orders'|'appointments'>('orders');const [page,setPage]=useState(1);
 const path=enabled?'/commerce/customer-records/'+encodeURIComponent(contactId)+'?'+new URLSearchParams({kind,page:String(page)}):null;
 const data=useData<Records|null>(path,null);
 return {kind,setKind,page,setPage,data,path};
}
export function CustomerCommerce({state}:{state:ReturnType<typeof useCustomerCommerce>}){
 const {t,language}=useLocale();const {kind,setKind,page,setPage,data,path}=state;
 const r=data.loadedPath===path&&!data.error?data.data:null;
 const fmt=(value:RecordItem)=>{if(!value.currency||!value.total_cents||!Number.isFinite(Number(value.total_cents)))return '—';try{return new Intl.NumberFormat(language==='ar'?'ar-EG':'en',{style:'currency',currency:value.currency}).format(Number(value.total_cents)/100)}catch{return value.total_cents+' '+value.currency}};
 const labels:Record<string,string>={new:t('جديد','New'),review:t('مراجعة','Review'),documents_required:t('مستندات مطلوبة','Documents needed'),processing:t('قيد التنفيذ','Processing'),confirmed:t('مؤكد','Confirmed'),completed:t('مكتمل','Completed'),cancelled:t('ملغى','Cancelled')};
 return <section className={design.customerCommerce}><h3><NavIcon name="commerce"/>{t('طلبات وحجوزات العميل','Customer orders and bookings')}</h3>
 <div className={design.commerceTabs}>{(['orders','appointments'] as const).map(key=><button type="button" key={key} aria-pressed={key===kind} onClick={()=>{setKind(key);setPage(1);}}><NavIcon name={key==='orders'?'commerce':'calendar'}/>{key==='orders'?t('الطلبات','Orders'):t('الحجوزات','Bookings')} {data.data?' · '+data.data[key]:''}</button>)}</div>
 {data.error?<p className="notice error" role="alert">{t('تعذر تحميل الطلبات والحجوزات','Could not load orders and bookings')} <button className="btn" onClick={()=>void data.reload()}>{t('إعادة المحاولة','Retry')}</button></p>:!r||data.loading?<p role="status">{t('جارٍ التحميل…','Loading…')}</p>:<>
 {!r.items.length?<p className="empty">{t('لا توجد سجلات لهذا العميل','No records for this customer')}</p>:r.items.map(item=><article key={item.id} className={design.commerceRecord}><span><NavIcon name={kind==='orders'?'commerce':'calendar'}/></span><div><strong>{item.name||t('بدون اسم','Untitled')}</strong><small>{new Date(item.created_at||item.starts_at||'').toLocaleString(language==='ar'?'ar-EG':'en')}</small></div>{kind==='orders'&&<strong><bdi>{fmt(item)}</bdi></strong>}<small data-status={item.status}>{labels[item.status]||item.status}</small>{kind==='orders'&&<Link className="btn" href={'/dashboard/commerce?tab=orders&order='+encodeURIComponent(item.id)}><NavIcon name="list"/>{t('فتح الطلب','Open order')}</Link>}</article>)}
 <footer><button type="button" className="btn" disabled={page<=1||data.loading} onClick={()=>setPage(page-1)}>{t('السابق','Previous')}</button><span>{page} / {Math.max(1,Math.ceil(r[kind]/25))}</span><button type="button" className="btn" disabled={page*25>=r[kind]||data.loading} onClick={()=>setPage(page+1)}>{t('التالي','Next')}</button></footer></>}
 </section>;
}
