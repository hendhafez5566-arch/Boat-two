'use client';
import { useState } from 'react';
import { useLocale } from '../product/locale';
type Provider = {
  id: string;
  name: string;
  kind: string;
  model: string;
  enabled: boolean;
  revision: number;
  retired_at: string | null;
  supports_tools: boolean;
  input_microusd_per_million: string | null;
  output_microusd_per_million: string | null;
};
export function ProviderEditor({
  provider: p,
  busy,
  act,
}: {
  provider: Provider;
  busy: boolean;
  act: (path: string, body: unknown, method?: string) => Promise<void>;
}) {
  const { t } = useLocale();
  const [confirm, setConfirm] = useState(false);
  const path = '/agents/providers/' + p.id;
  return (
    <article className="card stack">
      <div className="page-heading">
        <div>
          <strong>{p.name}</strong>
          <p dir="ltr">
            {p.kind} · {p.model}
          </p>
        </div>
        <span>
          {p.retired_at
            ? t('متقاعد', 'Retired')
            : p.enabled
              ? t('مفعّل', 'Enabled')
              : t('معطّل', 'Disabled')}
        </span>
      </div>
      {!p.retired_at && (
        <>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const rate = (name: string) => (f.get(name) === '' ? null : Number(f.get(name)));
              await act(
                path,
                {
                  revision: p.revision,
                  name: f.get('name'),
                  model: f.get('model'),
                  supportsTools: f.has('tools'),
                  inputUsdPerMillion: rate('input'),
                  outputUsdPerMillion: rate('output'),
                },
                'PATCH',
              ).catch(() => {});
            }}
          >
            <div className="form-grid">
              <label className="field">
                {t('الاسم', 'Name')}
                <input name="name" required maxLength={100} defaultValue={p.name} />
              </label>
              <label className="field">
                {t('معرّف النموذج', 'Model identifier')}
                <input
                  name="model"
                  dir="ltr"
                  required
                  pattern="[a-zA-Z0-9._-]{1,100}"
                  defaultValue={p.model}
                />
              </label>
              <label className="field">
                {t('سعر مليون رمز إدخال بالدولار', 'USD per million input tokens')}
                <input
                  name="input"
                  type="number"
                  min={0}
                  max={10000}
                  step="0.000001"
                  defaultValue={
                    p.input_microusd_per_million == null
                      ? ''
                      : Number(p.input_microusd_per_million) / 1000000
                  }
                />
              </label>
              <label className="field">
                {t('سعر مليون رمز إخراج بالدولار', 'USD per million output tokens')}
                <input
                  name="output"
                  type="number"
                  min={0}
                  max={10000}
                  step="0.000001"
                  defaultValue={
                    p.output_microusd_per_million == null
                      ? ''
                      : Number(p.output_microusd_per_million) / 1000000
                  }
                />
              </label>
            </div>
            <label>
              <input name="tools" type="checkbox" defaultChecked={p.supports_tools} />{' '}
              {t('النموذج يدعم استدعاء الأدوات', 'Model supports tool calls')}
            </label>
            <p className="muted">
              {t(
                'قدرات وأسعار يحددها المسؤول؛ تحقّق منها لدى المزود قبل التفعيل. التغيير يسري على الاستدعاءات التالية.',
                'Administrator-declared capabilities and rates; verify with the provider before activation. Changes apply to subsequent calls.',
              )}
            </p>
            <button className="btn" disabled={busy}>
              {t('حفظ إعدادات النموذج', 'Save model settings')}
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                act(path, { enabled: !p.enabled, revision: p.revision }, 'PATCH').catch(() => {})
              }
            >
              {p.enabled ? t('إيقاف', 'Disable') : t('تفعيل', 'Enable')}
            </button>
            <button className="btn" disabled={busy} onClick={() => setConfirm(!confirm)}>
              {t('تقاعد المزود', 'Retire provider')}
            </button>
          </div>
          {confirm && (
            <div role="alert" className="stack">
              <p>
                {t(
                  'سيتم إيقاف المزود ومحو مفتاحه نهائيًا مع الاحتفاظ بالمساعدين وسجل الاستدعاءات. أعد تعيين المساعدين لمزود آخر.',
                  'This permanently disables the provider and erases its key, preserving agents and call history. Reassign agents to another provider.',
                )}
              </p>
              <button
                className="btn"
                disabled={busy}
                onClick={() => act(path + '/retire', { revision: p.revision }).catch(() => {})}
              >
                {t('تأكيد التقاعد النهائي', 'Confirm permanent retirement')}
              </button>
            </div>
          )}
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              try {
                await act(path + '/rotate', { apiKey: f.get('key') });
                form.reset();
              } catch {
                /* Shared error banner. */
              }
            }}
          >
            <input
              type="password"
              name="key"
              required
              minLength={10}
              maxLength={4000}
              autoComplete="off"
              aria-label={t('مفتاح بديل', 'Replacement key')}
              placeholder={t('مفتاح بديل', 'Replacement key')}
            />
            <button className="btn" disabled={busy}>
              {t('تدوير المفتاح', 'Rotate key')}
            </button>
          </form>
        </>
      )}
    </article>
  );
}
