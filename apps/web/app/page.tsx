import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
export default async function Home() {
  const host = headers().get('x-boat-custom-host');
  if (host && process.env.CUSTOM_DOMAINS_ENABLED === 'true') {
    const response = await fetch(
      (process.env.INTERNAL_API_URL ?? 'http://localhost:4000') +
        '/domains/resolve?' +
        new URLSearchParams({ hostname: host }),
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) notFound();
    const brand = (await response.json()) as {
      name: string;
      logoUrl: string | null;
      primaryColor: string;
      widgetTitle: string;
    };
    return (
      <main className="hero" style={{ borderTop: '6px solid ' + brand.primaryColor }}>
        {brand.logoUrl && (
          <img
            src={brand.logoUrl}
            alt={brand.name}
            width={96}
            height={96}
            style={{ objectFit: 'contain', margin: '0 auto' }}
          />
        )}
        <h1>{brand.name}</h1>
        <p>{brand.widgetTitle}</p>
        <div className="form-actions">
          <Link className="btn btn-primary" href="/login">
            تسجيل الدخول / Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="hero" dir="rtl">
      <span className="badge">ELHAFEZ BOAT</span>
      <h1>
        محادثات أقرب.
        <br />
        وأعمال تتحرك بذكاء.
      </h1>
      <p>اجمع قنوات شركتك، صمّم بوتًا دون كتابة كود، وامنح فريقك مساحة مشتركة لخدمة العملاء.</p>
      <div className="form-actions">
        <Link className="btn btn-primary" href="/register">
          أنشئ مساحة عملك ←
        </Link>
        <Link className="btn" href="/login">
          تسجيل الدخول
        </Link>
      </div>
      <div className="card-grid hero-grid">
        {[
          [
            '01',
            'كل محادثة في مكانها',
            'صندوق وارد موحد، توزيع المحادثات، وملاحظات داخلية لفريقك.',
          ],
          ['02', 'ابنِ تجربة على مقاسك', 'مصمم مرئي للرسائل والأسئلة والشروط والتحويل إلى موظف.'],
          ['03', 'معرفة تساعد فريقك', 'اربط مصادر المعرفة بالمساعد الذكي عند تفعيل مزود الخدمة.'],
        ].map(([n, h, p]) => (
          <section className="card" key={n}>
            <p className="eyebrow">{n}</p>
            <h2>{h}</h2>
            <p>{p}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
