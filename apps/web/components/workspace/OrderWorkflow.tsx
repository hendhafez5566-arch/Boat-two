'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useData } from '../business/useData';
import { useLocale } from '../product/locale';
import styles from './order-workflow.module.css';

type Stage = {
  name: string;
  userId: string | null;
  departmentId: string | null;
  method: 'manual' | 'rotation' | 'least_busy';
  minutes: number;
  priority: 'low' | 'normal' | 'high';
  autoAdvance: boolean;
};
type Source = 'order' | 'conversation' | 'contact' | 'task';
type Condition = 'manual' | 'created' | 'unassigned';
type Definition = { id?: string; name: string; stages: Stage[]; source?: Source; start_condition?: Condition };
type WorkflowItem = { id: string; name: string; workflow: string | null; due_at: string | null; task_status: string | null };
const sources: Record<Source, [string, string]> = {
  order: ['الطلبات', 'Orders'],
  conversation: ['المحادثات', 'Conversations'],
  contact: ['العملاء', 'Customers'],
  task: ['مهام CRM', 'CRM tasks'],
};
const sourceLinks: Record<Source, string> = {
  order: '/dashboard/commerce?order=',
  conversation: '/dashboard/inbox?conversation=',
  contact: '/dashboard/crm?contact=',
  task: '/dashboard/crm/tasks?status=&id=',
};
const conditions: Record<Condition, [string, string]> = {
  manual: ['يدوي فقط', 'Manual only'],
  created: ['عند الإنشاء', 'When created'],
  unassigned: ['عند الإنشاء بدون مسؤول', 'When created without an assignee'],
};
type Work = {
  id: string; assigned_to: string | null; due_at: string; assignee_name: string | null;
  workflow: Definition & { stage: number; revision: number; finished: boolean;
    history: { action: string; stage: number; assignee: string | null; at: string }[] };
};
const blankStage = (): Stage => ({
  name: '', userId: null, departmentId: null, method: 'manual',
  minutes: 60, priority: 'normal', autoAdvance: false,
});
const definitionsPath = '/commerce/order-workflows';

function useWorkflowPeople() {
  const members = useData<{ members: { user_id: string; full_name: string }[] }>('/crm/workspace/members', { members: [] });
  const departments = useData<{ id: string; name: string; members: string[] }[]>('/departments', []);
  return { members, departments };
}

export function OrderWorkflowSettings() {
  const { t } = useLocale();
  const definitions = useData<Definition[]>(definitionsPath, []);
  const { members, departments } = useWorkflowPeople();
  const [draft, setDraft] = useState<Definition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function changeStage(index: number, patch: Partial<Stage>) {
    setDraft(current => current && ({
      ...current, stages: current.stages.map((item, i) => index === i ? { ...item, ...patch } : item),
    }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(draft.id ? definitionsPath + '/' + draft.id : definitionsPath, {
        method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: draft.name, stages: draft.stages, source: draft.source, start_condition: draft.start_condition }),
      });
      setDraft(null);
      await definitions.reload();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function archive(id: string) {
    if (busy || !window.confirm(t('أرشفة سير العمل؟ ستستمر الطلبات التي بدأت فيه.', 'Archive this workflow? Orders already using it will continue.'))) return;
    setBusy(true);
    setError('');
    try {
      await api(definitionsPath + '/' + id, { method: 'DELETE' });
      if (draft?.id === id) setDraft(null);
      await definitions.reload();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.toolbar}>
      <h3>{t('مسارات العمل', 'Workflows')}</h3>
      <button className="btn btn-primary" type="button" disabled={busy}
        onClick={() => setDraft({ name: '', stages: [blankStage()] })}>{t('سير عمل جديد', 'New workflow')}</button>
    </div>
    {(error || definitions.error || members.error || departments.error) &&
      <p role="alert">{error || definitions.error || members.error || departments.error}</p>}
    {definitions.loading && <p role="status">{t('جارٍ التحميل', 'Loading')}</p>}
    {!definitions.loading && !definitions.error && !definitions.data.length && !draft &&
      <p>{t('لا توجد مسارات عمل بعد.', 'No workflows yet.')}</p>}
    {definitions.data.map(item => <article className={styles.row} key={item.id}>
      <div><strong>{item.name}</strong><p>{t(...sources[item.source ?? 'order'])} · {t(...conditions[item.start_condition ?? 'manual'])}</p><p>{item.stages.map(stage => stage.name).join(' · ')}</p></div>
      <div className={styles.toolbar}>
        <button type="button" className="btn" disabled={busy} onClick={() => setDraft(item)}>{t('تعديل', 'Edit')}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void archive(item.id!)}>{t('أرشفة', 'Archive')}</button>
      </div>
    </article>)}
    {draft && <form className={styles.form} onSubmit={save}>
      <label>{t('اسم سير العمل', 'Workflow name')}
        <input required maxLength={64} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/>
      </label>
      <div className={styles.fields}>
        <label>{t('نوع العمل', 'Work type')}<select value={draft.source ?? 'order'}
          onChange={e => setDraft({ ...draft, source: e.target.value as Source })}>
          {Object.entries(sources).map(([value, name]) => <option key={value} value={value}>{t(...name)}</option>)}
        </select></label>
        <label>{t('بدء التشغيل', 'Start condition')}<select value={draft.start_condition ?? 'manual'}
          onChange={e => setDraft({ ...draft, start_condition: e.target.value as Condition })}>
          {Object.entries(conditions).map(([value, name]) => <option key={value} value={value}>{t(...name)}</option>)}
        </select></label>
      </div>
      {draft.stages.map((stage, index) => {
        const department = departments.data.find(item => item.id === stage.departmentId);
        const candidates = members.data.members.filter(member => !stage.departmentId || department?.members.includes(member.user_id));
        return <fieldset key={index} className={styles.fields}>
          <legend>{t('مرحلة', 'Stage')} {index + 1}</legend>
          <label>{t('اسم المرحلة', 'Stage name')}<input required maxLength={64} value={stage.name} onChange={e => changeStage(index, { name: e.target.value })}/></label>
          <label>{t('القسم', 'Department')}<select value={stage.departmentId ?? ''} required={stage.method !== 'manual'}
            onChange={e => changeStage(index, { departmentId: e.target.value || null, userId: null })}>
            <option value="">{t('بدون قسم', 'No department')}</option>
            {departments.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>{t('طريقة التوزيع', 'Routing method')}<select value={stage.method} onChange={e => changeStage(index, { method: e.target.value as Stage['method'], userId: null })}>
            <option value="manual">{t('يدوي', 'Manual')}</option>
            <option value="rotation">{t('بالتناوب', 'Rotation')}</option>
            <option value="least_busy">{t('الأقل انشغالًا', 'Least busy')}</option>
          </select></label>
          {stage.method === 'manual' && <label>{t('الموظف', 'Employee')}<select value={stage.userId ?? ''} onChange={e => changeStage(index, { userId: e.target.value || null })}>
            <option value="">{t('إسناد لاحقًا', 'Assign later')}</option>
            {candidates.map(item => <option key={item.user_id} value={item.user_id}>{item.full_name}</option>)}
          </select></label>}
          <label>{t('مدة الإنجاز بالدقائق', 'Time limit in minutes')}<input type="number" required min={1} max={43200} value={stage.minutes || ''} onChange={e => changeStage(index, { minutes: Number(e.target.value) })}/></label>
          <label>{t('الأولوية', 'Priority')}<select value={stage.priority} onChange={e => changeStage(index, { priority: e.target.value as Stage['priority'] })}>
            <option value="low">{t('منخفضة', 'Low')}</option>
            <option value="normal">{t('عادية', 'Normal')}</option>
            <option value="high">{t('عالية', 'High')}</option>
          </select></label>
          <label className={styles.check}><input type="checkbox" checked={stage.autoAdvance} onChange={e => changeStage(index, { autoAdvance: e.target.checked })}/>
            {t('الانتقال عند إكمال مهمة CRM', 'Advance when CRM task is completed')}</label>
          <div className={styles.toolbar}>
            <button className="btn" type="button" disabled={index === 0} onClick={() => {
              const stages = [...draft.stages];
              [stages[index - 1], stages[index]] = [stages[index], stages[index - 1]];
              setDraft({ ...draft, stages });
            }}>{t('نقل لأعلى', 'Move up')}</button>
            <button className="btn" type="button" disabled={draft.stages.length === 1}
              onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, i) => i !== index) })}>{t('إزالة', 'Remove')}</button>
          </div>
        </fieldset>;
      })}
      <div className={styles.toolbar}>
        <button type="button" className="btn" disabled={draft.stages.length >= 12}
          onClick={() => setDraft({ ...draft, stages: [...draft.stages, blankStage()] })}>{t('إضافة مرحلة', 'Add stage')}</button>
        <button className="btn btn-primary" disabled={busy} type="submit">{t('حفظ سير العمل', 'Save workflow')}</button>
        <button className="btn" disabled={busy} type="button" onClick={() => setDraft(null)}>{t('إلغاء', 'Cancel')}</button>
      </div>
    </form>}
  </section>;
}

export function OrderWorkflowProgress({ id, closed, source = 'order' }: { id: string; closed?: boolean; source?: Source }) {
  const { t } = useLocale();
  const path = '/commerce/workflow-items/' + source + '/' + id;
  const state = useData<{ work: Work | null }>(path, { work: null });
  const definitions = useData<Definition[]>(state.loadedPath && !state.data.work && !closed ? definitionsPath : null, []);
  const { members } = useWorkflowPeople();
  const [definition, setDefinition] = useState('');
  const [employee, setEmployee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const work = state.data.work;
  async function act(action: 'start' | 'advance' | 'reassign') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(path, {
        method: 'POST', body: JSON.stringify(action === 'start' ? { action, definitionId: definition } :
          { action, revision: work?.workflow.revision, userId: action === 'reassign' ? employee : undefined }),
      });
      setEmployee('');
      await state.reload();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    {(state.error || definitions.error || error) && <p role="alert">{state.error || definitions.error || error}</p>}
    {state.loading && <p role="status">{t('جارٍ التحميل', 'Loading')}</p>}
    {!work && state.loadedPath && (closed ? <p>{t('الطلب مغلق', 'Order closed')}</p> : <div className={styles.toolbar}>
      <label>{t('سير العمل', 'Workflow')}<select value={definition} onChange={e => setDefinition(e.target.value)}>
        <option value="">{t('اختر سير عمل', 'Select a workflow')}</option>
        {definitions.data.filter(item => (item.source ?? 'order') === source).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <button type="button" className="btn btn-primary" disabled={busy || !definition} onClick={() => void act('start')}>{t('بدء العمل', 'Start workflow')}</button>
    </div>)}
    {work && <>
      <div className={styles.row}><strong>{work.workflow.name}</strong>
        <span className={styles.state} data-overdue={!work.workflow.finished && +new Date(work.due_at) < Date.now()}>
          {work.workflow.finished ? t('مكتمل', 'Complete') : +new Date(work.due_at) < Date.now() ? t('متأخر', 'Overdue') : t('قيد التنفيذ', 'In progress')}
        </span>
      </div>
      <ol className={styles.stages}>{work.workflow.stages.map((stage, index) =>
        <li key={index} aria-current={!work.workflow.finished && index === work.workflow.stage ? 'step' : undefined} data-stage-state={work.workflow.finished || index < work.workflow.stage ? 'done' : index === work.workflow.stage ? 'current' : 'pending'}><span>{work.workflow.finished || index < work.workflow.stage ? '✓' : index+1}</span><strong>{stage.name}</strong><small>{work.workflow.finished || index < work.workflow.stage ? t('مكتمل','Done') : index===work.workflow.stage ? t('المرحلة الحالية','Current stage') : t('بانتظار التنفيذ','Pending')}</small></li>)}</ol>
      <div className={styles.toolbar}>
        <span>{work.assignee_name ?? t('بدون مسؤول', 'Unassigned')} · {new Date(work.due_at).toLocaleString()}</span>
        <Link href={'/dashboard/crm/tasks?status=&id=' + work.id}>{t('فتح مهمة CRM', 'Open CRM task')}</Link>
      </div>
      {!work.workflow.finished && <div className={styles.toolbar}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act('advance')}>
          {work.workflow.stage + 1 === work.workflow.stages.length ? t('إكمال سير العمل', 'Complete workflow') : t('المرحلة التالية', 'Next stage')}
        </button>
        <label>{t('الموظف الجديد', 'New assignee')}<select value={employee} onChange={e => setEmployee(e.target.value)}>
          <option value="">{t('اختر موظفًا', 'Select employee')}</option>
          {members.data.members.filter(member => member.user_id !== work.assigned_to).map(item =>
            <option key={item.user_id} value={item.user_id}>{item.full_name}</option>)}
        </select></label>
        <button type="button" className="btn" disabled={busy || !employee} onClick={() => void act('reassign')}>{t('إعادة الإسناد', 'Reassign')}</button>
      </div>}
      <details><summary>{t('سجل المراحل', 'Stage history')}</summary>
        <ol>{work.workflow.history.map((event, index) => <li key={index}>
          {work.workflow.stages[event.stage].name} · {event.action === 'reassign' ? t('إعادة إسناد', 'Reassigned') :
            work.workflow.finished && index === work.workflow.history.length - 1 ? t('اكتمل', 'Completed') : t('بدء المرحلة', 'Stage started')}
          {event.assignee && ' · ' + (members.data.members.find(member => member.user_id === event.assignee)?.full_name ?? t('موظف سابق', 'Former employee'))}
          {' · '}{new Date(event.at).toLocaleString()}
        </li>)}</ol>
      </details>
    </>}
  </section>;
}

export function WorkflowWorkspace() {
  const { t } = useLocale();
  const [source, setSource] = useState<Source>('conversation');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const path = '/commerce/workflow-items/' + source + '?q=' + encodeURIComponent(search.trim().slice(0, 100));
  const items = useData<WorkflowItem[]>(path, []);
  const visibleItems = items.data.filter(item => !onlyOverdue ||
    (!!item.due_at && +new Date(item.due_at) < Date.now() && item.task_status === 'open'));

  return <section className={styles.panel}>
    <div className={styles.toolbar}>
      <h3>{t('متابعة العمل', 'Track work')}</h3>
      <label>{t('نوع العمل', 'Work type')}<select value={source} onChange={e => {
        setSource(e.target.value as Source);
        setActive(null);
      }}>
        {Object.entries(sources).map(([value, name]) => <option key={value} value={value}>{t(...name)}</option>)}
      </select></label>
      <label>{t('بحث', 'Search')}<input type="search" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <label className={styles.filter}><input type="checkbox" checked={onlyOverdue}
        onChange={e => setOnlyOverdue(e.target.checked)}/>{t('المتأخر فقط', 'Overdue only')}</label>
    </div>
    {items.error && <p role="alert">{items.error}</p>}
    {items.loading && <p role="status">{t('جارٍ التحميل', 'Loading')}</p>}
    {items.loadedPath === path && !items.loading && !visibleItems.length &&
      <p>{t('لا توجد نتائج.', 'No matching work.')}</p>}
    {items.loadedPath === path && visibleItems.map(item =>
      <article className={styles.item} key={item.id}>
        <div className={styles.row}>
          <div>
            <Link href={sourceLinks[source] + item.id}>{item.name || t('بدون اسم', 'Unnamed')}</Link>
            {item.workflow && <p>{item.workflow}</p>}
          </div>
          <button type="button" className="btn" aria-expanded={active === item.id}
            onClick={() => setActive(active === item.id ? null : item.id)}>
            {active === item.id ? t('إخفاء', 'Hide') : t('سير العمل', 'Workflow')}
          </button>
        </div>
        {active === item.id && <OrderWorkflowProgress id={item.id} source={source}/>}
      </article>)}
  </section>;
}
