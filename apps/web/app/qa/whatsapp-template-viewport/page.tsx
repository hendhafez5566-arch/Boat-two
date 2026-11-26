import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TemplateViewport({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'preview') notFound();
  const { channel } = await searchParams;
  if (!channel || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(channel)) notFound();
  return (
    <iframe
      title="390 px WhatsApp template viewport"
      src={`/dashboard/channels/${channel}/templates`}
      style={{ display: 'block', width: 390, height: 844, border: 0 }}
    />
  );
}
