'use client';
import Link from 'next/link';
import { CSSProperties, useEffect, useState } from 'react';
import { useData } from '../../../components/business/useData';
import { api } from '../../../lib/api';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
export default function Onboarding() {
  const { t } = useLocale();
  const [w, setW] = useState<{
    tenant: {
      name: string;
      settings: { industry?: string };
      onboarding_completed_at: string | null;
    };
    usage: { channels: number; flows: number; agents: number };
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState<{ status: string; type: string; external_id: string }[]>([]);
  const flows = useData<{ id: string; status: 'draft' | 'published'; published_version: number | null; is_component: boolean }[]>(
    '/flows', [],
  );
  const usableFlows = flows.data.filter((flow) => !flow.is_component);
  const published = usableFlows.find((flow) => flow.status === 'published' && flow.published_version !== null);
  const webChannel = channels.find((channel) => channel.status === 'active' && channel.type === 'web');
  const hasActiveChannel = channels.some((channel) => channel.status === 'active');
  const message = useData<{ received: boolean } | null>(
    hasActiveChannel ? '/workspace/onboarding/message-check' : null, null,
  );
  const receivedMessage = message.data?.received === true && !message.error;
  useEffect(() => {
    Promise.all([api<NonNullable<typeof w>>('/workspace'), api<typeof channels>('/channels')])
      .then(([workspace, channelList]) => {
        setW(workspace);
        setChannels(channelList);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function finish() {
    setBusy(true);
    try {
      await api('/workspace/onboarding/complete', { method: 'POST' });
      window.location.assign('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  type Step = {
    key: string;
    ar: string;
    en: string;
    hint: string;
    href: string;
    icon: string;
    done: boolean;
    kind: 'core' | 'try' | 'optional';
  };
  const steps: Step[] = [
    {
      key: 'company',
      kind: 'core',
      icon: 'settings',
      ar: 'عرّف شركتك',
      en: 'Set up your company',
      hint: t('الاسم ومجال العمل والمنطقة الزمنية', 'Name, industry and timezone'),
      href: '/dashboard/settings?tab=company',
      done: !!w?.tenant.settings.industry,
    },
    {
      key: 'channel',
      kind: 'core',
      icon: 'channels',
      ar: 'اربط قناة محادثة',
      en: 'Connect a messaging channel',
      hint: t(
        'ابدأ بويدجت الموقع دون مفاتيح خارجية',
        'Start with website chat; no provider keys required',
      ),
      href: '/dashboard/channels',
      done: hasActiveChannel,
    },
    {
      key: 'bot',
      kind: 'core',
      icon: 'flows',
      ar: 'أنشئ أول بوت من قالب',
      en: 'Create your first bot from a template',
      hint: t(
        'وجود المسودة لا يعني التجربة أو النشر. افتح المصمم لتجربتها ثم انشرها عندما تصبح جاهزة.',
        'A draft does not confirm testing or publication. Open the builder to test, then publish when ready.',
      ),
      href: '/dashboard/flows',
      done: usableFlows.length > 0,
    },
    {
      key: 'try',
      kind: 'try',
      icon: 'play',
      ar: 'جرّب البوت قبل النشر',
      en: 'Test your bot before publishing',
      hint: t(
        'افتح المحادثة التجريبية داخل المصمم وراجع رد البوت. هذه الخطوة تحتاج تحققًا منك.',
        'Open the test chat in the builder and review the bot response. Check this step yourself.',
      ),
      href: usableFlows[0] ? `/dashboard/flows/${usableFlows[0].id}` : '/dashboard/flows',
      done: false,
    },
    {
      key: 'publish',
      kind: 'core',
      icon: 'flows',
      ar: 'انشر البوت',
      en: 'Publish your bot',
      hint: t('انشر نسخة من المصمم بعد مراجعة المحادثة التجريبية.', 'Publish a version from the builder after reviewing the test conversation.'),
      href: usableFlows[0] ? `/dashboard/flows/${usableFlows[0].id}` : '/dashboard/flows',
      done: !!published,
    },
    {
      key: 'message',
      kind: 'core',
      icon: 'inbox',
      ar: 'تحقق من وجود رسالة واردة',
      en: 'Check for an incoming message',
      hint: t('أرسل رسالة من القناة التجريبية وافتح صندوق الوارد للتأكد من الرسالة نفسها.', 'Send a message from the test channel and open the inbox to confirm that specific message.'),
      href: hasActiveChannel ? '#first-message-heading' : '/dashboard/channels',
      done: receivedMessage,
    },
    {
      key: 'team',
      kind: 'optional',
      icon: 'team',
      ar: 'ادعُ فريقك',
      en: 'Invite your team',
      hint: t(
        'اختياري — أضف الموظفين وحدد صلاحياتهم',
        'Optional — add teammates and choose their roles',
      ),
      href: '/dashboard/team',
      done: (w?.usage.agents ?? 0) > 1,
    },
  ];
  const core = steps.filter((s) => s.kind === 'core');
  const doneCount = core.filter((s) => s.done).length;
  const next = core.find((s) => !s.done);
  const pct = Math.round((doneCount / core.length) * 100);
  const nextIndex = next ? steps.indexOf(next) : -1;
  return (
    <main className="ob">
      <header className="ob-hero">
        <div className="ob-hero-text">
          <h1>{t('دليل البداية', 'Getting started')}</h1>
          <p>
            {t(
              'كل خطوة تحفظ تقدمك داخل شركتك. يمكنك العودة في أي وقت.',
              'Your workspace keeps your progress. Return whenever you need.',
            )}
          </p>
          {w?.tenant.name && <span className="badge">{w.tenant.name}</span>}
        </div>
        <div
          className="ob-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={core.length}
          aria-valuenow={doneCount}
          aria-label={t('تقدم الإعداد', 'Setup progress')}
        >
          <span className="ob-ring" style={{ '--p': pct } as CSSProperties}>
            <b>{pct}%</b>
          </span>
          <span className="ob-progress-text">
            <strong>{t(`${doneCount} من ${core.length}`, `${doneCount} of ${core.length}`)}</strong>
            <small>{t('خطوات أساسية مكتملة', 'essential steps done')}</small>
          </span>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {flows.error && <div className="notice error" role="alert">
        {t('تعذّر التحقق من حالة نشر البوت.', 'Could not verify bot publication.')}
        {' '}<button className="btn" type="button" onClick={() => void flows.reload()}>{t('أعد المحاولة', 'Retry')}</button>
      </div>}
      {w && !flows.loading && next && (
        <section className="ob-next">
          <div>
            <small>{t('خطوتك التالية', 'Your next step')}</small>
            <strong>{t(next.ar, next.en)}</strong>
          </div>
          <Link className="btn btn-primary btn-lg" href={next.href}>
            {t('ابدأ الآن', 'Start now')} ↗
          </Link>
        </section>
      )}
      <ol className="ob-steps">
        {steps.map((s, i) => {
          const current = i === nextIndex;
          return (
            <li
              key={s.key}
              className={`ob-step ${s.done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${s.kind !== 'core' ? 'is-soft' : ''}`}
            >
              <span className="ob-step-icon">
                {s.done ? <NavIcon name="check" /> : <NavIcon name={s.icon} />}
              </span>
              <div className="ob-step-body">
                <div className="ob-step-title">
                  <strong>
                    {i + 1}. {t(s.ar, s.en)}
                  </strong>
                  {s.kind === 'optional' && (
                    <span className="badge">{t('اختياري', 'Optional')}</span>
                  )}
                  {s.kind === 'try' && <span className="badge">{t('يدوي', 'Manual')}</span>}
                  {s.kind === 'core' && (
                    <span className={`status-pill ${s.done ? 'is-live' : 'is-draft'}`}>
                      {s.done ? t('مكتملة', 'Done') : t('ناقصة', 'To do')}
                    </span>
                  )}
                </div>
                <small>{s.hint}</small>
              </div>
              <Link
                className={`btn ${current ? 'btn-primary' : ''}`}
                href={s.href}
              >
                {s.done
                  ? t('إدارة', 'Manage')
                  : s.kind === 'try'
                    ? t('افتح المصمم', 'Open builder')
                    : t('ابدأ', 'Start')}
              </Link>
            </li>
          );
        })}
      </ol>
      {hasActiveChannel && (
        <section className="ob-finish" aria-labelledby="first-message-heading">
          <h2 id="first-message-heading">{t('جرّب أول رسالة واردة', 'Try your first incoming message')}</h2>
          <p>{webChannel
            ? t('افتح تجربة محادثة الموقع وأرسل رسالة، ثم ارجع للتحقق من وصولها.', 'Open the website chat demo, send a message, then check that it arrived.')
            : t('أرسل رسالة من حساب اختبار إلى القناة المتصلة، ثم تحقق من وصولها.', 'Send a message from a test account to your connected channel, then check that it arrived.')}</p>
          <div className="form-actions">
            {webChannel && (
              <a className="btn" href={`/widget-demo.html?key=${encodeURIComponent(webChannel.external_id)}`}
                target="_blank" rel="noopener noreferrer">
                {t('افتح تجربة محادثة الموقع', 'Open website chat demo')}
              </a>
            )}
            <button className="btn btn-primary" type="button" disabled={message.loading} onClick={() => void message.reload()}>
              {t('تحقق من الرسالة', 'Check for a message')}
            </button>
            {receivedMessage && <Link className="btn" href="/dashboard/inbox">{t('افتح صندوق الوارد', 'Open inbox')}</Link>}
          </div>
          <p role="status">{message.loading
            ? t('جارٍ التحقق من الرسائل…', 'Checking for messages…')
            : message.error
              ? t('تعذّر التحقق. أعد المحاولة.', 'Unable to check. Retry.')
              : receivedMessage
                ? t('توجد رسالة واردة في مساحة العمل. افتح صندوق الوارد للتأكد من رسالة الاختبار.', 'An incoming message exists in this workspace. Open the inbox to confirm your test message.')
                : t('لم تصل رسالة واردة بعد.', 'No incoming message yet.')}</p>
        </section>
      )}
      <section className="ob-finish">
        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy || !hasActiveChannel} onClick={finish}>
            {t('سجّل الإعداد الأولي وافتح اللوحة', 'Save initial setup and open dashboard')}
          </button>
          <Link className="btn" href="/dashboard">
            {t('المتابعة لاحقًا', 'Continue later')}
          </Link>
        </div>
        <p className="muted">
          {t(
            'يتطلب تسجيل الإعداد الأولي قناة نشطة. يعرض الدليل حالة النشر والرسائل الواردة بشكل مستقل.',
            'Saving initial setup requires an active channel. The guide tracks publication and incoming messages separately.',
          )}
        </p>
      </section>
    </main>
  );
}
