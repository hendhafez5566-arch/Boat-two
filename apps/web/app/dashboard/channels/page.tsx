'use client';
import { useEffect, useState } from 'react';
import ChannelSettings from '../../../components/product/ChannelSettings';
import { api, getSession } from '../../../lib/api';

type Channel = {
  id: string;
  type: string;
  name: string;
  external_id: string;
  status: string;
  widgetSnippet?: string;
  settings?: Record<string, unknown>;
};

const FIELDS: Record<string, { key: string; label: string }[]> = {
  web: [],
  whatsapp: [
    { key: 'phoneNumberId', label: 'Phone Number ID' },
    { key: 'accessToken', label: 'Access Token' },
  ],
  facebook: [
    { key: 'pageId', label: 'Page ID' },
    { key: 'pageAccessToken', label: 'Page Access Token' },
  ],
  instagram: [
    { key: 'igAccountId', label: 'Instagram Account ID' },
    { key: 'pageAccessToken', label: 'Page Access Token' },
  ],
};

export default function Channels() {
  const [items, setItems] = useState<Channel[]>([]);
  const [type, setType] = useState('web');
  const [error, setError] = useState('');

  const load = () =>
    api<Channel[]>('/channels')
      .then(setItems)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (!getSession()) {
      window.location.href = '/login';
      return;
    }
    load();
  }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm('حذف القناة؟ ستُحذف محادثاتها أيضاً.')) return;
    await api(`/channels/${id}`, { method: 'DELETE' }).catch((e) => setError(e.message));
    load();
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">القنوات</h1>
      {error && <p className="mb-3 text-red-600">{error}</p>}

      <ul className="mb-8 flex flex-col gap-3">
        {items.map((c) => (
          <li key={c.id} className="card">
            <div className="flex justify-between">
              <strong>
                {c.name} <span className="text-sm text-gray-500">({c.type})</span>
              </strong>
              <button onClick={() => remove(c.id)} className="text-sm text-red-600">
                حذف
              </button>
            </div>
            <ChannelSettings channel={c} onSaved={load} />
            {c.widgetSnippet && (
              <>
                <p className="mt-2 text-sm">الصق الكود في موقعك قبل &lt;/body&gt;:</p>
                <pre dir="ltr" className="overflow-x-auto rounded bg-gray-100 p-2 text-xs">
                  {c.widgetSnippet}
                </pre>
                <p className="mt-1 text-xs">
                  للتجربة: <code>/widget-demo.html?key={c.external_id}</code>
                </p>
              </>
            )}
          </li>
        ))}
        {!items.length && <li className="text-gray-500">لا توجد قنوات بعد.</li>}
      </ul>

      <h2 className="mb-2 font-semibold">إضافة قناة</h2>
      <form onSubmit={create} className="flex flex-col gap-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border p-2"
        >
          <option value="web">ويدجت الموقع</option>
          <option value="whatsapp">واتساب</option>
          <option value="facebook">فيسبوك ماسنجر</option>
          <option value="instagram">إنستجرام</option>
        </select>
        <input name="name" placeholder="اسم القناة" required className="rounded border p-2" />
        {FIELDS[type].map((x) => (
          <input
            type={x.key.toLowerCase().includes('token') ? 'password' : 'text'}
            autoComplete="off"
            key={x.key + type}
            name={x.key}
            placeholder={x.label}
            required
            dir="ltr"
            className="rounded border p-2"
          />
        ))}
        <button className="rounded bg-black p-2 text-white">إضافة</button>
      </form>
    </main>
  );
}
