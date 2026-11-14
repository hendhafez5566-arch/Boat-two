// Imported only by the isolated full-app QA runner; never production code.
export function installTelegramProviderFixture() {
  process.env.EXTERNAL_DELIVERY_ENABLED = 'true';
  process.env.PUBLIC_API_URL = 'https://api.example.test';
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      return original(input, init);
    const match = url.pathname.match(
      /^\/bot(90000\d{3}):synthetic_test_token_123456789\/(getMe|setWebhook)$/,
    );
    if (url.origin !== 'https://api.telegram.org' || !match)
      throw new Error('External request denied by isolated Telegram fixture');
    if (match[2] === 'getMe')
      return Response.json({
        ok: true,
        result: { id: Number(match[1]), is_bot: true, first_name: 'Synthetic Bot ' + match[1] },
      });
    if (match[1] === '90000999')
      return Response.json({ ok: false, error_code: 400 }, { status: 400 });
    return Response.json({ ok: true, result: true });
  };
}
