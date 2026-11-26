'use client';
import TemplatesPanel from '../../../components/workspace/TemplatesPanel';

export default function ManagerTemplates({ channelId }: { channelId: string }) {
  return <TemplatesPanel params={{ id: channelId }} embedded />;
}
