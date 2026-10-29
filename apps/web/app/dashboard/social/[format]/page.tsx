import { notFound } from 'next/navigation';
import { SOCIAL_FORMATS, SocialFormat } from '../../../../lib/social-posts';
import SocialWorkspace from '../../../../components/workspace/SocialWorkspace';
export default function Page({ params }: { params: { format: string } }) {
  if (!Object.hasOwn(SOCIAL_FORMATS, params.format)) notFound();
  return <SocialWorkspace format={params.format as SocialFormat} />;
}
