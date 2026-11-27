'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {useData} from '../business/useData';
import {useLocale} from '../product/locale';
import {NavIcon} from '../product/NavIcon';
import styles from './contact-picker.module.css';
type Contact={id:string;name:string;phone:string|null;email:string|null};
export default function ContactPicker({name='contact',disabled=false,onSelectionChange}:{name?:string;disabled?:boolean;onSelectionChange?:()=>void}){
 const {t}=useLocale();
 const [selected,setSelected]=useState<Contact|null>(null),[query,setQuery]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(1),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),listId=useId();
 const path=open&&!disabled?'/crm/contacts?archived=active&page='+page+'&limit=15&q='+encodeURIComponent(q):null;
 const results=useData<{items:Contact[];total:number}>(path,{items:[],total:0});
 const fresh=!!path&&results.loadedPath===path&&q===query.trim()&&!results.loading&&!results.error;
 const rows=fresh?results.data.items:[];
 useEffect(()=>{const timer=window.setTimeout(()=>{setQ(query.trim());setPage(1);setActive(0)},250);return()=>window.clearTimeout(timer)},[query]);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 useEffect(()=>{input.current?.setCustomValidity(selected?'':t('اختر عميلًا من نتائج البحث.','Choose a customer from the search results.'))},[selected,t]);
 const label=(c:Contact)=>c.name&&!/^(visitor|زائر)$/i.test(c.name)?c.name:t('زائر','Visitor')+' #'+c.id.slice(0,6);
 function choose(c:Contact){setSelected(c);setQuery('');setOpen(false);input.current?.setCustomValidity('');onSelectionChange?.();input.current?.focus()}
 function clear(){setSelected(null);setQuery('');setOpen(true);input.current?.setCustomValidity(t('اختر عميلًا من نتائج البحث.','Choose a customer from the search results.'));onSelectionChange?.();input.current?.focus()}
 return <div className={styles.root} ref={root}><label htmlFor={listId+'-input'}>{t('العميل','Customer')}</label><div className={styles.field} data-selected={!!selected}><NavIcon name={selected?'user':'search'}/><input ref={input} id={listId+'-input'} role="combobox" aria-expanded={open&&!disabled} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&rows[active]?listId+'-'+active:undefined} autoComplete="off" required disabled={disabled} readOnly={!!selected} value={selected?label(selected)+(selected.phone?' · '+selected.phone:''):query} maxLength={selected?undefined:100} placeholder={t('الاسم أو الهاتف أو البريد…','Name, phone or email…')} onFocus={()=>{if(!selected&&!disabled)setOpen(true)}} onChange={e=>{setQuery(e.target.value);setOpen(true)}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);e.preventDefault()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1))))}else if(e.key==='Enter'&&open&&!selected){e.preventDefault();if(rows[active])choose(rows[active])}}}/>{selected&&<button type="button" disabled={disabled} onClick={clear} title={t('تغيير العميل','Change customer')} aria-label={t('تغيير العميل','Change customer')}><NavIcon name="close"/></button>}</div><input type="hidden" name={name} value={selected?.id??''}/>
 {open&&!disabled&&!selected&&<div className={styles.popup}><div className={styles.caption}>{!fresh&&!results.error?t('جارٍ البحث…','Searching…'):results.error?t('تعذر تحميل العملاء','Could not load customers'):t('نتائج البحث','Search results')+' · '+results.data.total.toLocaleString()}</div>{results.error&&<button type="button" onClick={()=>void results.reload()}>{t('إعادة المحاولة','Retry')}</button>}<div id={listId} role="listbox" className={styles.results}>{rows.map((c,i)=><button id={listId+'-'+i} role="option" aria-selected={active===i} key={c.id} type="button" onMouseEnter={()=>setActive(i)} onClick={()=>choose(c)}><span className={styles.avatar}><NavIcon name="user"/></span><span><strong>{label(c)}</strong><small dir="auto">{[c.phone,c.email].filter(Boolean).join(' · ')||t('لا توجد بيانات اتصال','No contact details')}</small></span><NavIcon name="chevron"/></button>)}</div>{fresh&&!rows.length&&<p>{t('لا يوجد عميل مطابق','No matching customers')}</p>}{fresh&&results.data.total>15&&<div className={styles.paging}><button type="button" disabled={page===1} onClick={()=>{setPage(v=>v-1);setActive(0)}}>{t('السابق','Previous')}</button><small>{page} / {Math.ceil(results.data.total/15)}</small><button type="button" disabled={page*15>=results.data.total} onClick={()=>{setPage(v=>v+1);setActive(0)}}>{t('التالي','Next')}</button></div>}</div>}
 </div>
}
