'use client';
import {useState} from 'react';
import {useLocale} from './locale';
const cities:Record<string,[string,string]>={
  'Africa/Cairo':['القاهرة — مصر','Cairo — Egypt'],'Asia/Riyadh':['الرياض — السعودية','Riyadh — Saudi Arabia'],'Asia/Dubai':['دبي — الإمارات','Dubai — UAE'],'Asia/Amman':['عمّان — الأردن','Amman — Jordan'],'Asia/Beirut':['بيروت — لبنان','Beirut — Lebanon'],'Asia/Baghdad':['بغداد — العراق','Baghdad — Iraq'],'Asia/Kuwait':['الكويت','Kuwait'],'Asia/Qatar':['الدوحة — قطر','Doha — Qatar'],'Africa/Casablanca':['الدار البيضاء — المغرب','Casablanca — Morocco'],'Africa/Tunis':['تونس','Tunis'],'Africa/Algiers':['الجزائر','Algiers'],'Europe/London':['لندن','London'],'Europe/Paris':['باريس','Paris'],'America/New_York':['نيويورك','New York'],'UTC':['التوقيت العالمي','UTC']};
export default function TimezonePicker({value,onChange}:{value:string;onChange:(zone:string)=>void}) {
  const {t,language}=useLocale();const [search,setSearch]=useState('');
  const supported=(Intl as typeof Intl & {supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf?.('timeZone') || [];
  const zones=Array.from(new Set([value,...Object.keys(cities),...supported]));
  const title=(zone:string)=>cities[zone]?t(...cities[zone]):zone.split('/').join(' — ').replace(/_/g,' ');
  let clock='';try{clock=new Intl.DateTimeFormat(language==='ar'?'ar-EG':'en-US',{timeZone:value,dateStyle:'medium',timeStyle:'short'}).format(new Date());}catch{}
  return <div className="field">
    <label>{t('ابحث بالمدينة أو المنطقة','Search city or region')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label>
    <label>{t('المنطقة الزمنية','Timezone')}<select required value={value} onChange={e=>onChange(e.target.value)}>{zones.filter(zone=>zone===value || (title(zone)+' '+zone).toLowerCase().includes(search.toLowerCase())).map(zone=><option key={zone} value={zone}>{title(zone)}</option>)}</select></label>
    <small>{t('الوقت المحلي الآن','Local time now')}: {clock || t('اختر منطقة صالحة','Choose a valid timezone')} · <bdi>{value}</bdi></small>
  </div>;
}
