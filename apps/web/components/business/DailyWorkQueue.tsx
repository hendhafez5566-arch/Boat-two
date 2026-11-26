'use client';
import Link from 'next/link';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { NavIcon } from '../product/NavIcon';
import styles from './daily-work-queue.module.css';
type Task = { id:string; title:string; contact_id:string; contact_name:string; due_at:string };
type QueueData = {items:Task[];total:number};
function Queue({period,title,owner,compact}:{period:string;title:string;owner:string;compact:boolean}){
 const {t,language}=useLocale();
 const query=new URLSearchParams({period,status:'open',ownerId:owner,limit:compact?'3':'8'});
 const tasks=useData<QueueData>(owner?'/crm/tasks?'+query:null,{items:[],total:0});
 const formatter=new Intl.DateTimeFormat(language==='ar'?'ar-EG':'en',{dateStyle:'short',timeStyle:'short'});
 const fmt=new Intl.NumberFormat(language==='ar'?'ar-EG':'en');
 const loaded=!!owner&&!tasks.loading&&!tasks.error;
 return <section className={styles.queue} data-period={period} aria-busy={!owner||tasks.loading}>
   <header><div><span className={styles.marker}/><h3>{title}</h3></div><strong>{loaded?fmt.format(tasks.data.total):'—'}</strong></header>
   {tasks.error?<p className={styles.error} role="alert">{tasks.error} <button type="button" onClick={()=>void tasks.reload()}>{t('إعادة المحاولة','Retry')}</button></p>:!loaded?<p className={styles.empty} role="status">{t('جارٍ التحميل…','Loading…')}</p>:tasks.data.items.length?<div className={styles.list}>{tasks.data.items.map(task=><Link className={styles.task} key={task.id} href={'/dashboard/crm?contact='+encodeURIComponent(task.contact_id)+'&section=tasks'}><div><strong>{task.title}</strong><small>{task.contact_name}</small></div><time dateTime={task.due_at}>{Number.isFinite(Date.parse(task.due_at))?formatter.format(new Date(task.due_at)):'—'}</time><span aria-hidden="true">‹</span></Link>)}</div>:<div className={styles.empty}><NavIcon name="check"/><span>{t('لا توجد متابعات مستحقة','No follow-ups due')}</span></div>}
   <Link className={styles.all} href={'/dashboard/crm/tasks?'+new URLSearchParams({period,ownerId:'me'})}>{t('عرض المتابعات','View follow-ups')} <span aria-hidden="true">‹</span></Link>
 </section>;
}
export function DailyWorkQueue({compact=false}:{compact?:boolean}){
 const {t}=useLocale();
 const member=useData<{currentUserId:string}>('/crm/workspace/members',{currentUserId:''});
 if(member.error)return <p className="notice error" role="alert">{member.error} <button type="button" className="btn" onClick={()=>void member.reload()}>{t('إعادة المحاولة','Retry')}</button></p>;
 if(!member.loading&&!member.data.currentUserId)return <p className={styles.empty}>{t('تعذر تحديد الموظف الحالي','Could not identify current employee')}</p>;
 return <div className={styles.queues} data-compact={compact}>
   <Queue period="overdue" title={t('المتأخرة','Overdue')} owner={member.data.currentUserId} compact={compact}/>
   <Queue period="today" title={t('المستحقة اليوم','Due today')} owner={member.data.currentUserId} compact={compact}/>
   {!compact&&<Queue period="upcoming" title={t('القادمة','Upcoming')} owner={member.data.currentUserId} compact={compact}/>}
 </div>;
}
