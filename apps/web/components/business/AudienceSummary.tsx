'use client';
import { useLocale } from '../product/locale';
export type Audience = {
  matched: number;
  eligible: number;
  excluded: number;
  reasons: { code: string; count: number }[];
  channelPolicyEnabled: boolean;
};
export default function AudienceSummary({ audience }: { audience: Audience }) {
  const { t } = useLocale();
  const labels: Record<string, string> = {
    not_linked: t(
      'لا توجد هوية للعميل على القناة المختارة',
      'No contact identity on the selected channel',
    ),
    opted_out: t('سحب الموافقة على الرسائل التسويقية', 'Opted out of marketing'),
    no_consent: t(
      'لا توجد موافقة تسويقية موثقة لهذه القناة',
      'No documented marketing consent for this channel',
    ),
  };
  return (
    <div className="notice stack" role="status">
      <strong>
        {t('المطابقون للتصفية', 'Matching filters')}: {audience.matched} ·{' '}
        {t('مؤهلون بحسب الربط والموافقة', 'Eligible by identity and consent')}: {audience.eligible}{' '}
        · {t('غير مؤهلين', 'Ineligible')}: {audience.excluded}
      </strong>
      <ul>
        {audience.reasons?.map((reason) => (
          <li key={reason.code}>
            {labels[reason.code] || t('سبب أهلية آخر', 'Other eligibility reason')}: {reason.count}
          </li>
        ))}
      </ul>
      {!audience.channelPolicyEnabled && (
        <p>
          {t(
            'الإرسال التسويقي معطل لهذه القناة. فعّله من سياسة التسليم قبل الجدولة.',
            'Marketing is disabled on this channel. Enable its delivery policy before scheduling.',
          )}
        </p>
      )}
      <div className="form-actions">
        <a className="btn" href="/dashboard/crm">
          {t('مراجعة هوية العميل وموافقته', 'Review customer identity and consent')}
        </a>
        <a className="btn" href="/dashboard/delivery">
          {t('إعدادات الإرسال', 'Delivery settings')}
        </a>
      </div>
      <small>
        {t(
          'هذه مراجعة حالية وليست ضمان تسليم. تُراجع الموافقة وسياسة القناة والباقة وحد التكرار والمحادثة المتاحة وقت الإرسال؛ العملاء المؤرشفون لا تُرسل لهم الرسائل.',
          'This is a current review, not a delivery guarantee. Consent, channel policy, plan, frequency limits and conversation availability are rechecked at send time; archived contacts are excluded then.',
        )}
      </small>
    </div>
  );
}
