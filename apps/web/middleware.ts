import { NextRequest, NextResponse } from 'next/server';
export async function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete('x-boat-custom-host');
  if (process.env.CUSTOM_DOMAINS_ENABLED !== 'true')
    return NextResponse.next({ request: { headers } });
  const host = request.headers.get('host')?.toLowerCase().replace(/:\d+$/, '') ?? '';
  const canonical = (process.env.BOAT_CANONICAL_HOSTS ?? 'localhost,127.0.0.1')
    .split(',')
    .map((value) => value.trim().toLowerCase());
  if (canonical.includes(host)) return NextResponse.next({ request: { headers } });
  try {
    const api = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
    const result = await fetch(
      api + '/domains/resolve?' + new URLSearchParams({ hostname: host }),
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!result.ok) return new NextResponse('Domain unavailable', { status: 404 });
    headers.set('x-boat-custom-host', host);
    return NextResponse.next({ request: { headers } });
  } catch {
    return new NextResponse('Domain temporarily unavailable', { status: 503 });
  }
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
