export const SOCIAL_FORMATS = {
  multimedia: {
    ar: 'منشور متعدد الوسائط',
    en: 'Multimedia Post',
    descriptionAr: 'انشر النصوص والروابط والصور والفيديو على Facebook وInstagram.',
    descriptionEn: 'Post Text, Link, Image, Video on Facebook & Instagram automatically.',
    icon: 'social',
  },
  cta: {
    ar: 'منشور دعوة لاتخاذ إجراء',
    en: 'CTA Post',
    descriptionAr: 'منشورات دعوة لاتخاذ إجراء على Facebook.',
    descriptionEn: 'Post Call to Action on Facebook automatically.',
    icon: 'share',
  },
  carousel: {
    ar: 'منشور شرائح أو فيديو',
    en: 'Carousel/Video Post',
    descriptionAr: 'منشورات الصور المتعددة والفيديو على Facebook.',
    descriptionEn: 'Post Carousel/Video on Facebook automatically.',
    icon: 'channels',
  },
};
export type SocialFormat = keyof typeof SOCIAL_FORMATS;
export type SocialPost = {
  id: string;
  name: string;
  format?: SocialFormat;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  kind: string;
  body: string;
  media_urls: string[];
  link_url: string | null;
  status: string;
  scheduled_at: string | null;
  error: string | null;
  provider_id: string | null;
};
export function socialFormat(post: Pick<SocialPost, 'format' | 'kind'>): SocialFormat {
  return (
    post.format ||
    (post.kind === 'cta' ? 'cta' : post.kind === 'carousel' ? 'carousel' : 'multimedia')
  );
}
export function socialMedia(value: string) {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function socialKind(post: { kind: string; link_url: string | null }) {
  return post.kind === 'text' && post.link_url ? 'link' : post.kind;
}
