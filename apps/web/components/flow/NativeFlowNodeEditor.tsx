'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { NativeFlowRow } from '../../lib/whatsapp-flow-builder';
import { useLocale } from '../product/locale';
type NodeData = { text?: string; flowId?: string; cta?: string; screen?: string; saveAs?: string };
export default function NativeFlowNodeEditor({
  data,
  set,
  channelIds,
}: {
  data: NodeData;
  set: (patch: Partial<NodeData>) => void;
  channelIds: string[];
}) {
  const { t } = useLocale();
  const [options, setOptions] = useState<
    (NativeFlowRow & { accountName: string; channelId: string })[]
  >([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const accountsKey = [...channelIds].sort().join(',');
  useEffect(() => {
    let active = true;
    setOptions([]);
    setError('');
    if (!accountsKey) return;
    setLoading(true);
    void (async () => {
      try {
        const accounts = await api<{ id: string; name: string; type: string }[]>('/channels');
        const selected = accounts.filter(
          (account) => account.type === 'whatsapp' && accountsKey.split(',').includes(account.id),
        );
        const results = await Promise.allSettled(
          selected.map(async (account) =>
            (await api<NativeFlowRow[]>(`/channels/${account.id}/whatsapp-flows`))
              .filter(
                (flow) =>
                  flow.provider_status === 'PUBLISHED' && flow.provider_id && !flow.operation,
              )
              .map((flow) => ({ ...flow, accountName: account.name, channelId: account.id })),
          ),
        );
        if (!active) return;
        setOptions(
          results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
        );
        if (results.some((result) => result.status === 'rejected'))
          setError(t('تعذر تحميل نماذج بعض الحسابات.', 'Some account Flows could not be loaded.'));
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accountsKey, t]);
  const selected = options.find((flow) => flow.provider_id === data.flowId);
  const screens = Array.isArray(selected?.definition?.screens)
    ? (selected.definition.screens as { id: string; title?: string }[])
    : [];
  return (
    <div className="stack">
      <label>
        {t('نموذج منشور في الحساب', 'Published Account Flow')}
        <select
          value={selected?.id ?? ''}
          disabled={loading || !accountsKey}
          onChange={(e) => {
            const flow = options.find((option) => option.id === e.target.value);
            if (!flow) return;
            const screens = flow.definition?.screens;
            const first = Array.isArray(screens)
              ? (screens[0] as { id?: string } | undefined)
              : undefined;
            set({ flowId: flow.provider_id!, screen: first?.id ?? '' });
          }}
        >
          <option value="">
            {loading
              ? t('جارٍ التحميل…', 'Loading…')
              : t('اختر نموذجًا منشورًا', 'Choose a Published Flow')}
          </option>
          {options.map((flow) => (
            <option key={flow.id} value={flow.id}>
              {flow.name} · {flow.accountName}
            </option>
          ))}
        </select>
      </label>
      {!accountsKey && (
        <p>
          {t(
            'اربط تدفق المحادثة بحساب WhatsApp لاختيار نماذجه.',
            'Bind this conversation flow to a WhatsApp account to select its Flows.',
          )}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {channelIds.length === 1 && (
        <Link
          href={`/dashboard/flows?channelId=${encodeURIComponent(channelIds[0])}&section=whatsapp_flows`}
        >
          {t('إدارة نماذج الحساب', 'Manage Account Flows')}
        </Link>
      )}
      <label>
        {t('نص الرسالة', 'Message Text')}
        <textarea
          rows={3}
          value={data.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
        />
      </label>
      <label>
        {t('معرّف نموذج Meta', 'Meta Flow ID')}
        <input
          dir="ltr"
          value={data.flowId ?? ''}
          onChange={(e) => set({ flowId: e.target.value })}
        />
      </label>
      <label>
        {t('عنوان زر فتح النموذج', 'Open Form Button Label')}
        <input
          maxLength={20}
          value={data.cta ?? ''}
          onChange={(e) => set({ cta: e.target.value })}
        />
      </label>
      <label>
        {t('الشاشة الأولى', 'Initial Screen')}
        {screens.length ? (
          <select value={data.screen ?? ''} onChange={(e) => set({ screen: e.target.value })}>
            <option value="">{t('اختر الشاشة', 'Choose a Screen')}</option>
            {screens.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.title ?? screen.id} ({screen.id})
              </option>
            ))}
          </select>
        ) : (
          <input
            dir="ltr"
            value={data.screen ?? ''}
            onChange={(e) => set({ screen: e.target.value })}
          />
        )}
      </label>
      <label>
        {t('حفظ إجابات النموذج في المتغير', 'Save Form Answers to Variable')}
        <input
          dir="ltr"
          value={data.saveAs ?? ''}
          onChange={(e) => set({ saveAs: e.target.value })}
        />
      </label>
      <p className="muted">
        {t(
          'صِل مسار إكمال هذه العقدة برسالة الرد أو الخطوة التالية. النماذج المستوردة تحتاج اسم الشاشة من تعريفها لدى Meta.',
          'Connect this node’s completion path to the reply or next step. Imported Flows require the screen ID from their Meta definition.',
        )}
      </p>
    </div>
  );
}
