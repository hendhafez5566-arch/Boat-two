'use client';
import { FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { useData } from './useData';
import { useLocale } from '../product/locale';
import { Button } from '../product/ProductUI';
import styles from './crm-workspace.module.css';
export function CrmAutomation() {
  const { t } = useLocale();
  const pipelines = useData<{ id: string; name: string; stages: string[] }[]>('/crm/pipelines', []);
  const [pipeline, setPipeline] = useState('');
  const [type, setType] = useState('task');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const p = pipelines.data.find((x) => x.id === pipeline) || pipelines.data[0];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const f = new FormData(e.currentTarget);
    try {
      const action =
        type === 'task'
          ? { type, title: f.get('title'), delayMinutes: Number(f.get('minutes')) }
          : {
              type,
              title: f.get('title'),
              pipelineId: p?.id,
              stage: f.get('stage'),
              valueCents: 0,
              currency: 'EGP',
            };
      await api('/automations', {
        method: 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          trigger: f.get('trigger'),
          enabled: f.get('enabled') === 'on',
          conditions: f.get('tag') ? { tag: f.get('tag') } : {},
          actions: [action],
        }),
      });
      setNotice(
        t(
          'تم حفظ القاعدة في نظام الأتمتة الحالي.',
          'Rule saved in the existing automation system.',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={styles.card}>
      <summary>{t('أتمتة فرص البيع والمتابعات', 'Automate opportunities & follow-ups')}</summary>
      <p>
        {t(
          'قواعد داخلية فقط؛ لا ترسل رسائل. راجع القاعدة في قسم الأتمتة قبل تفعيلها.',
          'Internal actions only; no messages are sent. Review rules in Automations before enabling.',
        )}
      </p>
      <form className={styles.form} onSubmit={submit}>
        <label>
          {t('اسم القاعدة', 'Rule name')}
          <input name="name" required maxLength={120} />
        </label>
        <label>
          {t('عندما', 'When')}
          <select name="trigger">
            <option value="crm.contacts.insert">{t('يضاف عميل', 'Contact is added')}</option>
            <option value="crm.contacts.update">
              {t('يُحدّث ملف العميل بواسطة البوت أو الفريق', 'Contact is updated by bot or team')}
            </option>
            <option value="crm.crm_deals.update">
              {t('تُحدّث فرصة بيع', 'Opportunity is updated')}
            </option>
          </select>
        </label>
        <label>
          {t('بوجود الوسم (اختياري)', 'With tag (optional)')}
          <input name="tag" maxLength={50} />
        </label>
        <label>
          {t('الإجراء', 'Action')}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="task">{t('إنشاء متابعة', 'Create follow-up')}</option>
            <option value="deal">{t('إنشاء فرصة بيع', 'Create opportunity')}</option>
          </select>
        </label>
        <label>
          {t('العنوان', 'Title')}
          <input name="title" required maxLength={200} />
        </label>
        {type === 'task' ? (
          <label>
            {t('بعد (دقائق)', 'After (minutes)')}
            <input name="minutes" type="number" min={0} max={525600} defaultValue={60} required />
          </label>
        ) : (
          <>
            <label>
              {t('خط المبيعات', 'Pipeline')}
              <select value={p?.id || ''} onChange={(e) => setPipeline(e.target.value)}>
                {pipelines.data.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('المرحلة', 'Stage')}
              <select name="stage" key={p?.id} required>
                {p?.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          <span>
            <input type="checkbox" name="enabled" />
            {t('تفعيل القاعدة صراحةً', 'Explicitly enable rule')}
          </span>
        </label>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <Button busy={busy} type="submit" disabled={type === 'deal' && !p}>
          {t('حفظ القاعدة', 'Save rule')}
        </Button>
      </form>
    </details>
  );
}
