'use client';
import styles from '../../../components/workspace/settings-hub.module.css';
import { WorkspaceHeading, Dialog } from '../../../components/product/ProductUI';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useData } from '../../../components/business/useData';
import { useTransientNotice } from '../../../components/product/useTransientNotice';
import { NavIcon } from '../../../components/product/NavIcon';
import { api } from '../../../lib/api';
import { statusLabel } from '../../../components/product/status';
import { InvitationMailPanel } from '../../../components/product/InvitationMailPanel';
import { useLocale } from '../../../components/product/locale';
type Member = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  available: boolean;
};
type Invite = { id: string; email: string; role: string; expires_at: string };
export default function Team() {
  const { t, language } = useLocale();
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [url,setUrl]=useState(''),[mailQueued,setMailQueued]=useState(false),[mailRefresh,setMailRefresh]=useState(0);
  const [busy,setBusy]=useState(false),lock=useRef(false);
  const [tab,setTab]=useState<'members'|'invites'>('members');
  const [inviteOpen,setInviteOpen]=useState(false),[dirty,setDirty]=useState(false);
  const [search,setSearch]=useState(''),[roleFilter,setRoleFilter]=useState('all'),[availability,setAvailability]=useState('all');
  const [page,setPage]=useState(1),[size,setSize]=useState(25);
  const path='/team/index?'+new URLSearchParams({tab,q:search,role:roleFilter,availability,page:String(page),limit:String(size)});
  const records=useData<{items:(Member|Invite)[];total:number;role:string;metrics:{members:number;available:number;pending:number|null}}>(path,{items:[],total:0,role:'',metrics:{members:0,available:0,pending:null}});
  const ready=records.loadedPath===path&&!records.loading&&!records.error;
  const role=records.error?'':records.data.role,loading=!ready&&!records.error,metrics=records.data.metrics;
  const visibleMembers=ready&&tab==='members'?records.data.items as Member[]:[];
  const invites=ready&&tab==='invites'?records.data.items as Invite[]:[];
  const pages=Math.max(1,Math.ceil(records.data.total/size));
  useEffect(()=>{if(ready&&page>pages)setPage(pages);},[ready,page,pages]);
  useTransientNotice(notice,()=>setNotice(''));
  const closeInvite=()=>{if(lock.current)return;if(dirty&&!window.confirm(t('تجاهل بيانات الدعوة غير المحفوظة؟','Discard unsaved invitation details?')))return;setInviteOpen(false);setDirty(false);setUrl('');setError('');};
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirty||lock.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
  function selectTab(value:'members'|'invites'){setTab(value);setPage(1);setSearch('');setRoleFilter('all');setAvailability('all');}
  async function action(path: string, method: string, body?: unknown) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      setNotice(t('تم تحديث الفريق.','Team updated.'));
      await records.reload();
    } catch (e) {setError((e as Error).message);}
    finally {lock.current=false;setBusy(false);}
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if(lock.current||url)return;
    lock.current=true;
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError('');setNotice('');
    setUrl('');
    try {
      const r = await api<{ inviteUrl: string; mailJob: { id: string } | null }>(
        '/team/invitations',
        {
          method: 'POST',
          body: JSON.stringify({
            email: f.get('email'),
            role: f.get('role'),
            sendEmail: f.get('sendEmail') === 'on',
            language,
          }),
        },
      );
      setUrl(r.inviteUrl);
      setMailQueued(!!r.mailJob);
      form.reset();setDirty(false);setMailRefresh(n=>n+1);
      await records.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current=false;setBusy(false);
    }
  }
  const filters=<div className="workbench-toolbar" aria-busy={loading}>
    <input type="search" disabled={busy} maxLength={200} aria-label={tab==='members'?t('بحث في الفريق','Search team'):t('بحث الدعوات','Search invitations')} placeholder={t('ابحث بالاسم أو البريد','Search name or email')} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
    <select disabled={busy} aria-label={t('تصفية الدور','Filter role')} value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPage(1);}}><option value="all">{t('كل الأدوار','All roles')}</option>{tab==='members'&&<option value="owner">{t('مالك','Owner')}</option>}<option value="admin">{t('مدير','Admin')}</option><option value="agent">{t('موظف','Agent')}</option></select>
    {tab==='members'&&<select disabled={busy} aria-label={t('تصفية التوفر','Filter availability')} value={availability} onChange={e=>{setAvailability(e.target.value);setPage(1);}}><option value="all">{t('كل الحالات','All states')}</option><option value="available">{t('متاح','Available')}</option><option value="away">{t('غير متاح','Away')}</option></select>}
    <button className="btn" type="button" disabled={busy} onClick={()=>{setSearch('');setRoleFilter('all');setAvailability('all');setPage(1);}}>{t('مسح الفلاتر','Clear filters')}</button><button className="btn" type="button" disabled={busy||records.loading} onClick={()=>void records.reload()}><NavIcon name="refresh"/>{t('تحديث','Refresh')}</button>
  </div>;
  const pagination=<div className="form-actions"><label>{t('عدد الصفوف','Rows per page')} <select disabled={busy} value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><span aria-live="polite">{ready?records.data.total:'…'} {t('نتيجة','results')}</span><button className="btn" disabled={busy||!ready||page<=1} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><span>{page} / {ready?pages:'…'}</span><button className="btn" disabled={busy||!ready||page>=pages} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></div>;
  return (
    <main className={`stack ${styles.workbench}`} data-workbench="team">
      <WorkspaceHeading
        title={t('الفريق والصلاحيات', 'Team & permissions')}
        description={t('راجع أعضاء الفريق وأدوارهم ودعواتهم.', 'Manage team members, roles and invitations.')}
        actions={<>
            {['owner','admin'].includes(role)&&<button className="btn btn-primary" type="button" disabled={busy} onClick={()=>{setUrl('');setDirty(false);setError('');setInviteOpen(true);}}><NavIcon name="plus"/>{t('دعوة موظف','Invite teammate')}</button>}
          </>}
      />
      {records.error&&<p role="alert" className="notice error">{records.error} <button className="btn" onClick={()=>void records.reload()}>{t('إعادة المحاولة','Retry')}</button></p>}
      {notice&&<p role="status" className="notice">{notice}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="workbench-metrics">{[[t('أعضاء الفريق','Team members'),metrics.members],[t('متاحون الآن','Available now'),metrics.available],...(metrics.pending===null?[]:[[t('دعوات معلقة','Pending invitations'),metrics.pending]])].map(([label,n],index)=><div key={String(label)}><span className={styles.metricIcon}><NavIcon name={['team','circleCheck','mail'][index]}/></span><small>{label}</small><strong>{records.error?'—':records.loadedPath?n:'…'}</strong></div>)}</div>
      <nav className="workbench-tabs" aria-label={t('إدارة الفريق','Team management')}><button type="button" disabled={busy} aria-pressed={tab==='members'} onClick={()=>selectTab('members')}><NavIcon name="team"/>{t('أعضاء الفريق','Members')}</button>{role&&role!=='agent'&&<button type="button" aria-pressed={tab==='invites'} onClick={()=>selectTab('invites')}><NavIcon name="mail"/>{t('الدعوات','Invitations')}</button>}</nav>
      {tab==='members'&&<section className="card table-wrap">
        <h2>{t('أعضاء الفريق','Team members')}</h2>{filters}
        <table className="product-table">
          <thead>
            <tr>
              <th>{t('الموظف', 'Member')}</th>
              <th>{t('الدور', 'Role')}</th>
              <th>{t('التوفر', 'Availability')}</th>
              <th>{t('إدارة', 'Manage')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <div className={styles.memberIdentity}><span className={styles.memberAvatar} aria-hidden="true">{(m.full_name||m.email).trim().slice(0,2).toUpperCase()}</span><div><strong>{m.full_name}</strong><div className="muted">{m.email}</div></div></div>
                </td>
                <td>
                  {role === 'owner' && m.role !== 'owner' ? (
                    <select
                      aria-label={t('تغيير الدور', 'Change role')}
                      disabled={busy}
                      value={m.role}
                      onChange={(e) => {const next=e.target.value;if(next!==m.role&&window.confirm(t('تأكيد تغيير صلاحية هذا العضو؟','Confirm this member’s permission change?')))void action('/team/members/' + m.user_id, 'PATCH', { role: next });}}
                    >
                      <option value="admin">{t('مدير', 'Admin')}</option>
                      <option value="agent">{t('موظف', 'Agent')}</option>
                    </select>
                  ) : (
                    statusLabel(m.role, t)
                  )}
                </td>
                <td><span className="workbench-state" data-active={m.available}>{m.available ? t('متاح', 'Available') : t('غير متاح', 'Away')}</span></td>
                <td>
                  {m.role !== 'owner' &&
                    (role === 'owner' || (role === 'admin' && m.role === 'agent')) && (
                      <button
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          confirm(t('إزالة العضو من الشركة؟', 'Remove this member?')) &&
                          action('/team/members/' + m.user_id, 'DELETE')
                        }
                      >
                        <NavIcon name="trash"/>{t('إزالة', 'Remove')}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="empty">{t('جارٍ التحميل…', 'Loading…')}</p>}
        {ready&&!visibleMembers.length&&<p className="empty">{t('لا توجد نتائج مطابقة','No matching members')}</p>}{pagination}
      </section>}
      {['owner','admin'].includes(role) && (
        <Dialog open={inviteOpen} onClose={closeInvite} title={t('دعوة موظف','Invite a teammate')}>
          {inviteOpen&&<form id="team-invitations" onSubmit={invite} onChange={()=>setDirty(true)} hidden={!!url}>
            <div className="form-grid">
              <label className="field">
                {t('البريد الإلكتروني', 'Email')}
                <input name="email" type="email" required />
              </label>
              <label className="field">
                {t('الدور', 'Role')}
                <select name="role">
                  <option value="agent">{t('موظف', 'Agent')}</option>
                  {role === 'owner' && <option value="admin">{t('مدير', 'Admin')}</option>}
                </select>
              </label>
            </div>
            <label>
              <input type="checkbox" name="sendEmail" />{' '}
              {t('طلب إرسال الدعوة بالبريد الإلكتروني أيضًا', 'Request an invitation email too')}
            </label>
            <div className="form-actions">
              <button disabled={busy||!!url} className="btn btn-primary">
                {t('إنشاء رابط دعوة', 'Create invitation link')}
              </button>
            </div>
          </form>}
          {url && (
            <div className="notice">
              <p>
                {t(
                  mailQueued
                    ? 'أضيف البريد للطابور. لا يعني ذلك تسليمه؛ راجع حالته أدناه.'
                    : 'شارك الرابط بشكل آمن. لم يُطلب إرسال بريد.',
                  mailQueued
                    ? 'Email queued. This does not confirm delivery; check its status below.'
                    : 'Share this link securely. No email was requested.',
                )}
              </p>
              <input
                aria-label={t('رابط الدعوة','Invitation link')}
                className="w-full p-2 mt-2"
                readOnly
                dir="ltr"
                value={url}
                onFocus={(e) => e.target.select()}
              />
              <div className="form-actions"><button className="btn btn-primary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(url);setNotice(t('تم نسخ الرابط.','Link copied.'));}catch{setError(t('تعذّر النسخ؛ حدد الرابط وانسخه يدويًا.','Copy failed; select the link and copy manually.'));}}}>{t('نسخ الرابط','Copy link')}</button><button className="btn" type="button" onClick={()=>{setUrl('');setError('');}}>{t('دعوة أخرى','Another invitation')}</button></div>{notice&&<p role="status">{notice}</p>}
            </div>
          )}
          {error&&<p className="notice error" role="alert">{error}</p>}
        </Dialog>
      )}
      {tab==='invites'&&role&&role!=='agent'&&<>
      <section className="card">
        <h2>{t('الدعوات المعلّقة', 'Pending invitations')}</h2>
        {filters}
        {loading?<p role="status">{t('جارٍ التحميل…','Loading…')}</p>:records.error?null:!invites.length ? (
          <p className="muted">{t('لا توجد دعوات معلقة.', 'No pending invitations.')}</p>
        ) : (
          invites.map((i) => (
            <div className="step" key={i.id}>
              <div>
                <strong>{i.email}</strong>
                <small>
                  {statusLabel(i.role, t)} · {new Date(i.expires_at).toLocaleDateString(language)}
                </small>
              </div>
              <button
                disabled={busy}
                className="btn btn-danger"
                onClick={() => {if(confirm(t('إلغاء هذه الدعوة؟','Revoke this invitation?')))void action('/team/invitations/' + i.id, 'DELETE');}}
              >
                <NavIcon name="trash"/>{t('إلغاء الدعوة', 'Revoke')}
              </button>
            </div>
          ))
        )}
        {pagination}
      </section>
      <InvitationMailPanel refreshKey={String(mailRefresh)}/>
      </>}
    </main>
  );
}
