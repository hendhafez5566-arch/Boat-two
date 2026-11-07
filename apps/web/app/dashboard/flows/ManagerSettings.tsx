'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import styles from './manager.module.css';

type Settings = {
  general: {
    chatHumanEmail: string;
    noMatchReply: boolean;
    botRepliesWhileAgentOnMobile: boolean;
    getStartedEnabled: boolean;
    getStartedFrequency: 'every_time' | 'once_a_day';
  };
  webhook: Record<
    | 'incomingMessage'
    | 'outgoingMessage'
    | 'messageStatus'
    | 'conversationStatus'
    | 'newSubscriber'
    | 'crmStage'
    | 'followup',
    boolean
  >;
  businessHour: {
    timezone: string;
    offDays: string[];
    schedule: { day: string; start: string; end: string }[];
    disableBotDuringHours: boolean;
    disableAiDuringHours: boolean;
    specialBotEnabled: boolean;
    specialBotFlowId: string | null;
  };
  sharedInbox: {
    signatureEnabled: boolean;
    inputFlowSessionExpiryMinutes: number | null;
    humanSessionExpiryMinutes: number | null;
    failedDeliveryLabelId: string | null;
  };
  autoResponder: {
    mailchimpListId: string | null;
    brevoListId: string | null;
    activeCampaignListId: string | null;
    mauticListId: string | null;
  };
  google: { sheetsListId: string | null; contactsAccountId: string | null };
  email: { apiId: string | null; subject: string; content: string };
  sms: { apiId: string | null; content: string };
};

const arabicLabels: Record<string, string> = {
  General: 'عام',
  Webhook: 'الويب هوك',
  'Business Hour': 'ساعات العمل',
  'Shared Inbox': 'صندوق الوارد المشترك',
  'Auto Responder': 'الرد الآلي',
  Google: 'جوجل',
  Email: 'البريد الإلكتروني',
  SMS: 'الرسائل النصية',
  'CHAT WITH HUMAN EMAIL': 'بريد التواصل مع موظف',
  'GET STARTED MESSAGE FREQUENCY LIMIT': 'الحد الزمني لرسالة بدء المحادثة',
  'Every Time': 'كل مرة',
  'Once a day': 'مرة يوميًا',
  TIMEZONE: 'المنطقة الزمنية',
  'OFF DAY': 'أيام العطلة',
  DAY: 'اليوم',
  START: 'البداية',
  END: 'النهاية',
  'Session Expiry Time': 'مدة انتهاء الجلسة',
  'Session Expiry Time Configuration': 'إعداد مدة انتهاء الجلسة',
  'EMAIL API': 'مزود البريد الإلكتروني',
  'EMAIL SUBJECT': 'عنوان البريد الإلكتروني',
  'EMAIL CONTENT': 'محتوى البريد الإلكتروني',
  'SMS API': 'مزود الرسائل النصية',
  'SMS CONTENT': 'محتوى الرسائل النصية',
  'GOOGLE SHEET LIST': 'قائمة جداول جوجل',
  'GOOGLE CONTACTS ACCOUNT': 'حساب جهات اتصال جوجل',
  'Select timezone': 'اختر المنطقة الزمنية',
  'NO MATCH REPLY · Enabled': 'تفعيل الرد عند عدم التطابق',
  'BOT REPLIES WHILE AGENT ON MOBILE APP · Enabled':
    'تفعيل رد البوت أثناء استخدام الموظف لتطبيق الهاتف',
  'GET STARTED MESSAGE · Enabled': 'تفعيل رسالة بدء المحادثة',
  'ENABLE SIGNATURE MESSAGE · Enabled': 'تفعيل توقيع الرسائل',
  'ENABLE SPECIAL BOT · Enabled': 'تفعيل البوت الخاص',
  'INPUT FLOW SESSION EXPIRY TIME (IN MINUTE)': 'مدة جلسة تدفق الإدخال بالدقائق',
  'CHAT WITH HUMAN SESSION EXPIRY TIME (IN MINUTE)': 'مدة جلسة التواصل مع الموظف بالدقائق',
  'ADD LABEL FOR UNSUCCESSFUL MESSAGE DELIVERY': 'إضافة تسمية عند فشل تسليم الرسالة',
  'Chat with human action email address and no-match reply':
    'بريد التواصل مع موظف والرد عند عدم التطابق',
  'Set-up your business hour, timezone and off-days.':
    'حدد ساعات العمل والمنطقة الزمنية وأيام العطلة.',
  'Shared Inbox Signature Message Configuration': 'إعداد توقيع رسائل صندوق الوارد المشترك',
  'Send incoming or outgoing messages to external webhook URLs':
    'إرسال الرسائل الواردة والصادرة إلى روابط ويب هوك خارجية',
  'Disable bot reply during business hours': 'إيقاف رد البوت أثناء ساعات العمل',
  'Disable AI assistant during business hours': 'إيقاف مساعد الذكاء الاصطناعي أثناء ساعات العمل',
  'Special Bot during business off hours': 'بوت خاص خارج ساعات العمل',
  'Set-up your business off hour special bot reply': 'إعداد رد البوت الخاص خارج ساعات العمل',
  'Send collected emails to auto responder accounts':
    'إرسال عناوين البريد المجمعة إلى حسابات الرد الآلي',
  'Google Sheet': 'جداول جوجل',
  'Send collected subscriber to google sheet': 'إرسال بيانات المشتركين إلى جداول جوجل',
  'Send automated email to subscribers sharing email address through bot':
    'إرسال بريد تلقائي للمشتركين الذين يشاركون بريدهم عبر البوت',
  'Send automated sms to subscribers sharing phone number through bot':
    'إرسال رسالة نصية تلقائية للمشتركين الذين يشاركون أرقامهم عبر البوت',
  Sunday: 'الأحد',
  Monday: 'الاثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',
  'MAILCHIMP LIST': 'قائمة Mailchimp',
  'BREVO LIST': 'قائمة Brevo',
  'ACTIVECAMPAIGN LIST': 'قائمة ActiveCampaign',
  'MAUTIC LIST': 'قائمة Mautic',
  'TRIGGER WEBHOOK FOR INCOMING MESSAGE · Enabled': 'تفعيل ويب هوك عند الرسائل الواردة',
  'TRIGGER WEBHOOK FOR OUTGOING MESSAGE · Enabled': 'تفعيل ويب هوك عند الرسائل الصادرة',
  'TRIGGER WEBHOOK FOR MESSAGE STATUS CHANGE · Enabled': 'تفعيل ويب هوك عند تغيير حالة الرسالة',
  'TRIGGER WEBHOOK FOR CONVERSATION STATUS CHANGE · Enabled':
    'تفعيل ويب هوك عند تغيير حالة المحادثة',
  'TRIGGER WEBHOOK FOR NEW SUBSCRIBER · Enabled': 'تفعيل ويب هوك عند مشترك جديد',
  'TRIGGER WEBHOOK FOR CRM STAGE CHANGE · Enabled': 'تفعيل ويب هوك عند تغيير مرحلة العميل',
  'TRIGGER WEBHOOK FOR FOLLOW-UP / REMINDER · Enabled': 'تفعيل ويب هوك عند المتابعة أو التذكير',
};

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tabList = [
  ['general', 'General'],
  ['webhook', 'Webhook'],
  ['businessHour', 'Business Hour'],
  ['sharedInbox', 'Shared Inbox'],
  ['autoResponder', 'Auto Responder'],
  ['google', 'Google'],
  ['email', 'Email'],
  ['sms', 'SMS'],
] as const;
const defaults: Settings = {
  general: {
    chatHumanEmail: '',
    noMatchReply: false,
    botRepliesWhileAgentOnMobile: true,
    getStartedEnabled: true,
    getStartedFrequency: 'every_time',
  },
  webhook: {
    incomingMessage: false,
    outgoingMessage: false,
    messageStatus: false,
    conversationStatus: false,
    newSubscriber: false,
    crmStage: false,
    followup: false,
  },
  businessHour: {
    timezone: '',
    offDays: [],
    schedule: days.map((day) => ({ day, start: '', end: '' })),
    disableBotDuringHours: false,
    disableAiDuringHours: false,
    specialBotEnabled: false,
    specialBotFlowId: null,
  },
  sharedInbox: {
    signatureEnabled: false,
    inputFlowSessionExpiryMinutes: null,
    humanSessionExpiryMinutes: null,
    failedDeliveryLabelId: null,
  },
  autoResponder: {
    mailchimpListId: null,
    brevoListId: null,
    activeCampaignListId: null,
    mauticListId: null,
  },
  google: { sheetsListId: null, contactsAccountId: null },
  email: { apiId: null, subject: '', content: '' },
  sms: { apiId: null, content: '' },
};

export default function ManagerSettings({
  channelId,
  canManage,
  onSaved,
}: {
  channelId: string | null;
  canManage: boolean;
  onSaved?: () => void;
}) {
  const { t } = useLocale();
  const labelText = (label: string) => t(arabicLabels[label] || label, label);
  const request = useRef(0);
  const [active, setActive] = useState<(typeof tabList)[number][0]>('general');
  const [draft, setDraft] = useState<Settings>(defaults);
  const [saved, setSaved] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const load = useCallback(async () => {
    const version = ++request.current;
    setReady(false);
    setDraft(defaults);
    setSaved(defaults);
    setNotice('');
    if (!channelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<Partial<Settings>>(`/channels/${channelId}/bot-settings`);
      if (version !== request.current) return;
      const next = {
        ...defaults,
        ...data,
        general: { ...defaults.general, ...data.general },
        webhook: { ...defaults.webhook, ...data.webhook },
        businessHour: {
          ...defaults.businessHour,
          ...data.businessHour,
          schedule:
            data.businessHour?.schedule?.length === 7
              ? data.businessHour.schedule
              : defaults.businessHour.schedule,
        },
        sharedInbox: { ...defaults.sharedInbox, ...data.sharedInbox },
        autoResponder: { ...defaults.autoResponder, ...data.autoResponder },
        google: { ...defaults.google, ...data.google },
        email: { ...defaults.email, ...data.email },
        sms: { ...defaults.sms, ...data.sms },
      } as Settings;
      setReady(true);
      setDraft(next);
      setSaved(next);
    } catch (e) {
      if (version !== request.current) return;
      setError(
        e instanceof Error
          ? e.message
          : t('تعذر تحميل إعدادات البوت.', 'Could not load bot settings.'),
      );
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [channelId, t]);
  useEffect(() => {
    void load();
  }, [load]);
  const put = <K extends keyof Settings>(group: K, key: keyof Settings[K], value: unknown) =>
    setDraft((s) => ({ ...s, [group]: { ...s[group], [key]: value } }));
  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { type?: string; placeholder?: string } = {},
  ) => (
    <label className={styles.settingField}>
      <span>{labelText(label)}</span>
      <input
        type={opts.type || 'text'}
        value={value}
        placeholder={opts.placeholder ? labelText(opts.placeholder) : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  const toggle = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    blocked = false,
  ) => (
    <label className={`${styles.settingToggle} ${blocked ? styles.settingBlocked : ''}`}>
      <span className={styles.settingToggleText}>
        {labelText(label)}
        {blocked && (
          <small>
            {t(
              'غير متاح: يحتاج إلى تكامل خادمي لم يُنفذ بعد.',
              'Unavailable: required server integration is not implemented.',
            )}
          </small>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={!canManage || blocked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
  async function save() {
    if (!channelId || busy || loading || !canManage || !ready) return;
    const version = request.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Settings>(`/channels/${channelId}/bot-settings`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      });
      if (version !== request.current) return;
      setDraft(result as Settings);
      setSaved(result as Settings);
      setNotice(
        t(
          'حُفظت مسودة الإعدادات. لم تُفعّل في محرك التشغيل.',
          'Settings draft saved. Runtime behavior has not been activated.',
        ),
      );
      onSaved?.();
    } catch (e) {
      if (version !== request.current) return;
      setError(
        e instanceof Error ? e.message : t('تعذر حفظ الإعدادات.', 'Could not save settings.'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function activateSupported() {
    if (!channelId || dirty || loading || busy || !canManage || !ready) return;
    const version = request.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/channels/${channelId}/bot-settings/activate`, {
        method: 'POST',
        body: JSON.stringify(saved),
      });
      if (version !== request.current) return;
      setNotice(
        t(
          'فُعّلت الخيارات المدعومة فقط: رد عدم التطابق، تشغيل رسالة البداية، إيقاف البوت أثناء ساعات العمل، ومهلة جلسة الإدخال. باقي الحقول مسودة.',
          'Only supported options activated: no-match, get-started enablement, bot suppression during business hours, and input session expiry. Other fields remain drafts.',
        ),
      );
    } catch (e) {
      if (version === request.current)
        setError(e instanceof Error ? e.message : t('تعذر التفعيل', 'Activation failed'));
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    setDraft(saved);
    setError('');
    setNotice('');
  }
  const subhead = (title: string, desc: string) => (
    <>
      <h3 className={styles.settingsTitle}>{labelText(title)}</h3>
      <p className={styles.settingsDescription}>{labelText(desc)}</p>
    </>
  );
  return (
    <form
      id="bot-manager-settings-form"
      className={styles.settingsCard}
      aria-label={t('إعدادات البوت', 'Bot settings')}
      aria-busy={loading || busy}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {(error || notice) && (
        <p
          className={error ? styles.settingsError : styles.settingsNotice}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
        </p>
      )}
      <nav
        className={styles.settingsTabs}
        role="tablist"
        aria-label={t('أقسام إعدادات البوت', 'Bot settings sections')}
      >
        {tabList.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            onClick={() => setActive(key)}
          >
            {labelText(label)}
          </button>
        ))}
      </nav>
      <p className={styles.settingsNotice} role="note">
        {t(
          'الحفظ يحتفظ بالمسودة. التفعيل يطبق أربعة خيارات مدعومة فقط؛ التكاملات الأخرى غير مكتملة.',
          'Saving retains a draft. Activation applies only four supported options; other integrations remain incomplete.',
        )}
      </p>
      <fieldset
        disabled={!canManage || loading || busy || !channelId || !ready}
        className={styles.settingsBody}
      >
        {active === 'general' && (
          <div className={styles.settingsNarrow}>
            {subhead('General', 'Chat with human action email address and no-match reply')}
            {field(
              'CHAT WITH HUMAN EMAIL',
              draft.general.chatHumanEmail,
              (v) => put('general', 'chatHumanEmail', v),
              { type: 'email' },
            )}
            {toggle(
              'NO MATCH REPLY · Enabled',
              draft.general.noMatchReply,
              (v) => put('general', 'noMatchReply', v),
              false,
            )}
            {toggle(
              'BOT REPLIES WHILE AGENT ON MOBILE APP · Enabled',
              draft.general.botRepliesWhileAgentOnMobile,
              (v) => put('general', 'botRepliesWhileAgentOnMobile', v),
              true,
            )}
            {toggle(
              'GET STARTED MESSAGE · Enabled',
              draft.general.getStartedEnabled,
              (v) => put('general', 'getStartedEnabled', v),
              false,
            )}
            <fieldset
              className={styles.frequency}
              disabled={!canManage || !draft.general.getStartedEnabled}
            >
              <legend>{labelText('GET STARTED MESSAGE FREQUENCY LIMIT')}</legend>
              <label>
                <input
                  type="radio"
                  name="getStartedFrequency"
                  checked={draft.general.getStartedFrequency === 'every_time'}
                  onChange={() => put('general', 'getStartedFrequency', 'every_time')}
                />
                {labelText('Every Time')}
              </label>
              <label>
                <input
                  type="radio"
                  name="getStartedFrequency"
                  checked={draft.general.getStartedFrequency === 'once_a_day'}
                  onChange={() => put('general', 'getStartedFrequency', 'once_a_day')}
                />
                {labelText('Once a day')}
              </label>
            </fieldset>
          </div>
        )}
        {active === 'webhook' && (
          <div className={styles.settingsNarrow}>
            {subhead('Webhook', 'Send incoming or outgoing messages to external webhook URLs')}
            {Object.entries({
              incomingMessage: 'TRIGGER WEBHOOK FOR INCOMING MESSAGE',
              outgoingMessage: 'TRIGGER WEBHOOK FOR OUTGOING MESSAGE',
              messageStatus: 'TRIGGER WEBHOOK FOR MESSAGE STATUS CHANGE',
              conversationStatus: 'TRIGGER WEBHOOK FOR CONVERSATION STATUS CHANGE',
              newSubscriber: 'TRIGGER WEBHOOK FOR NEW SUBSCRIBER',
              crmStage: 'TRIGGER WEBHOOK FOR CRM STAGE CHANGE',
              followup: 'TRIGGER WEBHOOK FOR FOLLOW-UP / REMINDER',
            }).map(([k, label]) =>
              toggle(
                `${label} · Enabled`,
                draft.webhook[k as keyof Settings['webhook']],
                (v) => put('webhook', k as keyof Settings['webhook'], v),
                true,
              ),
            )}
          </div>
        )}
        {active === 'businessHour' && (
          <div className={styles.settingsWide}>
            {subhead('Business Hour', 'Set-up your business hour, timezone and off-days.')}
            <div className={styles.settingsTwoCol}>
              {field(
                'TIMEZONE',
                draft.businessHour.timezone,
                (v) => put('businessHour', 'timezone', v),
                { placeholder: 'Select timezone' },
              )}
              <label className={styles.settingField}>
                <span>{labelText('OFF DAY')}</span>
                <select
                  multiple
                  value={draft.businessHour.offDays}
                  onChange={(e) =>
                    put(
                      'businessHour',
                      'offDays',
                      Array.from(e.target.selectedOptions).map((o) => o.value),
                    )
                  }
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {labelText(d)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.scheduleScroll}>
              <table className={styles.scheduleTable}>
                <thead>
                  <tr>
                    <th>{labelText('DAY')}</th>
                    <th>{labelText('START')}</th>
                    <th>{labelText('END')}</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.businessHour.schedule.map((r, i) => (
                    <tr key={r.day}>
                      <th scope="row">{labelText(r.day)}</th>
                      <td>
                        <input
                          aria-label={`${r.day} ${labelText('START')}`}
                          type="time"
                          value={r.start}
                          onChange={(e) =>
                            put(
                              'businessHour',
                              'schedule',
                              draft.businessHour.schedule.map((x, j) =>
                                i === j ? { ...x, start: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${r.day} ${labelText('END')}`}
                          type="time"
                          value={r.end}
                          onChange={(e) =>
                            put(
                              'businessHour',
                              'schedule',
                              draft.businessHour.schedule.map((x, j) =>
                                i === j ? { ...x, end: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.settingsTwoCol}>
              {toggle(
                'Disable bot reply during business hours',
                draft.businessHour.disableBotDuringHours,
                (v) => put('businessHour', 'disableBotDuringHours', v),
                false,
              )}
              {toggle(
                'Disable AI assistant during business hours',
                draft.businessHour.disableAiDuringHours,
                (v) => put('businessHour', 'disableAiDuringHours', v),
                true,
              )}
            </div>
            <div className={styles.specialBot}>
              {subhead(
                'Special Bot during business off hours',
                'Set-up your business off hour special bot reply',
              )}
              {toggle(
                'ENABLE SPECIAL BOT · Enabled',
                draft.businessHour.specialBotEnabled,
                (v) => put('businessHour', 'specialBotEnabled', v),
                true,
              )}
            </div>
          </div>
        )}
        {active === 'sharedInbox' && (
          <div className={styles.settingsNarrow}>
            {subhead('Shared Inbox', 'Shared Inbox Signature Message Configuration')}
            {toggle(
              'ENABLE SIGNATURE MESSAGE · Enabled',
              draft.sharedInbox.signatureEnabled,
              (v) => put('sharedInbox', 'signatureEnabled', v),
              true,
            )}
            <div className={styles.settingsSection}>
              {subhead('Session Expiry Time', 'Session Expiry Time Configuration')}
              {field(
                'INPUT FLOW SESSION EXPIRY TIME (IN MINUTE)',
                draft.sharedInbox.inputFlowSessionExpiryMinutes?.toString() || '',
                (v) =>
                  put('sharedInbox', 'inputFlowSessionExpiryMinutes', v === '' ? null : Number(v)),
                { type: 'number' },
              )}
              {field(
                'CHAT WITH HUMAN SESSION EXPIRY TIME (IN MINUTE)',
                draft.sharedInbox.humanSessionExpiryMinutes?.toString() || '',
                (v) => put('sharedInbox', 'humanSessionExpiryMinutes', v === '' ? null : Number(v)),
                { type: 'number' },
              )}
              <label className={styles.settingField}>
                <span>{labelText('ADD LABEL FOR UNSUCCESSFUL MESSAGE DELIVERY')}</span>
                <select disabled>
                  <option>{t('لا توجد تسميات متاحة', 'No labels available')}</option>
                </select>
                <small>
                  {t(
                    'موقوف حتى يتوفر مصدر تسميات مرتبط بهذا الحساب.',
                    'Unavailable until a channel label source is connected.',
                  )}
                </small>
              </label>
            </div>
          </div>
        )}
        {active === 'autoResponder' && (
          <div className={styles.settingsNarrow}>
            {subhead('Auto Responder', 'Send collected emails to auto responder accounts')}
            {(
              ['mailchimpListId', 'brevoListId', 'activeCampaignListId', 'mauticListId'] as const
            ).map((k, i) => (
              <label className={styles.settingField} key={k}>
                <span>
                  {labelText(
                    ['MAILCHIMP LIST', 'BREVO LIST', 'ACTIVECAMPAIGN LIST', 'MAUTIC LIST'][i],
                  )}
                </span>
                <select disabled>
                  <option>
                    {draft.autoResponder[k] || t('لا يوجد حساب متصل', 'No connected account')}
                  </option>
                </select>
                <small>
                  {t(
                    'غير متاح: لا توجد قوائم مزود متصلة بهذا الحساب.',
                    'Unavailable: no provider lists are connected to this account.',
                  )}
                </small>
              </label>
            ))}
          </div>
        )}
        {active === 'google' && (
          <div className={styles.settingsTwoCol}>
            {subhead('Google Sheet', 'Send collected subscriber to google sheet')}
            {['GOOGLE SHEET LIST', 'GOOGLE CONTACTS ACCOUNT'].map((label) => (
              <label className={styles.settingField} key={label}>
                <span>{labelText(label)}</span>
                <select disabled>
                  <option>{t('لا يوجد حساب متصل', 'No connected account')}</option>
                </select>
                <small>
                  {t(
                    'غير متاح: تكامل Google غير متصل بهذا البوت.',
                    'Unavailable: Google integration is not connected to this bot.',
                  )}
                </small>
              </label>
            ))}
          </div>
        )}
        {active === 'email' && (
          <div className={styles.settingsWide}>
            {subhead(
              'Email',
              'Send automated email to subscribers sharing email address through bot',
            )}
            <label className={styles.settingField}>
              <span>{labelText('EMAIL API')}</span>
              <select disabled>
                <option>{t('لا يوجد مزود متصل', 'No provider connected')}</option>
              </select>
              <small>
                {t(
                  'غير متاح: لا يوجد مزود Email API مرتبط.',
                  'Unavailable: no Email API provider is connected.',
                )}
              </small>
            </label>
            {field('EMAIL SUBJECT', draft.email.subject, (v) => put('email', 'subject', v))}
            <label className={styles.settingField}>
              <span>{labelText('EMAIL CONTENT')}</span>
              <textarea
                value={draft.email.content}
                onChange={(e) => put('email', 'content', e.target.value)}
              />
            </label>
          </div>
        )}
        {active === 'sms' && (
          <div className={styles.settingsWide}>
            {subhead('SMS', 'Send automated sms to subscribers sharing phone number through bot')}
            <label className={styles.settingField}>
              <span>{labelText('SMS API')}</span>
              <select disabled>
                <option>{t('لا يوجد مزود متصل', 'No provider connected')}</option>
              </select>
              <small>
                {t(
                  'غير متاح: لا يوجد مزود SMS API مرتبط.',
                  'Unavailable: no SMS API provider is connected.',
                )}
              </small>
            </label>
            <label className={styles.settingField}>
              <span>{labelText('SMS CONTENT')}</span>
              <textarea
                value={draft.sms.content}
                onChange={(e) => put('sms', 'content', e.target.value)}
              />
            </label>
          </div>
        )}
      </fieldset>
      <div className={styles.settingsActions}>
        <button
          type="button"
          className="btn"
          disabled={!canManage || !channelId || dirty || loading || busy || !ready}
          onClick={() => void activateSupported()}
        >
          {t('تفعيل الخيارات المدعومة المحفوظة', 'Activate saved supported options')}
        </button>
      </div>
      {dirty && (
        <div className={styles.settingsActions}>
          <button type="button" className="btn" disabled={busy} onClick={cancel}>
            {t('إلغاء التغييرات', 'Discard changes')}
          </button>
        </div>
      )}
    </form>
  );
}
