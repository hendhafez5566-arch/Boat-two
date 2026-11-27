'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../product/locale';
import {useEmbeddedAccount} from '../product/AccountWorkspaceContext';
import {NavIcon} from '../product/NavIcon';
import styles from './product-catalog.module.css';
type Channel={id:string;name:string;type:string};
const typeStyle=(type:string)=>{const v=type.toLowerCase();if(v.includes('whatsapp'))return ['whatsapp','whatsapp'];if(v.includes('facebook')||v.includes('messenger'))return ['facebook','facebook'];if(v.includes('instagram'))return ['instagram','instagram'];if(v.includes('telegram'))return ['telegram','telegram'];if(v.includes('web'))return ['chat','webchat'];if(v.includes('sms'))return ['phone','sms'];return ['channels','all'];};
function Mark({type}:{type:string}){const [icon,tone]=typeStyle(type);return <span className={styles.channelMark} data-tone={tone}>{icon==='instagram'?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>:<NavIcon name={icon}/>}</span>}
export default function CommerceChannelPicker({value,onChange,channels}:{value:string;onChange:(v:string)=>void;channels:Channel[]}){
 const {t}=useLocale(),embedded=useEmbeddedAccount();
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&open){setOpen(false);trigger.current?.focus()}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[open]);
 if(embedded)return null;
 const active=channels.find(c=>c.id===value),items=[{id:'',name:t('كل القنوات','All channels'),type:'all'},...channels].filter(c=>[c.name,c.type].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <div className={styles.channelPicker} ref={root}><button type="button" ref={trigger} className={styles.channelTrigger} aria-expanded={open} aria-label={t('قناة التنقل','Navigation channel')} title={t('الكتالوج مشترك؛ الاختيار يحدد سياق الانتقال فقط.','The catalog is shared; this only sets navigation context.')} onClick={()=>{setQuery('');setOpen(v=>!v)}}><Mark type={active?.type||'all'}/><span>{active?.name||(value?t('قناة غير متاحة','Unavailable channel'):t('كل القنوات','All channels'))}</span><NavIcon name="chevron"/></button>{open&&<div className={styles.channelOptions}>{channels.length>5&&<input autoFocus type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('بحث القنوات…','Search channels…')}/>}<div role="group" aria-label={t('القنوات','Channels')}>{items.map(c=><button key={c.id} type="button" aria-pressed={c.id===value} onClick={()=>{onChange(c.id);setOpen(false);trigger.current?.focus()}}><Mark type={c.type}/><span>{c.name}</span>{c.id===value&&<NavIcon name="check"/>}</button>)}</div>{!items.length&&<p>{t('لا توجد نتائج','No results')}</p>}</div>}</div>
}
