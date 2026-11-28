'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from '../../components/product/locale';
import styles from './platform.module.css';
type Policy={selfRegistration:boolean;trialPlanCode:string;trialDays:number;updatedAt?:string|null};
export default function RegistrationPolicy({request,plans,canWrite,verification,onDirty,onSaved}:{request:(path:string,body?:unknown,method?:string)=>Promise<unknown>;plans:{code:string;name:string;is_active:boolean}[];canWrite:boolean;verification:React.ReactNode;onDirty:()=>void;onSaved:()=>void}){
 const {t}=useLocale();const [policy,setPolicy]=useState<Policy|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);const lock=useRef(false);
 useEffect(()=>{let active=true;void request('/registration-policy').then(r=>{if(active)setPolicy(r as Policy);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(timer);},[notice]);
 return <section className={styles.panel}><h2>{t('سياسة تسجيل الشركات','Company registration policy')}</h2>
 <p className="notice">{t('تنطبق هذه الإعدادات على التسجيلات الجديدة فقط. لا تتغير اشتراكات الشركات الحالية. صفر يوم يعني البدء بالباقة المجانية.','These settings affect new registrations only. Existing subscriptions are unchanged. Zero days starts on Free.')}</p>
 {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
 {policy?<form className="stack" onChange={onDirty} onSubmit={async e=>{e.preventDefault();if(lock.current||!canWrite)return;const f=new FormData(e.currentTarget);lock.current=true;setBusy(true);setError('');try{const next={selfRegistration:f.get('enabled')==='on',trialPlanCode:String(f.get('plan')),trialDays:Number(f.get('days'))};await request('/registration-policy',{...next,reason:f.get('reason')},'PATCH');setPolicy(next);onSaved();setNotice(t('تم حفظ سياسة التسجيل','Registration policy saved'));}catch(err){setError((err as Error).message);}finally{lock.current=false;setBusy(false);}}}>
 <label><input name="enabled" type="checkbox" defaultChecked={policy.selfRegistration} disabled={!canWrite}/>{t('السماح بالتسجيل الذاتي','Allow self-registration')}</label>
 <div className="form-grid"><label>{t('باقة الفترة التجريبية','Trial plan')}<select name="plan" defaultValue={policy.trialPlanCode} disabled={!canWrite}>{plans.filter(p=>p.is_active).map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label><label>{t('مدة التجربة بالأيام','Trial days')}<input name="days" type="number" min={0} max={365} required defaultValue={policy.trialDays} disabled={!canWrite}/></label></div>
 {canWrite&&<>{verification}<label>{t('سبب التغيير','Change reason')}<textarea name="reason" required minLength={10} maxLength={1000}/></label><button className="btn btn-primary" disabled={busy}>{t('حفظ سياسة التسجيل','Save registration policy')}</button></>}</form>:!error&&<p role="status">{t('جارٍ التحميل…','Loading…')}</p>}</section>;
}
