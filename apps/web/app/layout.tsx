import '@fontsource-variable/dm-sans';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import './design-system.css';
import './builder-responsive.css';
import './sequence-builder.css';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { BrandProvider, PublicBrand } from '../components/product/BrandContext';
import { LocaleProvider } from '../components/product/locale';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';

export const metadata = { title: 'ELHAFEZ BOAT | المحادثات والأتمتة' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  let brand: PublicBrand | null = null;
  const host = headers().get('x-boat-custom-host');
  if (host && process.env.CUSTOM_DOMAINS_ENABLED === 'true') {
    const response = await fetch(
      (process.env.INTERNAL_API_URL ?? 'http://localhost:4000') +
        '/domains/resolve?' +
        new URLSearchParams({ hostname: host }),
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) notFound();
    brand = { ...(await response.json()), hostname: host };
  }
  return (
    <html lang="ar" dir="rtl">
      <body
        style={brand ? ({ '--primary': brand.primaryColor } as React.CSSProperties) : undefined}
      >
        <LocaleProvider>
          <BrandProvider brand={brand}>{children}</BrandProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
