import { notFound } from 'next/navigation';
import { SOCIAL_FORMATS, SocialFormat } from '../../../../../lib/social-posts';
import SocialWorkspace from '../../../../../components/workspace/SocialWorkspace';
export default async function Page({ params }: { params: Promise<{ format: string }> }) {
  const route = await params;
  if (!Object.hasOwn(SOCIAL_FORMATS, route.format)) notFound();
  return <SocialWorkspace format={route.format as SocialFormat} create />;
}
