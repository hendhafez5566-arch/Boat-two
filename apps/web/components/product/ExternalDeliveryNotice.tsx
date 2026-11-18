'use client';
import {useData} from '../business/useData';
import {useLocale} from './locale';

/** Availability only, never a claim of provider approval or successful delivery. */
export function ExternalDeliveryNotice({publishing=false}:{publishing?:boolean}) {
  const {t}=useLocale();
  const state=useData<{externalEnabled:boolean}|null>('/integrations/capabilities',null);
  if(state.data?.externalEnabled===true&&!state.loading&&!state.error)return null;
  return <p className="notice" role="status" aria-label={t('حالة الإرسال الخارجي','External delivery availability')}>
    {state.error?t('تعذر التحقق من تفعيل الإرسال الخارجي. حفظ المسودة لا يعني إرسالها.','External delivery availability could not be verified. Saving a draft does not mean it was sent.'):
      state.loading?t('جارٍ التحقق من حالة الإرسال الخارجي…','Checking external delivery availability…'):
      publishing?t('النشر الخارجي معطّل في هذه البيئة. يمكنك إعداد المحتوى وحفظ المسودات؛ يتطلب النشر حسابًا مرتبطًا ومصرحًا به وتفعيل الخدمة.','External publishing is disabled in this environment. You can prepare content and save drafts; publishing requires an authorized connected account and service activation.'):
      t('إرسال رسائل القنوات الخارجية معطّل في هذه البيئة. حفظ الحملات أو جدولتها لا يعني تسليم رسائل؛ الإرسال الفعلي يتطلب ربط القناة وتفعيل الخدمة.','External channel messaging is disabled in this environment. Saving or scheduling campaigns does not mean messages were delivered; actual sending requires a connected channel and service activation.')}
  </p>;
}
