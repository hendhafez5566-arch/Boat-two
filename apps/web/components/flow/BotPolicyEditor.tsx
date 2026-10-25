'use client';
import { BotPolicy } from '../../lib/flow-types';
import { useLocale } from '../product/locale';
import TimezonePicker from '../product/TimezonePicker';

export default function BotPolicyEditor({value={},onChange}:{value?:BotPolicy;onChange:(value:BotPolicy)=>void}) {
  const {t}=useLocale();
  const hours=value.businessHours??{enabled:false,timezone:'Africa/Cairo',schedule:{}};
  const setHours=(patch:Partial<typeof hours>)=>onChange({...value,businessHours:{...hours,...patch}});
  const days=[['mon','الإثنين','Monday'],['tue','الثلاثاء','Tuesday'],['wed','الأربعاء','Wednesday'],['thu','الخميس','Thursday'],['fri','الجمعة','Friday'],['sat','السبت','Saturday'],['sun','الأحد','Sunday']] as const;
  return <section className="stack"><h3>{t('السياسات العامة والوارد المشترك','General and shared inbox policies')}</h3>
    <label className="field">{t('انتهاء جلسة جمع البيانات (ساعات، 1–168)','Data collection session expiry (hours, 1–168)')}<input type="number" min={1} max={168} value={value.sessionHours??24} onChange={e=>onChange({...value,sessionHours:Math.max(1,Math.min(168,Number(e.target.value)||24))})}/></label>
    <label className="field">{t('رسالة عدم مطابقة اختيار العميل','Unmatched customer choice message')}<textarea maxLength={1000} value={value.noMatchText??''} onChange={e=>onChange({...value,noMatchText:e.target.value||undefined})}/></label>
    <p>{t('تظهر بدل إعادة نص القائمة عند إدخال اختيار غير صالح؛ يظل عدد المحاولات ومسار الرد البديل كما ضبطتهما.','Replaces the menu text for an invalid choice; the configured retries and fallback branch still apply.')}</p>
    <p className="notice">{t('الوارد المشترك: يتوقف البوت عند استلام موظف للمحادثة. لا تُفعّل هذه الإعدادات ردودًا أثناء عمل الموظف.','Shared inbox: the bot stops when an employee takes the conversation. These settings do not enable replies while an employee handles it.')}</p>
    <label><input type="checkbox" checked={hours.enabled} onChange={e=>setHours({enabled:e.target.checked})}/> {t('تشغيل البوت خلال ساعات العمل فقط','Run the bot only during business hours')}</label>
    <TimezonePicker value={hours.timezone} onChange={timezone=>setHours({timezone})}/>
    <p>{t('تؤجل البداية والرسائل المؤقتة إلى أول موعد عمل. الإجابة الواردة أثناء إغلاق جلسة سؤال لا تُحفظ؛ يُطلب من العميل إعادة إرسالها خلال الدوام.','New starts and delayed messages wait until the next opening. Replies to an existing question during closed hours are not saved; ask the customer to send them again during opening hours.')}</p>
    {days.map(([day,ar,en])=><fieldset className="smart-section" key={day}><legend>{t(ar,en)}</legend>{(hours.schedule[day]??[]).map((range,i)=><div className="form-actions" key={i}><label>{t('من','From')}<input type="time" value={range[0]} onChange={e=>setHours({schedule:{...hours.schedule,[day]:(hours.schedule[day]??[]).map((r,j)=>i===j?[e.target.value,r[1]]:r)}})}/></label><label>{t('إلى','To')}<input type="time" value={range[1]} onChange={e=>setHours({schedule:{...hours.schedule,[day]:(hours.schedule[day]??[]).map((r,j)=>i===j?[r[0],e.target.value]:r)}})}/></label><button type="button" onClick={()=>setHours({schedule:{...hours.schedule,[day]:(hours.schedule[day]??[]).filter((_,j)=>j!==i)}})}>{t('إزالة الفترة','Remove interval')}</button></div>)}{(hours.schedule[day]?.length??0)<6&&<button type="button" onClick={()=>setHours({schedule:{...hours.schedule,[day]:[...(hours.schedule[day]??[]),['09:00','17:00']]}})}>{t('إضافة فترة','Add interval')}</button>}</fieldset>)}
    <label className="field">{t('رسالة خارج الدوام (اختيارية)','Off-hours message (optional)')}<textarea maxLength={1000} value={hours.offHoursText??''} onChange={e=>setHours({offHoursText:e.target.value||undefined})}/></label>
    <p>{t('تُحفظ هذه السياسات مع المسودة ثم نسخة النشر، ولا تغير الجلسات المنشورة السابقة.','Policies are saved with the draft and published version, preserving older running sessions.')}</p>
  </section>;
}
