import Link from 'next/link';
export default function Home() {
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
