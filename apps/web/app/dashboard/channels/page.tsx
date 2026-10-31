'use client';
import { useEffect, useState } from 'react';
import ChannelLogo from '../../../components/product/ChannelLogo';
import { NavIcon } from '../../../components/product/NavIcon';
import Link from 'next/link';
import MetaConnect from '../../../components/product/MetaConnect';
import ChannelCatalog from '../../../components/product/ChannelCatalog';
import ChannelSettings from '../../../components/product/ChannelSettings';
import { useLocale } from '../../../components/product/locale';
import { statusLabel } from '../../../components/product/status';
import { Dialog } from '../../../components/product/ProductUI';
import { api, getSession } from '../../../lib/api';

type BotReadiness = {
  active: boolean;
  publishedFlowCount: number;
  flowTriggers: { name: string; types: string[]; draftSteps: number; publishedSteps: number; publishedReplies: number; matchesTestKeyword: boolean }[];
  activeConversationsBot: number;
  activeConversationsHuman: number;
  recentBotReplies: number;
  recentSent: number;
  recentBlocked: number;
  recentFailed: number;
  previewBotEnabled: boolean;
  previewConversation: null | {
    handledBy: string;
    status: string;
    lastInboundAt: string | null;
    sessionStatus: string | null;
    sessionWaitKind: string | null;
    sessionCreatedAt: string | null;
    pendingInboundEvents: number;
  };
};

type WhatsAppAuthDiagnostics = {
  token: {
    status: 'granted' | 'missing_permission' | 'invalid_token' | 'wrong_app' | 'unknown';
    expiresAt: string | null;
    dataAccessExpiresAt?: string | null;
    managementGranted?: boolean;
    tokenType?: string | null;
    reason: string;
  };
  recentFailures: {
    createdAt: string;
    messageStatus: string;
    jobStatus: string | null;
    category: 'authentication' | 'permission' | 'provider_limit' | 'delivery_blocked' | 'other';
    code: string | null;
  }[];
  checkedAt: string;
  connectionHealth?: Channel['connectionHealth'];
};

type Channel = {
  id: string;
  type: string;
  name: string;
  external_id: string;
  status: string;
  widgetSnippet?: string;
  settings?: Record<string, unknown>;
  connectionHealth?: { state: string; checkedAt: string | null; reason: string };
};

const CHANNEL_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  web: 'Webchat',
};
const FIELDS: Record<string, { key: string; label: string }[]> = {
  telegram: [{ key: 'botToken', label: 'BotFather token' }],
  web: [],
};

export default function Channels() {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState('');
  const [items, setItems] = useState<Channel[]>([]);
  const [botDiagnostics, setBotDiagnostics] = useState<Record<string, BotReadiness>>({});
  const [authDiagnostics, setAuthDiagnostics] = useState<Record<string, WhatsAppAuthDiagnostics>>({});
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [replacementToken, setReplacementToken] = useState('');
  const [tokenNotice, setTokenNotice] = useState('');

  const [type, setType] = useState('web');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('whatsapp');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [connectOpen, setConnectOpen] = useState(false);
  const [availableOpen, setAvailableOpen] = useState(true);
  const [platform, setPlatform] = useState('all');
  const stateOf = (c: Channel) =>
    c.connectionHealth?.state ?? (c.status === 'disabled' ? 'disconnected' : 'needs_action');
  const stateLabels: Record<string, string> = {
    connected: t('اتصال متحقق', 'Verified connection'),
    needs_action: t('يحتاج إجراء', 'Needs action'),
    expired: t('تفويض منتهٍ', 'Authorization expired'),
    disconnected: t('متوقف', 'Disconnected'),
  };
  const visible = items.filter(
    (c) =>
      (platform === 'all' || c.type === platform) &&
      (filter === 'all' || stateOf(c) === filter) &&
      `${c.name} ${c.type}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function verify(c: Channel) {
    setBusy(true);
    setError('');
    try {
      const health = await api<NonNullable<Channel['connectionHealth']>>(
        `/channels/${c.id}/verify`,
        { method: 'POST' },
      );
      setItems((rows) =>
        rows.map((row) => (row.id === c.id ? { ...row, connectionHealth: health } : row)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function inspectBot(c: Channel) {
    setBusy(true);
    setError('');
    try {
      const result = await api<BotReadiness>(`/channels/${c.id}/bot-readiness`);
      setBotDiagnostics((prev) => ({ ...prev, [c.id]: result }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restartPreviewBot(c: Channel) {
    if (!window.confirm(t(
      'سيتم إرجاع محادثة الاختبار وحدها إلى البوت وإنهاء أي سؤال منتظر قديم. المحادثات الأخرى لن تتأثر. هل تريد المتابعة؟',
      'Return ONLY the preview conversation to the bot and expire any old waiting step? Other conversations stay unchanged.',
    ))) return;
    setBusy(true);
    setError('');
    try {
      await api(`/channels/${c.id}/preview-restart`, {
        method: 'POST', body: JSON.stringify({ confirm: true }),
      });
      const result = await api<BotReadiness>(`/channels/${c.id}/bot-readiness`);
      setBotDiagnostics((prev) => ({ ...prev, [c.id]: result }));
      setTokenNotice(t(
        'تمت إعادة محادثة التجربة للبوت. ابعت رسالة واتساب عادية جديدة وجرب الرد.',
        'Preview conversation returned to the bot. Send an ordinary WhatsApp message to test.',
      ));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function inspectWhatsAppAuth(c: Channel) {
    setBusy(true);
    setError('');
    try {
      const result = await api<WhatsAppAuthDiagnostics>(`/channels/${c.id}/whatsapp-auth-diagnostics`);
      setAuthDiagnostics((prev) => ({ ...prev, [c.id]: result }));
      if (result.connectionHealth) setItems((rows) => rows.map((row) => row.id === c.id ? { ...row, connectionHealth: result.connectionHealth } : row));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rotateWhatsAppToken(event: React.FormEvent<HTMLFormElement>, c: Channel) {
    event.preventDefault();
    if (busy || replacementToken.trim().length < 10) return;
    setBusy(true);
    setError('');
    setTokenNotice('');
    try {
      await api(`/channels/${c.id}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ accessToken: replacementToken.trim() }),
      });
      setReplacementToken('');
      setEditingTokenId(null);
      setAuthDiagnostics((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      setTokenNotice(t(
        'تم التحقق من صلاحية التوكين ووصوله لنفس رقم واتساب وحفظه. افحص اتصال المزود للتأكد من اشتراك Webhook. لا تُعتبر هذه الخطوة اختبار إرسال حي.',
        'The token was validated for messaging and this exact phone, then saved. Verify the webhook subscription next. This is not a live delivery test.',
      ));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const load = () =>
    api<Channel[]>('/channels')
      .then((rows) => {
        setItems(rows);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaved(false);
    setError('');
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: Record<string, unknown> = { type, name: f.get('name') };
    if (type !== 'web') {
      body.credentials = Object.fromEntries(FIELDS[type].map((x) => [x.key, f.get(x.key)]));
    }
    try {
      await api('/channels', { method: 'POST', body: JSON.stringify(body) });
      form.reset();
      await load();
      setSaved(true);
      setConnectOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/channels/${id}`, { method: 'DELETE' });
      setDeleting(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('ربط الحساب', 'Connect Account')}</h1>
          <p>
            {t(
              'اربط منصاتك وابدأ أتمتة المحادثات.',
              'Connect your favorite platforms and start automating conversations.',
            )}
          </p>
        </div>
      </div>

      <section className="card stack" aria-label={t('حالة الحسابات', 'Account status')}>
        <h2>{t('الحسابات المتصلة', 'Connected Accounts')}</h2>
        <label className="field">
          {t('المنصة', 'Platform')}
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">{t('كل المنصات', 'All platforms')}</option>
            {['whatsapp', 'facebook', 'instagram', 'telegram', 'web'].map((type) => (
              <option key={type} value={type}>
                {CHANNEL_NAMES[type] || type}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          {['all', 'connected', 'needs_action', 'expired', 'disconnected'].map((state) => (
            <button
              type="button"
              className="btn"
              key={state}
              aria-pressed={filter === state}
              onClick={() => setFilter(state)}
            >
              {state === 'all' ? t('الكل', 'All') : stateLabels[state]} ·{' '}
              {state === 'all' ? items.length : items.filter((c) => stateOf(c) === state).length}
            </button>
          ))}
        </div>
        <label className="field">
          {t('بحث بالاسم أو القناة', 'Search by name or channel')}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <p className="muted">
          {t(
            'تفعيل القناة محليًا لا يثبت الاتصال بالمزود. أعد الفحص بعد تغيير التفويض؛ صلاحية نتيجة الفحص 24 ساعة. ويدجت الموقع يحتاج تثبيتًا وتجربة.',
            'Local activation does not prove provider connectivity. Recheck after authorization changes; evidence expires after 24 hours. Website widgets need installation and a test.',
          )}
        </p>
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}{' '}
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {t('إعادة التحميل', 'Reload')}
          </button>
        </p>
      )}
      {tokenNotice && <p className="notice" role="status">{tokenNotice}</p>}
      {saved && (
        <p className="notice" role="status">
          {t('أُضيفت القناة.', 'Channel added.')}
        </p>
      )}
      {loading && <p role="status">{t('جارٍ تحميل القنوات…', 'Loading channels…')}</p>}

      <ul className="mb-8 flex flex-col gap-3">
        {visible.map((c) => (
          <li key={c.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <strong className="connected-account-name">
                <span className="connected-account-logo" data-channel={c.type}>
                  <ChannelLogo id={c.type} />
                </span>
                {c.name}{' '}
                <span className="text-sm text-gray-500">
                  (
                  {
                    (
                      {
                        web: t('ويدجت الموقع', 'Website widget'),
                        whatsapp: 'WhatsApp',
                        facebook: 'Facebook Messenger',
                        instagram: 'Instagram',
                        telegram: 'Telegram',
                      } as Record<string, string>
                    )[c.type]
                  }
                  ) · {statusLabel(c.status, t)} · {stateLabels[stateOf(c)]}
                </span>
              </strong>
              <button disabled={busy} onClick={() => setDeleting(c)} className="btn btn-danger">
                {t('حذف', 'Delete')}
              </button>
            </div>
            {c.connectionHealth?.checkedAt && (
              <p>
                {t('آخر فحص', 'Last check')}:{' '}
                <time dateTime={c.connectionHealth.checkedAt}>
                  {new Date(c.connectionHealth.checkedAt).toLocaleString()}
                </time>
              </p>
            )}
            {c.type !== 'web' && (
              <button
                type="button"
                className="btn"
                disabled={busy || c.status !== 'active'}
                onClick={() => verify(c)}
              >
                {t('فحص الاتصال بالمزود', 'Verify provider connection')}
              </button>
            )}
            {c.type === 'whatsapp' && (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => inspectBot(c)}>
                  {t('تشخيص ردود البوت', 'Diagnose bot replies')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => inspectWhatsAppAuth(c)}>
                  {t('فحص صلاحيات الإرسال وأخطاء Meta', 'Check Meta messaging permissions and errors')}
                </button>
                {authDiagnostics[c.id] && (
                  <section className="card stack" role="status">
                    <strong>{t('تشخيص صلاحية إرسال واتساب', 'WhatsApp outbound authorization')}</strong>
                    <p>{t('صلاحية التوكين للإرسال', 'Messaging token permission')}: {
                      ({
                        granted: t('موجودة', 'Granted'),
                        missing_permission: t('ناقصة: whatsapp_business_messaging', 'Missing whatsapp_business_messaging'),
                        invalid_token: t('التوكين غير صالح أو منتهي', 'Token invalid or expired'),
                        wrong_app: t('التوكين تابع لتطبيق Meta مختلف', 'Token belongs to a different Meta app'),
                        unknown: t('تعذّر التحقق من الصلاحيات', 'Permission check unavailable'),
                      } as Record<string, string>)[authDiagnostics[c.id].token.status]
                    }</p>
                    {authDiagnostics[c.id].token.expiresAt && (
                      <p>{t('انتهاء التوكين', 'Token expiry')}: {new Date(authDiagnostics[c.id].token.expiresAt!).toLocaleString()}</p>
                    )}
                    {authDiagnostics[c.id].token.managementGranted === false && <p className="notice">{t('صلاحية إدارة حساب واتساب غير موجودة؛ قد يتعذر فحص اشتراك Webhook.', 'WhatsApp management permission is missing; webhook subscription checks may fail.')}</p>}
                    {authDiagnostics[c.id].token.tokenType === 'USER' && <p className="notice">{t('هذا توكين مستخدم. استخدم تفويض Embedded Signup أو System User المناسب للتشغيل المستمر.', 'This is a user token. Use Embedded Signup authorization or the appropriate System User for ongoing operation.')}</p>}
                    {authDiagnostics[c.id].token.status === 'granted' && !authDiagnostics[c.id].token.expiresAt && <p>{t('لم تُبلغ Meta عن موعد انتهاء للتوكين؛ يظل قابلاً للإلغاء.', 'Meta reported no scheduled token expiry; access can still be revoked.')}</p>}
                    <p>{t('أخطاء الإرسال المسجلة آخر 6 ساعات', 'Outbound failures in last 6h')}: {authDiagnostics[c.id].recentFailures.length}</p>
                    {authDiagnostics[c.id].recentFailures.slice(0, 5).map((failure, i) => (
                      <p key={i}>
                        {new Date(failure.createdAt).toLocaleTimeString()} — {
                          ({
                            authentication: t('خطأ مصادقة من المزود', 'Provider authentication error'),
                            permission: t('نقص صلاحيات', 'Insufficient permission'),
                            provider_limit: t('حد إرسال من المزود', 'Provider rate limit'),
                            delivery_blocked: t('منع إرسال محلي', 'Local delivery blocked'),
                            other: t('خطأ إرسال آخر', 'Other outbound error'),
                          } as Record<string, string>)[failure.category]
                        }{failure.code ? ` (#${failure.code})` : ''}
                      </p>
                    ))}
                    {authDiagnostics[c.id].recentFailures.some((failure) =>
                      ['authentication', 'permission'].includes(failure.category),
                    ) || ['invalid_token', 'missing_permission', 'wrong_app'].includes(authDiagnostics[c.id].token.status) ? (
                      <p className="notice">{t(
                        'الربط واستقبال الرسائل لا يضمنان صلاحية الإرسال. أنشئ توكين من تطبيق Bot two بصلاحية whatsapp_business_messaging وwhatsapp_business_management، ثم حدّث التوكين فقط هنا.',
                        'Receiving messages does not prove outgoing permission. Generate a token for the Bot two Meta app with whatsapp_business_messaging and whatsapp_business_management, then update only the token here.',
                      )}</p>
                    ) : null}
                  </section>
                )}
                {authDiagnostics[c.id] && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setEditingTokenId(editingTokenId === c.id ? null : c.id);
                      setReplacementToken('');
                      setTokenNotice('');
                    }}
                  >
                    {t('تحديث توكين Meta لنفس الرقم', 'Update Meta token for this number')}
                  </button>
                )}
                {editingTokenId === c.id && (
                  <form className="card stack" onSubmit={(event) => rotateWhatsAppToken(event, c)}>
                    <label className="field">
                      {t('توكين جديد من Meta (لا يظهر ولا يُعاد عرضه)', 'New Meta token (never displayed again)')}
                      <input
                        type="password"
                        autoComplete="off"
                        required
                        minLength={10}
                        value={replacementToken}
                        onChange={(event) => setReplacementToken(event.target.value)}
                      />
                    </label>
                    <p>{t('يُحدَّث رمز الوصول فقط؛ لا يتغيّر الرقم أو Phone Number ID أو Coexistence. الرسائل الفاشلة لن يعاد إرسالها تلقائيًا.', 'Only the access token changes; the phone number and Coexistence stay intact. Previously failed messages are not automatically retried.')}</p>
                    <button type="submit" className="btn" disabled={busy || replacementToken.trim().length < 10}>
                      {t('حفظ التوكين على القناة الحالية', 'Save token to existing channel')}
                    </button>
                  </form>
                )}
                {botDiagnostics[c.id] && (
                  <section className="card stack" role="status">
                    <strong>{t('تشخيص إرسال الرد الآلي', 'Bot reply diagnostics')}</strong>
                    <p>{t('عدد البوتات المنشورة لهذه القناة', 'Published flows on this channel')}: {botDiagnostics[c.id].publishedFlowCount}</p>
                    <p>{t('المحادثات المسندة للبوت', 'Bot-owned conversations')}: {botDiagnostics[c.id].activeConversationsBot} · {t('للموظفين', 'Human-owned')}: {botDiagnostics[c.id].activeConversationsHuman}</p>
                    <p>{t('ردود البوت المنشأة آخر 6 ساعات', 'Bot replies created in last 6h')}: {botDiagnostics[c.id].recentBotReplies} · {t('ردود أُرسلت', 'Sent replies')}: {botDiagnostics[c.id].recentSent} · {t('إرسال محظور', 'Blocked deliveries')}: {botDiagnostics[c.id].recentBlocked} · {t('إرسال فاشل', 'Failed deliveries')}: {botDiagnostics[c.id].recentFailed}</p>
                    <p>{t('وضع إرسال البوت التجريبي', 'Scoped preview bot delivery')}: {botDiagnostics[c.id].previewBotEnabled ? t('مفعّل', 'Enabled') : t('غير مفعّل', 'Disabled')}</p>
                    {botDiagnostics[c.id].previewConversation && (
                      <section className="stack">
                        <strong>{t('حالة محادثة واتساب التجريبية الحالية', 'Current preview conversation status')}</strong>
                        <p>{t('المسؤول', 'Owner')}: {botDiagnostics[c.id].previewConversation!.handledBy === 'bot' ? t('البوت', 'Bot') : t('الموظف', 'Human')}</p>
                        <p>{t('حالة المحادثة', 'Conversation')}: {botDiagnostics[c.id].previewConversation!.status}</p>
                        <p>{t('جلسة البوت', 'Flow session')}: {botDiagnostics[c.id].previewConversation!.sessionStatus || t('لا توجد', 'None')} {botDiagnostics[c.id].previewConversation!.sessionWaitKind ? `(${botDiagnostics[c.id].previewConversation!.sessionWaitKind})` : ''}</p>
                        <p>{t('أحداث الاستقبال المعلقة أو الفاشلة', 'Pending/failed inbound events')}: {botDiagnostics[c.id].previewConversation!.pendingInboundEvents}</p>
                        {botDiagnostics[c.id].previewBotEnabled && (
                          <button className="btn" type="button" disabled={busy} onClick={() => restartPreviewBot(c)}>
                            {t('إعادة تشغيل البوت لمحادثة التجربة فقط', 'Restart bot for this preview conversation only')}
                          </button>
                        )}
                      </section>
                    )}
                    {botDiagnostics[c.id].flowTriggers.map((f, idx) => (
                      <div key={idx}>
                        <p><strong>{f.name}</strong>: {f.types.join(', ')}</p>
                        <p>{t('خطوات النسخة المنشورة', 'Published steps')}: {f.publishedSteps} · {t('خطوات المسودة', 'Draft steps')}: {f.draftSteps} · {t('خطوات الرسائل والأسئلة المنشورة', 'Published message and question steps')}: {f.publishedReplies}</p>
                        {f.draftSteps > f.publishedSteps && <p className="notice">{t('المسودة فيها خطوات أكثر من المنشور. احفظ وانشر أحدث نسخة من محرر البوت.', 'The draft has more steps than the published version. Save and publish the latest version in the bot editor.')}</p>}
                      </div>
                    ))}
                    {botDiagnostics[c.id].activeConversationsHuman > 0 && <p className="notice">{t('المحادثات المستلمة بواسطة موظف لا يرد عليها البوت. أعد محادثة التجربة للبوت من Inbox عند انتهاء الموظف.', 'The bot does not reply in human-owned conversations. Return the test conversation to the bot from Inbox when the agent is finished.')}</p>}
                    {botDiagnostics[c.id].previewBotEnabled && botDiagnostics[c.id].flowTriggers.filter((f) => f.types.includes('first_message')).length > 1 && <p className="notice">{t('يوجد أكثر من بوت ترحيب لهذه القناة؛ إعادة التشغيل التجريبية الآمنة تتطلب بوت ترحيب واحدًا. راجع قنوات تشغيل البوتات قبل التجربة.', 'More than one welcome flow matches this channel. Safe preview restart requires one welcome flow. Review flow channel bindings before testing.')}</p>}
                    {!botDiagnostics[c.id].publishedFlowCount && (
                      <p className="notice">{t('انشر بوتًا واربطه بقناة واتساب. ليس مطلوبًا كتابة أي رسالة اختبار خاصة.', 'Publish a flow linked to WhatsApp. No special test keyword is needed.')}</p>
                    )}
                  </section>
                )}
              </>
            )}
            {c.connectionHealth?.reason && (
              <p className="muted">
                {
                  (
                    {
                      authorization_expiring: t('تفويض Meta ينتهي خلال 7 أيام. جدّد التفويض قبل توقف الإرسال.', 'Meta authorization expires within 7 days. Renew it before delivery stops.'),
                      messaging_permission_required: t('تعذّر إثبات صلاحية إرسال واتساب. افحص صلاحيات Meta.', 'WhatsApp messaging permission is not verified. Check Meta authorization.'),
                      authorization_unavailable: t('تعذر التحقق من تفويض Meta الآن. أعد الفحص قبل اعتماد الاتصال.', 'Meta authorization could not be verified. Check again before relying on the connection.'),
                      provider_verified: t(
                        'تم التحقق من الحساب لدى المزود.',
                        'Provider account verified.',
                      ),
                      authorization_expired: t(
                        'أعد التفويض من مسار الربط الرسمي.',
                        'Authorize again through the official connection.',
                      ),
                      provider_unreachable: t(
                        'تعذر الوصول للمزود. أعد المحاولة لاحقًا.',
                        'Provider unreachable. Try later.',
                      ),
                      provider_rejected: t(
                        'راجع صلاحيات الحساب ثم أعد التفويض.',
                        'Review account permissions and authorize again.',
                      ),
                      waba_not_subscribed: t(
                        'تطبيق Meta غير مشترك في حساب واتساب هذا. راجع Subscribe webhooks في Production setup على WABA الصحيح.',
                        'The Meta app is not subscribed to this WABA. Check Subscribe webhooks on the correct WABA in Production setup.',
                      ),
                      waba_webhook_override: t(
                        'حساب واتساب يرسل إشعاراته إلى عنوان Webhook مختلف. راجع إعداد Override لدى Meta.',
                        'This WABA uses another webhook URL override. Review the Meta override settings.',
                      ),
                      waba_subscription_unverified: t(
                        'تعذّر تأكيد اشتراك WABA؛ راجع WABA ID وإعداد META_APP_ID.',
                        'WABA subscription could not be confirmed; check WABA ID and META_APP_ID.',
                      ),
                      waba_subscription_check_failed: t(
                        'تعذّر قراءة اشتراكات WABA. تأكد أن التوكين له صلاحية whatsapp_business_management.',
                        'Unable to read WABA subscriptions. Ensure the token has whatsapp_business_management permission.',
                      ),
                      external_access_disabled: t(
                        'الفحص الخارجي غير مفعّل لدى مسؤول المنصة.',
                        'External verification is disabled by the operator.',
                      ),
                      verification_required: t(
                        'يلزم فحص حديث للمزود.',
                        'A recent provider check is required.',
                      ),
                      widget_installation_required: t(
                        'ثبّت الويدجت ثم جرّب المحادثة.',
                        'Install the widget and try a conversation.',
                      ),
                      disabled_locally: t('القناة متوقفة محليًا.', 'Channel disabled locally.'),
                    } as Record<string, string>
                  )[c.connectionHealth.reason]
                }
              </p>
            )}
            <ChannelSettings channel={c} onSaved={load} />
            {c.type === 'whatsapp' && (
              <Link className="btn mt-3" href={`/dashboard/channels/${c.id}/templates`}>
                {t('إدارة قوالب WhatsApp', 'Manage WhatsApp templates')} ↗
              </Link>
            )}
            {c.widgetSnippet && (
              <>
                <p className="mt-2 text-sm">
                  {t(
                    'الصق الكود في موقعك قبل </body>:',
                    'Paste this code before </body> on your website:',
                  )}
                </p>
                <pre dir="ltr" className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
                  {c.widgetSnippet}
                </pre>
                <div className="form-actions">
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(c.widgetSnippet!);
                        setCopied(c.id);
                      } catch {
                        setError(
                          t(
                            'تعذر النسخ التلقائي. انسخ الكود الظاهر يدويًا.',
                            'Automatic copy failed. Copy the displayed code manually.',
                          ),
                        );
                      }
                    }}
                  >
                    {copied === c.id
                      ? t('تم نسخ الكود', 'Code copied')
                      : t('نسخ كود التثبيت', 'Copy installation code')}
                  </button>
                  <a
                    className="btn"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={'/widget-demo.html?key=' + encodeURIComponent(c.external_id)}
                  >
                    {t('جرّب الويدجت', 'Try widget')}
                  </a>
                </div>
                <p role="status">
                  {copied === c.id &&
                    t(
                      'أرسل الكود لمسؤول موقعك وأضفه قبل إغلاق body. اضبط المواقع المسموحة من إعدادات القناة.',
                      'Share the code with your website administrator and insert before closing body. Set allowed origins in channel settings.',
                    )}
                </p>
                <p className="mt-1 text-xs">
                  {t('للتجربة:', 'Try it:')} <code>/widget-demo.html?key={c.external_id}</code>
                </p>
              </>
            )}
          </li>
        ))}
        {!loading && !visible.length && (
          <li className="empty">
            {t(
              'لا توجد قنوات بعد. أضف ويدجت لتجربة أول محادثة.',
              'No channels yet. Add a website widget for your first conversation.',
            )}
          </li>
        )}
      </ul>

      <section className="card stack">
        <header className="page-heading">
          <h2>{t('الاتصالات المتاحة', 'Available Connections')}</h2>
          <button
            type="button"
            className="btn"
            aria-expanded={availableOpen}
            aria-label={
              availableOpen
                ? t('تصغير الاتصالات المتاحة', 'Minimize available connections')
                : t('توسيع الاتصالات المتاحة', 'Expand available connections')
            }
            onClick={() => setAvailableOpen(!availableOpen)}
          >
            <span
              style={{ display: 'flex', transform: availableOpen ? 'rotate(180deg)' : undefined }}
            >
              <NavIcon name="chevron" />
            </span>
          </button>
        </header>
        {availableOpen && (
          <>
            <ChannelCatalog
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                if (id === 'web' || id === 'telegram') setType(id);
                setConnectOpen(true);
              }}
            />
          </>
        )}
      </section>
      <Dialog
        open={connectOpen}
        onClose={() => {
          if (!busy) setConnectOpen(false);
        }}
        title={t('ربط الحساب', 'Connect Account') + ' · ' + (CHANNEL_NAMES[selected] || selected)}
      >
        {['web', 'telegram'].includes(selected) ? (
          <>
            <form onSubmit={create} className="card stack">
              {type === 'telegram' && (
                <p className="notice">
                  {t(
                    'أنشئ بوتًا من @BotFather وأدخل رمزه. لا تُسجل الإضافة Webhook تلقائيًا؛ افتح إعدادات القناة لتسجيله صراحة بعد توفير عنوان HTTPS عام. المجموعات اختيارية من إعدادات القناة؛ تُحمّل الوسائط عبر مسار محمي دون إظهار الرمز.',
                    'Create a bot with @BotFather and enter its token. Adding a channel does not register a webhook automatically; open channel settings to explicitly register it after configuring public HTTPS. Groups are opt-in in channel settings; media downloads use an authenticated route without exposing the bot token.',
                  )}
                </p>
              )}
              <label className="field">
                {t('اسم القناة', 'Channel name')}
                <input name="name" required maxLength={80} />
              </label>
              {FIELDS[type].map((x) => (
                <label className="field" key={x.key + type}>
                  {(
                    {
                      phoneNumberId: t('معرّف رقم الهاتف', 'Phone Number ID'),
                      wabaId: t('معرّف حساب WhatsApp Business', 'WhatsApp Business Account ID'),
                      accessToken: t('رمز الوصول', 'Access Token'),
                      pageId: t('معرّف الصفحة', 'Page ID'),
                      pageAccessToken: t('رمز وصول الصفحة', 'Page Access Token'),
                      igAccountId: t('معرّف حساب Instagram', 'Instagram Account ID'),
                      botToken: t('رمز البوت من BotFather', 'BotFather bot token'),
                    } as Record<string, string>
                  )[x.key] || x.label}
                  <input
                    type={x.key.toLowerCase().includes('token') ? 'password' : 'text'}
                    autoComplete="off"
                    name={x.key}
                    required
                    dir="ltr"
                    className="rounded border p-2"
                  />
                </label>
              ))}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? t('جارٍ الإضافة…', 'Adding…') : t('إضافة القناة', 'Add channel')}
              </button>
            </form>
          </>
        ) : (
          <MetaConnect
            onSaved={() => {
              void load();
              setConnectOpen(false);
            }}
            selectedKind={selected}
          />
        )}
      </Dialog>
      <Dialog
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('حذف القناة ومحادثاتها؟', 'Delete channel and its conversations?')}
      >
        <p>{deleting?.name}</p>
        <p>
          {t(
            'سيحذف هذا الإجراء القناة ومحادثاتها.',
            'This removes the channel and its conversations.',
          )}
        </p>
        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={() => setDeleting(null)}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => deleting && void remove(deleting.id)}
          >
            {t('تأكيد الحذف', 'Confirm deletion')}
          </button>
        </div>
      </Dialog>
    </main>
  );
}
