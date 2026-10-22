'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../lib/api';
import { Graph } from '../../../../lib/flow-types';
import { useLocale } from '../../../../components/product/locale';
import { useData } from '../../../../components/business/useData';
export default function BotWizard() {
  const { t } = useLocale();
  const templates = useData<{ id: string; name: string; description: string }[]>(
    '/flows/templates',
    [],
  );
  const channels = useData<{ id: string; name: string; type: string }[]>('/channels', []);
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState('');
  const [name, setName] = useState('');
  const [welcome, setWelcome] = useState('');
  const [channel, setChannel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  async function create() {
    setBusy(true);
    setError('');
    let id = created;
    try {
      if (!id) {
        const flow = await api<{ id: string }>('/flows', {
          method: 'POST',
          body: JSON.stringify({ name, templateId: template }),
        });
        id = flow.id;
        setCreated(id);
      }
      const flow = await api<{ draft_graph: Graph; updated_at: string }>(`/flows/${id}`);
      const graph = flow.draft_graph;
      const first = graph.nodes.find((n) => n.id === graph.startNodeId);
      if (first?.type === 'message') first.data.text = welcome;
      else {
        const start = 'wizard_welcome';
        graph.nodes = graph.nodes.filter((n) => n.id !== start);
        graph.nodes.unshift({
          id: start,
          type: 'message',
          position: { x: 120, y: -160 },
          data: { text: welcome },
          edges: { next: graph.startNodeId },
        });
        graph.startNodeId = start;
      }
      await api(`/flows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedUpdatedAt: flow.updated_at, graph, channelIds: [channel] }),
      });
      window.location.assign(`/dashboard/flows/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="p-5 max-w-4xl mx-auto stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUILD YOUR FIRST BOT</p>
          <h1>{t('بوتك الأول في ثلاث خطوات', 'Your first bot in three steps')}</h1>
          <p>
            {t(
              'سننشئ مسودة حقيقية، ثم تراجع السيناريو وتجربه قبل نشره.',
              'Create a real draft, then review and test it before publishing.',
            )}
          </p>
        </div>
        <Link className="btn" href="/dashboard/flows">
          {t('العودة', 'Back')}
        </Link>
      </div>
      <div className="progress-track">
        <div style={{ width: (step / 3) * 100 + '%' }} />
      </div>
      {(error || templates.error || channels.error) && (
        <p className="notice error">{error || templates.error || channels.error}</p>
      )}
      {created && error && (
        <Link className="btn" href={`/dashboard/flows/${created}`}>
          {t('المسودة محفوظة — أكملها في المحرر', 'Draft saved — continue in editor')}
        </Link>
      )}
      {step === 1 && (
        <section className="card stack">
          <h2>{t('1. ما هدف البوت؟', '1. What should your bot do?')}</h2>
          <div className="card-grid">
            {templates.data.map((x) => (
              <button
                className="card text-start"
                style={{ borderColor: template === x.id ? '#0f766e' : undefined }}
                key={x.id}
                onClick={() => setTemplate(x.id)}
              >
                <strong>{x.name}</strong>
                <p className="muted">{x.description}</p>
                {template === x.id && <span className="badge">✓ {t('محدد', 'Selected')}</span>}
              </button>
            ))}
          </div>
          <label className="field">
            {t('اسم يساعد فريقك على تمييزه', 'A name your team will recognize')}
            <input maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button
            className="btn btn-primary self-start"
            disabled={!template || !name.trim()}
            onClick={() => setStep(2)}
          >
            {t('التالي', 'Next')}
          </button>
        </section>
      )}
      {step === 2 && (
        <section className="card stack">
          <h2>
            {t('2. رحّب بعميلك واختر القناة', '2. Welcome your customer and choose a channel')}
          </h2>
          <label className="field">
            {t('رسالة ترحيب بنشاطك', 'Your business welcome message')}
            <textarea
              rows={4}
              maxLength={4096}
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              placeholder={t(
                'مرحبًا بك في شركتنا! كيف نساعدك؟',
                'Welcome to our business! How can we help?',
              )}
            />
          </label>
          <label className="field">
            {t('القناة التي سيعمل عليها البوت', 'Channel for this bot')}
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">{t('اختر قناة', 'Choose a channel')}</option>
              {channels.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.type}
                </option>
              ))}
            </select>
          </label>
          {!channels.data.length && (
            <Link className="btn" href="/dashboard/channels">
              {t('أضف قناة أولًا', 'Connect a channel first')}
            </Link>
          )}
          <div className="form-actions">
            <button className="btn" onClick={() => setStep(1)}>
              {t('السابق', 'Back')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!welcome.trim() || !channel}
              onClick={() => setStep(3)}
            >
              {t('مراجعة', 'Review')}
            </button>
          </div>
        </section>
      )}
      {step === 3 && (
        <section className="card stack">
          <h2>{t('3. راجع ثم افتح المحرر', '3. Review, then open the editor')}</h2>
          <p>
            <strong>{name}</strong> · {templates.data.find((x) => x.id === template)?.name} ·{' '}
            {channels.data.find((x) => x.id === channel)?.name}
          </p>
          <p className="notice whitespace-pre-wrap">{welcome}</p>
          <p className="muted">
            {t(
              'سنحفظ مسودة مرتبطة بالقناة. أكمل محتوى القالب، شغّل التجربة من المحرر، ثم انشر عندما تكون جاهزًا.',
              'A draft will be saved for this channel. Complete the template content, run the editor preview and publish when ready.',
            )}
          </p>
          <div className="form-actions">
            <button className="btn" disabled={busy} onClick={() => setStep(2)}>
              {t('تعديل', 'Edit')}
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={create}>
              {busy
                ? t('جارٍ إنشاء المسودة…', 'Creating draft…')
                : t('إنشاء المسودة وفتح المصمم', 'Create draft & open builder')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
