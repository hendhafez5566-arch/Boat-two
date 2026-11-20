'use client';

import { CrmNav } from '../../../../components/business/CrmNav';
import { FormEvent, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import { useData } from '../../../../components/business/useData';
import { useLocale } from '../../../../components/product/locale';
import { Button, EmptyState, Feedback } from '../../../../components/product/ProductUI';
import styles from './lists.module.css';

type Member = { id: string; name: string; email: string | null; phone: string | null };
type ContactList = { id: string; name: string; members: number };

export default function ContactLists() {
  const { t } = useLocale();
  const lists = useData<ContactList[]>('/contact-lists', []);
  const [selected, setSelected] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [contactId, setContactId] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchRequest = useRef(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedList = lists.data.find((list) => list.id === selected);

  async function load(id: string) {
    const result = await api<Member[]>(`/contact-lists/${id}/members`);
    setMembers(result);
    setSelected(id);
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const row = await api<{ id: string }>('/contact-lists', {
        method: 'POST',
        body: JSON.stringify({ name: new FormData(form).get('name') }),
      });
      form.reset();
      lists.reload();
      await load(row.id);
      setSearchText('');
      setCandidates([]);
      setContactId('');
      setMessage(
        t(
          'تم إنشاء القائمة. يمكنك الآن إضافة العملاء إليها.',
          'List created. You can now add customers.',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function search(q: string) {
    const request = ++searchRequest.current;
    setContactId('');
    if (!q.trim()) {
      setCandidates([]);
      return;
    }
    try {
      const result = await api<{ items: Member[] }>(
        `/crm/contacts?q=${encodeURIComponent(q)}&limit=20`,
      );
      if (request === searchRequest.current) setCandidates(result.items ?? []);
    } catch (e) {
      if (request === searchRequest.current) setError((e as Error).message);
    }
  }

  async function change(id: string, remove = false) {
    if (
      remove &&
      !window.confirm(t('إزالة العميل من هذه القائمة؟', 'Remove this customer from this list?'))
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/contact-lists/${selected}/members${remove ? '/' + id : ''}`, {
        method: remove ? 'DELETE' : 'POST',
        ...(!remove ? { body: JSON.stringify({ contactId: id }) } : {}),
      });
      await load(selected);
      lists.reload();
      setContactId('');
      setMessage(
        remove
          ? t('تمت إزالة العميل من القائمة.', 'Customer removed from the list.')
          : t('تمت إضافة العميل إلى القائمة.', 'Customer added to the list.'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`stack ${styles.page}`}>
      <CrmNav />
      <header className="page-heading">
        <div>
          <h1>{t('قوائم العملاء', 'Customer lists')}</h1>
        </div>
      </header>

      {(error || lists.error) && <Feedback error>{error || lists.error}</Feedback>}
      {message && <Feedback>{message}</Feedback>}

      <div className={styles.workspace}>
        <section className={`card ${styles.createCard}`} aria-labelledby="new-list-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="new-list-heading">{t('أنشئ قائمة', 'Create an audience list')}</h2>
            </div>
          </div>
          <form onSubmit={create} className={styles.createForm}>
            <label className="field">
              {t('اسم القائمة الجديدة', 'New list name')}
              <input
                name="name"
                maxLength={120}
                required
                placeholder={t('مثال: عملاء محتملون', 'e.g. Potential customers')}
              />
            </label>
            <Button variant="primary" type="submit" busy={busy}>
              {t('إنشاء القائمة', 'Create list')}
            </Button>
          </form>
        </section>

        <section className={`card ${styles.manageCard}`} aria-labelledby="manage-list-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="manage-list-heading">{t('أدر أعضاء القائمة', 'Manage audience members')}</h2>
            </div>
          </div>

          {lists.data.length === 0 && !selected ? (
            <EmptyState icon="crm" title={t('لا توجد قوائم بعد', 'No audience lists yet')} />
          ) : (
            <>
              <label className="field">
                {t('القائمة الحالية', 'Current audience list')}
                <select
                  disabled={busy}
                  value={selected}
                  onChange={(e) => {
                    const id = e.target.value;
                    setMessage('');
                    setSearchText('');
                    setCandidates([]);
                    setContactId('');
                    ++searchRequest.current;
                    if (!id) {
                      setSelected('');
                      setMembers([]);
                      return;
                    }
                    setBusy(true);
                    setError('');
                    void load(id)
                      .catch((error) => setError(error.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  <option value="">{t('اختر قائمة لعرضها', 'Choose a list')}</option>
                  {lists.data.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.members})
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <>
                  <div className={styles.selectedHeading}>
                    <h3>{selectedList?.name ?? t('القائمة الحالية', 'Current list')}</h3>
                    <span>
                      {t('عدد الأعضاء', 'Members')}: {members.length}
                    </span>
                  </div>
                  <div className={styles.searchGroup}>
                    <h3>{t('إضافة عميل', 'Add a customer')}</h3>
                    <label className="field">
                      {t('ابحث بالاسم أو بيانات التواصل', 'Search by name or contact details')}
                      <input
                        type="search"
                        value={searchText}
                        placeholder={t('ابدأ كتابة اسم العميل', 'Start typing a customer name')}
                        onChange={(e) => {
                          setSearchText(e.target.value);
                          void search(e.target.value);
                        }}
                      />
                    </label>
                    <label className="field">
                      {t('اختر العميل من النتائج', 'Choose a customer from results')}
                      <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                        <option value="">{t('اختر العميل', 'Choose customer')}</option>
                        {candidates.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name || contact.email || contact.phone || contact.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="primary"
                      type="button"
                      disabled={busy || !contactId}
                      onClick={() => void change(contactId)}
                    >
                      {t('إضافة إلى القائمة', 'Add to list')}
                    </Button>
                  </div>
                  <div className={styles.memberHeading}>
                    <h3>{t('الأعضاء الحاليون', 'Current members')}</h3>
                    <span>{t('يُعرض أحدث 500 عضو', 'Up to 500 recent members shown')}</span>
                  </div>
                  {members.length === 0 ? (
                    <EmptyState icon="user" title={t('القائمة فارغة', 'This list is empty')} />
                  ) : (
                    <ul className={styles.memberList}>
                      {members.map((member) => (
                        <li key={member.id} className={styles.memberRow}>
                          <div>
                            <strong>
                              {member.name || member.email || member.phone || member.id}
                            </strong>
                            {member.name && (member.email || member.phone) && (
                              <small dir="auto">{member.email || member.phone}</small>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={busy}
                            onClick={() => void change(member.id, true)}
                          >
                            {t('إزالة', 'Remove')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
