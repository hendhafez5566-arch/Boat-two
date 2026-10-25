type Translate = (ar:string,en:string)=>string;
const columns: Record<string,[string,string]> = {
  day:['اليوم','Day'],name:['الاسم','Name'],type:['نوع القناة','Channel type'],full_name:['اسم الموظف','Employee'],
  inbound:['رسائل واردة','Inbound'],outbound:['رسائل صادرة','Outbound'],failed:['فشل','Failed'],messages:['الرسائل','Messages'],
  outbound_messages:['رسائل الموظف','Employee messages'],conversations:['المحادثات','Conversations'],status:['الحالة','Status'],handled_by:['مسؤول المحادثة','Handled by'],count:['العدد','Count'],
  pipeline:['مسار المبيعات','Sales pipeline'],stage:['مرحلة الصفقة','Deal stage'],currency:['العملة','Currency'],deals:['الصفقات','Deals'],value_cents:['قيمة الصفقات (بالعملة الرئيسية)','Deal value (major currency units)'],
  lifecycle:['مرحلة العميل','Customer stage'],contacts:['العملاء','Contacts'],id:['مرجع السجل','Record reference'],recipients:['الجمهور','Recipients'],skipped:['مستبعدون','Excluded'],sent:['أُرسلت','Sent'],delivered:['تم التسليم','Delivered'],read:['مقروءة','Read'],
  agent:['المساعد','Assistant'],model:['النموذج','Model'],runs:['مرات التشغيل','Runs'],input_tokens:['وحدات الإدخال','Input tokens'],output_tokens:['وحدات الإخراج','Output tokens'],estimated_cost_microusd:['التكلفة التقديرية (دولار أمريكي)','Estimated cost (USD)'],unpriced_runs:['تشغيلات بلا تسعير','Unpriced runs'],sessions:['الجلسات','Sessions'],tasks:['المتابعات','Follow-ups'],overdue:['متأخرة','Overdue'],
};
export function reportColumn(key:string,t:Translate) {return columns[key] ? t(...columns[key]) : t('بيانات إضافية','Additional data');}

/** Render integer minor units exactly; never round a bigint through Number. */
export function scaledAmount(value:string|number,digits:number,locale:string,currency:string) {
  if (!/^-?\d+$/.test(String(value))) return '—';
  const amount=BigInt(value), negative=amount<0n, magnitude=negative?-amount:amount, scale=10n**BigInt(digits);
  const integer=new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(magnitude/scale);
  const decimal=new Intl.NumberFormat(locale).formatToParts(1.1).find(part=>part.type==='decimal')?.value || '.';
  const fraction=new Intl.NumberFormat(locale,{useGrouping:false,minimumIntegerDigits:digits,maximumFractionDigits:0}).format(magnitude%scale);
  return `${negative?'−':''}${integer}${decimal}${fraction} ${currency}`;
}
export function reportValue(key:string,value:string|number|null,row:Record<string,string|number|null>,language:string,t:Translate):string {
  if (value===null || value===undefined) return '—';
  const locale=language==='ar'?'ar-EG':'en-US';
  if (key==='value_cents') return scaledAmount(value,2,locale,String(row.currency || ''));
  if (key==='estimated_cost_microusd') return scaledAmount(value,6,locale,'USD');
  if (key==='day' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(String(value)+'T00:00:00Z'));
  if (/^-?\d+$/.test(String(value)) && key!=='id') return new Intl.NumberFormat(locale).format(BigInt(value));
  if (key==='handled_by') return value==='agent'?t('موظف','Staff'):value==='bot'?t('البوت','Bot'):value==='ai'?t('مساعد ذكي','AI assistant'):String(value);
  if (key==='type') return ({web:t('الموقع','Website'),whatsapp:t('واتساب','WhatsApp'),facebook:t('ماسنجر','Messenger'),instagram:t('إنستغرام','Instagram')} as Record<string,string>)[String(value)] || String(value);
  return String(value);
}
