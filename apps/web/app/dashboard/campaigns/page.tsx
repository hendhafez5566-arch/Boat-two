'use client';
import {
  CampaignDraftEditor,
  EditableCampaign,
} from '../../../components/business/CampaignDraftEditor';
import { FormEvent, useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
type Campaign = EditableCampaign & {
  id: string;
  name: string;
  channel_name: string;
  status: string;
  recipients: number;
  scheduled_at: string | null;
};
type Recipient = {
  id: string;
  contact_name: string;
  status: string;
  delivery_status: string | null;
  error: string | null;
};
export default function Campaigns() {
  const { t } = useLocale();
  const list = useData<Campaign[]>('/campaigns', []);
  const channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const segments = useData<{ id: string; name: string; filters: Record<string, string> }[]>(
    '/crm/segments',
    [],
  );
  const [channel, setChannel] = useState('');
  const [segment, setSegment] = useState('');
  const [templates, setTemplates] = useState<
    { name: string; language: string; body: string; status: string; supported: boolean }[]
  >([]);
  const [template, setTemplate] = useState('');
  const [audience, setAudience] = useState<{ matched: number; eligible: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [ledger, setLedger] = useState<{
    items: Recipient[];
    totals: { status: string; delivery_status: string | null; count: number }[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [text, setText] = useState('');
  const filters = segments.data.find((s) => s.id === segment)?.filters || {};
  useEffect(() => {
    setAudience(null);
    setTemplate('');
    setTemplates([]);
    if (channels.data.find((c) => c.id === channel)?.type === 'whatsapp')
      api<typeof templates>(`/channels/${channel}/templates`)
        .then((r) =>
          setTemplates(r.filter((x) => x.status === 'APPROVED' && x.supported !== false)),
        )
        .catch((e) => setError(e.message));
  }, [channel, channels.data]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await run(async () => {
      const selectedTemplate = templates.find((x) => x.name + '|' + x.language === template);
      const content = selectedTemplate
        ? {
            template: {
              name: selectedTemplate.name,
              language: selectedTemplate.language,
              bodyParams: String(f.get('parameters') || '')
                .split('\n')
                .filter(Boolean),
            },
          }
        : { text: f.get('text') };
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          channelId: channel,
          filters,
          content,
          frequencyHours: Number(f.get('frequency')),
        }),
      });
      form.reset();
      setAudience(null);
      setMessage(
        t(
          'حُفظت مسودة الحملة. راجع الجمهور وحدد موعدها من القائمة.',
          'Campaign draft saved. Review the audience and schedule it below.',
        ),
      );
    });
  }
  async function view(id: string, p = 1) {
    setSelected(id);
    setPage(p);
    try {
      setLedger(await api<typeof ledger>(`/campaigns/${id}/recipients?page=${p}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERMISSION-BASED MARKETING</p>
          <h1>{t('رسالة مناسبة، لجمهور موافق', 'The right message, with permission')}</h1>
          <p>
            {t(
              'راجع الجمهور والموافقة قبل الجدولة. حالة الطابور لا تعني التسليم.',
              'Review your audience and consent before scheduling. Queued is not delivered.',
            )}
          </p>
        </div>
        <button className="btn" onClick={() => list.reload()}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      <p className="notice">
        {t(
          'الإرسال الخارجي معطّل افتراضيًا في البيئة. لن ترسل المنصة إلى Meta حتى يفعّل المشغّل الاتصال الرسمي والإذن اللازم.',
          'External delivery is disabled by default. Meta delivery requires operator activation and official channel authorization.',
        )}
      </p>
      {(error || list.error) && (
        <p className="notice error" role="alert">
          {error || list.error}
        </p>
      )}
      {message && <p className="notice">{message}</p>}
      <form className="card stack" onSubmit={create}>
        <h2>{t('1. إنشاء الحملة', '1. Build your campaign')}</h2>
        <div className="form-grid">
          <label className="field">
            {t('اسم الحملة', 'Campaign name')}
            <input name="name" required maxLength={120} />
          </label>
          <label className="field">
            {t('القناة', 'Channel')}
            <select value={channel} required onChange={(e) => setChannel(e.target.value)}>
              <option value="">{t('اختر قناة', 'Choose channel')}</option>
              {channels.data.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.type}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('الجمهور', 'Audience')}
            <select
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value);
                setAudience(null);
              }}
            >
              <option value="">
                {t('كل جهات الاتصال المطابقة للموافقة', 'All eligible contacts')}
              </option>
              {segments.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('أقل ساعات بين الحملات لكل عميل', 'Minimum hours between campaigns per contact')}
            <input name="frequency" type="number" defaultValue={24} min={1} max={720} required />
          </label>
        </div>
        {channels.data.find((c) => c.id === channel)?.type === 'whatsapp' && (
          <label className="field">
            {t(
              'قالب WhatsApp معتمد (موصى به خارج نافذة الرد)',
              'Approved WhatsApp template (required outside the reply window)',
            )}
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">
                {t('رسالة نصية داخل نافذة الرد فقط', 'Text within reply window only')}
              </option>
              {templates.map((x) => (
                <option key={x.name + x.language} value={x.name + '|' + x.language}>
                  {x.name} · {x.language}
                </option>
              ))}
            </select>
          </label>
        )}
        {template ? (
          <>
            <p className="notice whitespace-pre-wrap">
              {templates.find((x) => x.name + '|' + x.language === template)?.body}
            </p>
            <label className="field">
              {t('قيم متغيرات القالب، قيمة في كل سطر', 'Template parameter values, one per line')}
              <textarea name="parameters" rows={3} />
            </label>
          </>
        ) : (
          <label className="field">
            {t('محتوى الرسالة', 'Message content')}
            <select
              aria-label={t('مكتبة نصوص البداية', 'Starter copy library')}
              defaultValue=""
              onChange={(event) => setText(event.target.value)}
            >
              <option value="">{t('اختر نصًا وخصصه', 'Choose copy and personalize it')}</option>
              <option
                value={t(
                  'شكرًا لاهتمامك! يسعدنا مساعدتك في اختيار الخدمة المناسبة. تواصل معنا لمعرفة التفاصيل.',
                  'Thank you for your interest! We can help you choose the right service. Reply to learn more.',
                )}
              >
                {t('متابعة الاهتمام', 'Lead follow-up')}
              </option>
              <option
                value={t(
                  'تذكير بموعدك القادم. يرجى الرد لتأكيد الموعد أو طلب تغييره.',
                  'A reminder about your upcoming appointment. Please reply to confirm or request a change.',
                )}
              >
                {t('تذكير بموعد', 'Appointment reminder')}
              </option>
              <option
                value={t(
                  'نود معرفة رأيك في تجربتك الأخيرة. ما الذي يمكننا تحسينه؟',
                  'We would love your feedback on your recent experience. What can we improve?',
                )}
              >
                {t('طلب تقييم', 'Feedback request')}
              </option>
            </select>
            <textarea
              name="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              required
              maxLength={4096}
              rows={4}
            />
          </label>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={!channel || busy}
            onClick={() =>
              run(async () =>
                setAudience(
                  await api('/campaigns/audience', {
                    method: 'POST',
                    body: JSON.stringify({ channelId: channel, filters }),
                  }),
                ),
              )
            }
          >
            {t('2. مراجعة الجمهور', '2. Review audience')}
          </button>
          {audience && (
            <span className="badge">
              {audience.eligible} {t('موافق ومربوط بالقناة من', 'consented & linked of')}{' '}
              {audience.matched}
            </span>
          )}
          <button disabled={!audience?.eligible || busy} className="btn btn-primary">
            {t('3. حفظ المسودة', '3. Save draft')}
          </button>
        </div>
      </form>
      <section className="card table-wrap">
        <h2>{t('الحملات', 'Campaigns')}</h2>
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('الحملة', 'Campaign')}</th>
              <th>{t('الحالة', 'Status')}</th>
              <th>{t('الجمهور', 'Recipients')}</th>
              <th>{t('الإجراءات', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted">{c.channel_name}</div>
                </td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
                <td>{c.recipients}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => view(c.id)}>
                      {t('النتائج', 'Results')}
                    </button>
                    {c.status === 'draft' && (
                      <CampaignDraftEditor campaign={c} save={run} busy={busy} />
                    )}
                    {['draft', 'scheduled'].includes(c.status) && (
                      <form
                        className="flex flex-wrap gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const at = new Date(
                            String(new FormData(e.currentTarget).get('at')),
                          ).toISOString();
                          run(() =>
                            api(`/campaigns/${c.id}/schedule`, {
                              method: 'POST',
                              body: JSON.stringify({ at }),
                            }),
                          );
                        }}
                      >
                        <input
                          type="datetime-local"
                          aria-label={t('موعد الحملة', 'Campaign schedule')}
                          name="at"
                          required
                        />
                        <button className="btn" disabled={busy}>
                          {c.status === 'scheduled'
                            ? t('إعادة الجدولة', 'Reschedule')
                            : t('جدولة', 'Schedule')}
                        </button>
                      </form>
                    )}
                    {['draft', 'scheduled', 'running'].includes(c.status) && (
                      <button
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          confirm(
                            t('إلغاء ما لم يُرسل من الحملة؟', 'Cancel the unsent campaign work?'),
                          ) && run(() => api(`/campaigns/${c.id}/cancel`, { method: 'PATCH' }))
                        }
                      >
                        {t('إلغاء', 'Cancel')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.loading ? (
          <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
        ) : (
          !list.data.length && (
            <p className="empty">
              {t(
                'لا توجد حملات. أنشئ أول مسودة أعلاه.',
                'No campaigns. Build your first draft above.',
              )}
            </p>
          )
        )}
      </section>
      {ledger && (
        <section className="card table-wrap">
          <h2>{t('سجل الجمهور والتسليم', 'Recipient & delivery ledger')}</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {ledger.totals.map((x, i) => (
              <span key={i} className="badge">
                {x.status} / {x.delivery_status || '—'}: {x.count}
              </span>
            ))}
          </div>
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('العميل', 'Contact')}</th>
                <th>{t('المعالجة', 'Processing')}</th>
                <th>{t('التسليم', 'Delivery')}</th>
                <th>{t('التفاصيل', 'Details')}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.items.map((x) => (
                <tr key={x.id}>
                  <td>{x.contact_name}</td>
                  <td>{x.status}</td>
                  <td>{x.delivery_status || '—'}</td>
                  <td>
                    {x.error}
                    {x.status === 'failed' && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(`/campaigns/${selected}/recipients/${x.id}/retry`, {
                              method: 'POST',
                            });
                            await view(selected, page);
                          })
                        }
                      >
                        {t('إعادة المحاولة', 'Retry')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button className="btn" disabled={page === 1} onClick={() => view(selected, page - 1)}>
              {t('السابق', 'Previous')}
            </button>
            <button className="btn" onClick={() => view(selected, page)}>
              {t('تحديث', 'Refresh')}
            </button>
            <button
              className="btn"
              disabled={ledger.items.length < 25}
              onClick={() => view(selected, page + 1)}
            >
              {t('التالي', 'Next')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
