'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { useData } from '../../../components/business/useData';
import { download, exportCsv, parseCsv } from '../../../components/business/csv';
type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifecycle: string;
  tags: string[];
  owner_id: string | null;
  attributes: Record<string, string | number | boolean | null>;
};
type Pipeline = { id: string; name: string; stages: string[] };
type Deal = {
  id: string;
  title: string;
  contact_name: string;
  pipeline_id: string;
  stage: string;
  status: string;
  value_cents: string;
  currency: string;
};
type Task = { id: string; title: string; contact_name: string; due_at: string; status: string };
type Timeline = {
  notes: { id: string; body: string; created_at: string }[];
  conversations: { id: string; channel_name: string; status: string }[];
  tasks: Task[];
  deals: Deal[];
  consent: { channel_id: string; channel_name: string; status: string; evidence: string }[];
  events: { id: string; type: string; created_at: string; status: string }[];
};
const blank = {
  name: '',
  email: '',
  phone: '',
  lifecycle: 'lead',
  tags: '',
  ownerId: '',
  attributes: '{}',
};
export default function CRM() {
  const { t } = useLocale();
  const [tab, setTab] = useState('contacts');
  const [q, setQ] = useState('');
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [stage, setStage] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const filter = new URLSearchParams({
    q,
    ...(stage ? { lifecycle: stage } : {}),
    ...(tag ? { tag } : {}),
  });
  const contacts = useData<{ items: Contact[]; total: number }>(
    `/crm/contacts?${filter}&page=${page}`,
    { items: [], total: 0 },
  );
  const pipelines = useData<Pipeline[]>('/crm/pipelines', []);
  const deals = useData<{ items: Deal[]; total: number }>('/crm/deals?page=' + page, {
    items: [],
    total: 0,
  });
  const tasks = useData<{ items: Task[]; total: number }>('/crm/tasks?page=' + page, {
    items: [],
    total: 0,
  });
  const fields = useData<{ id: string; key: string; label: string; type: string }[]>(
    '/crm/fields',
    [],
  );
  const segments = useData<
    { id: string; name: string; filters: { q?: string; lifecycle?: string; tag?: string } }[]
  >('/crm/segments', []);
  const duplicates = useData<{ email: string; ids: string[]; count: number }[]>(
    '/crm/contacts/duplicates',
    [],
  );
  const team = useData<{ members: { user_id: string; full_name: string; email: string }[] }>(
    '/team',
    { members: [] },
  );
  const channels = useData<{ id: string; name: string }[]>('/channels', []);
  const refresh = () => {
    contacts.reload();
    deals.reload();
    tasks.reload();
    fields.reload();
    segments.reload();
    duplicates.reload();
    pipelines.reload();
  };
  async function act(path: string, body?: unknown, method = 'POST') {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const r = await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      setMessage(t('تم حفظ التغيير.', 'Change saved.'));
      refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function view(c: Contact) {
    setSelected(c);
    setTimeline(null);
    try {
      setTimeline(await api<Timeline>(`/crm/contacts/${c.id}/timeline`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await act(
        '/crm/contacts' + (edit ? '/' + edit : ''),
        {
          ...form,
          email: form.email || null,
          phone: form.phone || null,
          tags: form.tags
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          ownerId: form.ownerId || null,
          attributes: JSON.parse(form.attributes),
        },
        edit ? 'PATCH' : 'POST',
      );
      setForm(blank);
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > 2_000_000) throw new Error(t('حجم الملف أكبر من 2MB', 'File exceeds 2MB'));
      const text = await file.text();
      const rows = file.name.endsWith('.json') ? JSON.parse(text) : parseCsv(text);
      if (!Array.isArray(rows)) throw new Error('Expected an array');
      const mapped = rows.map((r) => ({
        ...r,
        email: r.email || null,
        phone: r.phone || null,
        tags: Array.isArray(r.tags)
          ? r.tags
          : String(r.tags || '')
              .split(';')
              .filter(Boolean),
      }));
      const result = await api<{ imported: number }>('/crm/contacts/import', {
        method: 'POST',
        body: JSON.stringify({ contacts: mapped }),
      });
      setMessage(`${result.imported} ${t('جهة اتصال مستوردة', 'contacts imported')}`);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportContacts() {
    try {
      const r = await api<{ items: Contact[]; total: number }>(`/crm/contacts/export?${filter}`);
      if (r.total > r.items.length)
        throw new Error(
          t(
            'ضيّق التصفية إلى 10000 جهة اتصال أو أقل.',
            'Narrow the filter to 10,000 contacts or fewer.',
          ),
        );
      download('contacts.csv', exportCsv(r.items, ['name', 'email', 'phone', 'lifecycle', 'tags']));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const tabs = [
    ['contacts', 'جهات الاتصال', 'Contacts'],
    ['deals', 'الصفقات', 'Deals'],
    ['tasks', 'المتابعات', 'Tasks'],
    ['config', 'الحقول والشرائح', 'Fields & segments'],
  ];
  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUSTOMER RELATIONSHIPS</p>
          <h1>{t('كل عميل، بسياقه الكامل', 'Every customer, in context')}</h1>
          <p>
            {t(
              'العملاء والمحادثات والصفقات والمتابعات مرتبطة ببيانات شركتك.',
              'Contacts, conversations, deals and follow-ups connected to your workspace.',
            )}
          </p>
        </div>
        <button className="btn" onClick={refresh}>
          {t('تحديث', 'Refresh')}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, ar, en]) => (
          <button
            key={id}
            className={`btn ${tab === id ? 'btn-primary' : ''}`}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
          >
            {t(ar, en)}
          </button>
        ))}
      </div>
      {(error ||
        contacts.error ||
        deals.error ||
        tasks.error ||
        fields.error ||
        segments.error) && (
        <p className="notice error" role="alert">
          {error || contacts.error || deals.error || tasks.error || fields.error || segments.error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {tab === 'contacts' && (
        <>
          <section className="card">
            <div className="form-grid">
              <label className="field">
                {t('بحث', 'Search')}
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t('اسم أو بريد أو هاتف', 'Name, email or phone')}
                />
              </label>
              <label className="field">
                {t('مرحلة العميل', 'Lifecycle')}
                <select
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('الكل', 'All')}</option>
                  {['lead', 'qualified', 'customer', 'inactive'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('وسم', 'Tag')}
                <input
                  value={tag}
                  onChange={(e) => {
                    setTag(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" onClick={exportContacts}>
                {t('تصدير CSV', 'Export CSV')}
              </button>
              <label className="btn">
                {t('استيراد CSV / JSON', 'Import CSV / JSON')}
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.json"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files?.[0]) importFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              <small className="muted">
                {t(
                  'حتى 500 صف للاستيراد. CSV: name,email,phone,lifecycle,tags',
                  'Import up to 500 rows. CSV: name,email,phone,lifecycle,tags',
                )}
              </small>
            </div>
          </section>
          <form
            className="card space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const lifecycle = String(data.get('lifecycle') || '');
              const owner = String(data.get('owner') || '');
              try {
                await act('/crm/contacts/bulk', {
                  ids: bulkIds,
                  ...(lifecycle ? { lifecycle } : {}),
                  ...(owner ? { ownerId: owner === 'unassigned' ? null : owner } : {}),
                  addTags: String(data.get('tags') || '')
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                });
                setBulkIds([]);
              } catch {
                /* Shared error banner. */
              }
            }}
          >
            <h2>
              {t('تعديل العملاء المحددين', 'Edit selected contacts')} ({bulkIds.length})
            </h2>
            <div className="form-grid">
              <label className="field">
                {t('المرحلة', 'Lifecycle')}
                <select name="lifecycle">
                  <option value="">{t('دون تغيير', 'Keep current')}</option>
                  {['lead', 'qualified', 'customer', 'inactive'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('المسؤول', 'Owner')}
                <select name="owner">
                  <option value="">{t('دون تغيير', 'Keep current')}</option>
                  <option value="unassigned">{t('إلغاء التعيين', 'Unassign')}</option>
                  {team.data.members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('إضافة وسوم مفصولة بفاصلة', 'Add comma-separated tags')}
                <input name="tags" />
              </label>
            </div>
            <button className="btn btn-primary" disabled={busy || !bulkIds.length}>
              {t('تطبيق على المحددين', 'Apply to selected')}
            </button>
            <button type="button" className="btn" onClick={() => setBulkIds([])}>
              {t('مسح التحديد', 'Clear selection')}
            </button>
          </form>
          <section className="card table-wrap">
            <table className="product-table">
              <thead>
                <tr>
                  <th>{t('تحديد', 'Select')}</th>
                  <th>{t('العميل', 'Customer')}</th>
                  <th>{t('التواصل', 'Contact')}</th>
                  <th>{t('المرحلة', 'Lifecycle')}</th>
                  <th>{t('الوسوم', 'Tags')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contacts.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('تحديد ', 'Select ') + c.name}
                        checked={bulkIds.includes(c.id)}
                        disabled={!bulkIds.includes(c.id) && bulkIds.length >= 100}
                        onChange={(event) =>
                          setBulkIds((ids) =>
                            event.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button className="font-bold underline" onClick={() => view(c)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.email || c.phone || '—'}</td>
                    <td>
                      <span className="badge">{c.lifecycle}</span>
                    </td>
                    <td>{c.tags.join(' · ') || '—'}</td>
                    <td>
                      <button
                        className="btn"
                        onClick={() => {
                          setEdit(c.id);
                          setForm({
                            name: c.name || '',
                            email: c.email || '',
                            phone: c.phone || '',
                            lifecycle: c.lifecycle,
                            tags: c.tags.join(', '),
                            ownerId: c.owner_id || '',
                            attributes: JSON.stringify(c.attributes, null, 2),
                          });
                        }}
                      >
                        {t('تعديل', 'Edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contacts.loading ? (
              <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>
            ) : (
              !contacts.data.items.length && (
                <p className="empty">
                  {t(
                    'أضف أول عميل، أو استورد قائمة جهات اتصالك.',
                    'Add your first contact or import your contact list.',
                  )}
                </p>
              )
            )}
          </section>
          <form className="card" onSubmit={save}>
            <h2>
              {edit
                ? t('تعديل ملف العميل', 'Edit customer profile')
                : t('عميل جديد', 'New contact')}
            </h2>
            <div className="form-grid">
              {(['name', 'email', 'phone', 'tags'] as const).map((k) => (
                <label className="field" key={k}>
                  {
                    {
                      name: t('الاسم', 'Name'),
                      email: t('البريد', 'Email'),
                      phone: t('الهاتف', 'Phone'),
                      tags: t('وسوم مفصولة بفاصلة', 'Comma-separated tags'),
                    }[k]
                  }
                  <input
                    type={k === 'email' ? 'email' : 'text'}
                    required={k === 'name'}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field">
                {t('المرحلة', 'Lifecycle')}
                <select
                  value={form.lifecycle}
                  onChange={(e) => setForm({ ...form, lifecycle: e.target.value })}
                >
                  {['lead', 'qualified', 'customer', 'inactive'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('مسؤول العميل', 'Owner')}
                <select
                  value={form.ownerId}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                >
                  <option value="">{t('غير معيّن', 'Unassigned')}</option>
                  {team.data.members.map((x) => (
                    <option value={x.user_id} key={x.user_id}>
                      {x.full_name || x.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid mt-4">
              {fields.data.map((field) => {
                let attributes: Record<string, unknown> = {};
                try {
                  attributes = JSON.parse(form.attributes);
                } catch {
                  /* Advanced JSON editor validates on submit. */
                }
                const value = attributes[field.key];
                return (
                  <label className="field" key={field.id}>
                    {field.label}
                    {field.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            attributes: JSON.stringify({
                              ...attributes,
                              [field.key]: e.target.checked,
                            }),
                          })
                        }
                      />
                    ) : (
                      <input
                        type={
                          field.type === 'number'
                            ? 'number'
                            : field.type === 'date'
                              ? 'date'
                              : 'text'
                        }
                        value={value === undefined || value === null ? '' : String(value)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            attributes: JSON.stringify({
                              ...attributes,
                              [field.key]:
                                e.target.value === ''
                                  ? null
                                  : field.type === 'number'
                                    ? Number(e.target.value)
                                    : e.target.value,
                            }),
                          })
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <details className="mt-4">
              <summary className="muted">
                {t('بيانات إضافية متقدمة', 'Advanced additional attributes')}
              </summary>
              <label className="field mt-4">
                {t('حقول العميل المخصصة (JSON)', 'Custom attributes (JSON)')}
                <textarea
                  rows={3}
                  dir="ltr"
                  value={form.attributes}
                  onChange={(e) => setForm({ ...form, attributes: e.target.value })}
                />
              </label>
            </details>
            <div className="form-actions">
              <button disabled={busy} className="btn btn-primary">
                {t('حفظ العميل', 'Save contact')}
              </button>
              {edit && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEdit(null);
                    setForm(blank);
                  }}
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {selected && tab === 'contacts' && (
        <section className="card stack">
          <div className="flex justify-between">
            <h2>
              {selected.name} · {t('ملف العميل', 'Customer profile')}
            </h2>
            <button
              className="btn"
              onClick={() => {
                setSelected(null);
                setTimeline(null);
              }}
            >
              {t('إغلاق', 'Close')}
            </button>
          </div>
          {!timeline ? (
            <p>{t('جارٍ التحميل…', 'Loading…')}</p>
          ) : (
            <>
              <div className="card-grid">
                <div>
                  <h3 className="font-bold">{t('المحادثات', 'Conversations')}</h3>
                  {timeline.conversations.map((x) => (
                    <p key={x.id} className="muted">
                      <Link href={`/dashboard/inbox?conversation=${x.id}`}>
                        {x.channel_name} · {x.status} ↗
                      </Link>
                    </p>
                  ))}
                  {!timeline.conversations.length && (
                    <p className="muted">{t('لا توجد محادثات', 'No conversations')}</p>
                  )}
                </div>
                <div>
                  <h3 className="font-bold">{t('ملاحظات الفريق', 'Team notes')}</h3>
                  {timeline.notes.map((n) => (
                    <p key={n.id} className="notice whitespace-pre-wrap">
                      {n.body}
                    </p>
                  ))}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = e.currentTarget;
                      const text = new FormData(f).get('text');
                      try {
                        await act(`/crm/contacts/${selected.id}/notes`, { text });
                        f.reset();
                        view(selected);
                      } catch {
                        /* The action helper displays the error. */
                      }
                    }}
                  >
                    <label className="field">
                      {t('ملاحظة داخلية', 'Internal note')}
                      <textarea name="text" required maxLength={4000} />
                    </label>
                    <button disabled={busy} className="btn mt-2">
                      {t('إضافة', 'Add')}
                    </button>
                  </form>
                </div>
              </div>
              <h3 className="font-bold">
                {t('الموافقة على الرسائل التسويقية', 'Marketing consent')}
              </h3>
              {timeline.consent.map((s) => (
                <p key={s.channel_id} className="muted">
                  {s.channel_name} · {s.status} · {s.evidence}
                </p>
              ))}
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    await act(`/crm/contacts/${selected.id}/consent`, Object.fromEntries(f), 'PUT');
                    view(selected);
                  } catch {
                    /* The action helper displays the error. */
                  }
                }}
              >
                <label className="field">
                  {t('القناة', 'Channel')}
                  <select name="channelId" required>
                    {channels.data.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t('الموافقة', 'Consent')}
                  <select name="status">
                    <option value="opted_out">{t('إلغاء الموافقة', 'Opt out')}</option>
                    <option value="opted_in">{t('موافقة موثقة', 'Documented opt in')}</option>
                  </select>
                </label>
                <label className="field">
                  {t('مصدر ودليل الموافقة', 'Consent evidence')}
                  <input name="evidence" required minLength={5} maxLength={1000} />
                </label>
                <button disabled={busy} className="btn self-end">
                  {t('تسجيل الموافقة', 'Record consent')}
                </button>
              </form>
              <h3 className="font-bold">{t('سجل أحداث العميل', 'Customer event timeline')}</h3>
              <div className="table-wrap">
                <table className="product-table">
                  <tbody>
                    {timeline.events.map((x) => (
                      <tr key={x.id}>
                        <td>{new Date(x.created_at).toLocaleString()}</td>
                        <td>{x.type}</td>
                        <td>{x.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      {tab === 'deals' && (
        <>
          <section className="card">
            <h2>{t('الصفقات وخطوط المبيعات', 'Deals & pipelines')}</h2>
            <div className="table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>{t('الصفقة', 'Deal')}</th>
                    <th>{t('العميل', 'Contact')}</th>
                    <th>{t('القيمة', 'Value')}</th>
                    <th>{t('المرحلة', 'Stage')}</th>
                    <th>{t('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.data.items.map((d) => (
                    <tr key={d.id}>
                      <td>{d.title}</td>
                      <td>{d.contact_name}</td>
                      <td>
                        {Number(d.value_cents) / 100} {d.currency}
                      </td>
                      <td>
                        <select
                          value={d.stage}
                          onChange={(e) =>
                            act(
                              '/crm/deals/' + d.id,
                              { stage: e.target.value, status: d.status },
                              'PATCH',
                            ).catch(() => {})
                          }
                        >
                          {pipelines.data
                            .find((p) => p.id === d.pipeline_id)
                            ?.stages.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={d.status}
                          onChange={(e) =>
                            act(
                              '/crm/deals/' + d.id,
                              { stage: d.stage, status: e.target.value },
                              'PATCH',
                            ).catch(() => {})
                          }
                        >
                          {['open', 'won', 'lost'].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!deals.data.items.length && (
              <p className="empty">{t('لا توجد صفقات بعد.', 'No deals yet.')}</p>
            )}
          </section>
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const b = new FormData(f);
              const pipeline = pipelines.data.find((p) => p.id === b.get('pipelineId'));
              try {
                await act('/crm/deals', {
                  title: b.get('title'),
                  contactId: b.get('contactId'),
                  pipelineId: pipeline?.id,
                  stage: pipeline?.stages[0],
                  valueCents: Math.round(Number(b.get('value')) * 100),
                  currency: b.get('currency'),
                });
                f.reset();
              } catch {
                /* The action helper displays the error. */
              }
            }}
          >
            <h2>{t('صفقة جديدة', 'New deal')}</h2>
            <div className="form-grid">
              <label className="field">
                {t('العنوان', 'Title')}
                <input name="title" required />
              </label>
              <ContactSelect items={contacts.data.items} />
              <label className="field">
                {t('خط المبيعات', 'Pipeline')}
                <select name="pipelineId" required>
                  {pipelines.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t('القيمة', 'Value')}
                <input name="value" type="number" min="0" step="0.01" required />
              </label>
              <label className="field">
                {t('العملة', 'Currency')}
                <input name="currency" defaultValue="USD" pattern="[A-Z]{3}" required />
              </label>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy || !pipelines.data.length}>
              {t('إنشاء الصفقة', 'Create deal')}
            </button>
          </form>
          <section className="card space-y-4">
            <h2>{t('إدارة مراحل المبيعات', 'Manage sales stages')}</h2>
            <p className="text-sm text-slate-500">
              {t(
                'عند إزالة مرحلة تحتوي صفقات، اختر المرحلة البديلة قبل الحفظ.',
                'When removing a stage with deals, choose its replacement before saving.',
              )}
            </p>
            {pipelines.data.map((pipeline) => (
              <details key={pipeline.id} className="rounded-xl border p-4">
                <summary className="cursor-pointer font-semibold">{pipeline.name}</summary>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const stages = String(form.get('stages'))
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const replacements = Object.fromEntries(
                      pipeline.stages
                        .map((stage, index) => [
                          stage,
                          String(form.get('replacement-' + index) || ''),
                        ])
                        .filter(([, value]) => value),
                    );
                    try {
                      await act(
                        '/crm/pipelines/' + pipeline.id,
                        { name: form.get('name'), stages, replacements },
                        'PATCH',
                      );
                    } catch {
                      /* Shared error banner. */
                    }
                  }}
                >
                  <label className="field">
                    {t('الاسم', 'Name')}
                    <input name="name" required maxLength={100} defaultValue={pipeline.name} />
                  </label>
                  <label className="field">
                    {t('المراحل بالترتيب، مفصولة بفاصلة', 'Stages in order, separated by commas')}
                    <input name="stages" required defaultValue={pipeline.stages.join(', ')} />
                  </label>
                  {pipeline.stages.map((stage, index) => (
                    <label key={stage} className="field">
                      {t('بديل عند حذف المرحلة: ', 'Replacement if removing: ') + stage}
                      <input
                        name={'replacement-' + index}
                        maxLength={60}
                        placeholder={t(
                          'اسم مرحلة في القائمة الجديدة',
                          'Stage name in the new list',
                        )}
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-primary" disabled={busy}>
                      {t('حفظ المراحل', 'Save stages')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            t('حذف خط المبيعات الفارغ؟', 'Delete this empty pipeline?'),
                          )
                        )
                          void act('/crm/pipelines/' + pipeline.id, undefined, 'DELETE').catch(
                            () => {},
                          );
                      }}
                    >
                      {t('حذف الخط الفارغ', 'Delete empty pipeline')}
                    </button>
                  </div>
                </form>
              </details>
            ))}
          </section>
          <SimpleForm
            title={t('خط مبيعات جديد', 'New pipeline')}
            fields={[
              ['name', t('الاسم', 'Name')],
              ['stages', t('مراحل مفصولة بفاصلة', 'Comma-separated stages')],
            ]}
            onSave={(b) =>
              act('/crm/pipelines', {
                name: b.name,
                stages: b.stages
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </>
      )}
      {tab === 'tasks' && (
        <>
          <section className="card table-wrap">
            <table className="product-table">
              <thead>
                <tr>
                  <th>{t('المهمة', 'Task')}</th>
                  <th>{t('العميل', 'Contact')}</th>
                  <th>{t('الموعد', 'Due')}</th>
                  <th>{t('الحالة', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.data.items.map((x) => (
                  <tr key={x.id}>
                    <td>{x.title}</td>
                    <td>{x.contact_name}</td>
                    <td
                      className={
                        x.status === 'open' && new Date(x.due_at) < new Date() ? 'text-red-700' : ''
                      }
                    >
                      {new Date(x.due_at).toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          act(
                            '/crm/tasks/' + x.id,
                            { status: x.status === 'open' ? 'done' : 'open' },
                            'PATCH',
                          ).catch(() => {})
                        }
                      >
                        {x.status === 'open' ? t('إكمال', 'Complete') : t('إعادة فتح', 'Reopen')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tasks.data.items.length && (
              <p className="empty">{t('لا توجد متابعات.', 'No follow-ups yet.')}</p>
            )}
          </section>
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const b = new FormData(f);
              try {
                await act('/crm/tasks', {
                  title: b.get('title'),
                  contactId: b.get('contactId'),
                  dueAt: new Date(String(b.get('dueAt'))).toISOString(),
                  assignedTo: b.get('assignedTo') || null,
                });
                f.reset();
              } catch {
                /* The action helper displays the error. */
              }
            }}
          >
            <h2>{t('متابعة جديدة', 'New follow-up')}</h2>
            <div className="form-grid">
              <label className="field">
                {t('المهمة', 'Task')}
                <input required name="title" />
              </label>
              <ContactSelect items={contacts.data.items} />
              <label className="field">
                {t('الموعد', 'Due')}
                <input required name="dueAt" type="datetime-local" />
              </label>
              <label className="field">
                {t('المسؤول', 'Assignee')}
                <select name="assignedTo">
                  <option value="">{t('غير معيّن', 'Unassigned')}</option>
                  {team.data.members.map((x) => (
                    <option key={x.user_id} value={x.user_id}>
                      {x.full_name || x.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy}>
              {t('حفظ المتابعة', 'Save follow-up')}
            </button>
          </form>
        </>
      )}
      {tab === 'config' && (
        <>
          <div className="card-grid">
            <section className="card">
              <h2>{t('الحقول المخصصة', 'Custom fields')}</h2>
              {fields.data.map((x) => (
                <p className="muted" key={x.id}>
                  {x.label} · {x.key} · {x.type}
                </p>
              ))}
            </section>
            <section className="card">
              <h2>{t('الشرائح المحفوظة', 'Saved segments')}</h2>
              {segments.data.map((x) => (
                <div className="step" key={x.id}>
                  <button
                    onClick={() => {
                      setQ(x.filters.q || '');
                      setStage(x.filters.lifecycle || '');
                      setTag(x.filters.tag || '');
                      setTab('contacts');
                      setPage(1);
                    }}
                  >
                    {x.name} ↗
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() =>
                      confirm(t('حذف الشريحة؟', 'Delete segment?')) &&
                      act('/crm/segments/' + x.id, undefined, 'DELETE').catch(() => {})
                    }
                  >
                    {t('حذف', 'Delete')}
                  </button>
                </div>
              ))}
            </section>
          </div>
          <SimpleForm
            title={t(
              'حقل جديد: text / number / date / boolean',
              'New field: text / number / date / boolean',
            )}
            fields={[
              ['key', t('مفتاح إنجليزي', 'Field key')],
              ['label', t('العنوان', 'Label')],
              ['type', t('النوع', 'Type')],
            ]}
            onSave={(b) => act('/crm/fields', b)}
          />
          <SimpleForm
            title={t('احفظ التصفية الحالية كشريحة', 'Save current filters as a segment')}
            fields={[['name', t('اسم الشريحة', 'Segment name')]]}
            onSave={(b) =>
              act('/crm/segments', { name: b.name, filters: Object.fromEntries(filter) })
            }
          />
          <section className="card">
            <h2>{t('بريد مكرر', 'Duplicate emails')}</h2>
            {duplicates.data.map((x) => (
              <p className="muted" key={x.email}>
                {x.email} · {x.count} · {x.ids.join(', ')}
              </p>
            ))}
            {!duplicates.data.length && (
              <p className="muted">
                {t('لا توجد عناوين بريد مكررة.', 'No duplicate email addresses.')}
              </p>
            )}
          </section>
        </>
      )}
      {tab !== 'config' && (
        <div className="form-actions">
          <button disabled={page === 1} className="btn" onClick={() => setPage((p) => p - 1)}>
            {t('السابق', 'Previous')}
          </button>
          <span>{page}</span>
          <button
            className="btn"
            disabled={
              page * 25 >=
              (tab === 'contacts'
                ? contacts.data.total
                : tab === 'deals'
                  ? deals.data.total
                  : tasks.data.total)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            {t('التالي', 'Next')}
          </button>
        </div>
      )}
    </main>
  );
}
function ContactSelect({ items }: { items: Contact[] }) {
  const { t } = useLocale();
  return (
    <label className="field">
      {t('العميل (من نتائج البحث الحالية)', 'Contact (current search results)')}
      <select name="contactId" required>
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function SimpleForm({
  title,
  fields,
  onSave,
}: {
  title: string;
  fields: string[][];
  onSave: (body: Record<string, string>) => Promise<unknown>;
}) {
  const { t } = useLocale();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError('');
        try {
          await onSave(Object.fromEntries(new FormData(form)) as Record<string, string>);
          form.reset();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{title}</h2>
      <div className="form-grid">
        {fields.map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <input required name={key} />
          </label>
        ))}
      </div>
      {error && <p className="notice error">{error}</p>}
      <button disabled={busy} className="btn mt-4">
        {t('حفظ', 'Save')}
      </button>
    </form>
  );
}
