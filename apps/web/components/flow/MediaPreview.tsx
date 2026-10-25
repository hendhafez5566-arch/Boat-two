'use client';
import { useEffect, useState } from 'react';
import { useLocale } from '../product/locale';

export default function MediaPreview({media}: {media: {kind: string; url?: string; caption?: string; filename?: string}}) {
  const {t} = useLocale();
  const [failed,setFailed] = useState(false);
  useEffect(() => setFailed(false), [media.url,media.kind]);
  let url = '';
  try {const parsed=new URL(media.url || '');if(['https:','http:'].includes(parsed.protocol))url=parsed.href;} catch {}
  const label=media.filename || ({image:t('صورة','Image'),video:t('فيديو','Video'),audio:t('تسجيل صوتي','Audio'),file:t('مرفق','Attachment')} as Record<string,string>)[media.kind] || t('مرفق','Attachment');
  if (!url || failed) return <div className="notice" role="status">{failed ? t('تعذر تحميل المرفق. تحقق من صلاحية الرابط وإتاحته.', 'Attachment could not load. Check that the link is valid and accessible.') : t('معاينة المرفق غير متاحة؛ أدخل رابطًا صالحًا أو جرّب البوت بعد تعبئة المتغيرات.', 'Preview unavailable; enter a valid URL or run the bot with resolved variables.')}</div>;
  return <figure className="nodrag nopan" style={{margin:0,maxWidth:'100%'}}>
    {media.kind === 'image' ? <img src={url} alt={media.caption || label} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} style={{width:'100%',maxHeight:220,objectFit:'contain'}} />
      : media.kind === 'video' ? <video src={url} controls preload="none" onError={()=>setFailed(true)} style={{maxWidth:'100%',maxHeight:220}} />
      : media.kind === 'audio' ? <audio src={url} controls preload="none" onError={()=>setFailed(true)} style={{width:'100%'}} />
      : <a href={url} target="_blank" rel="noopener noreferrer" className="btn">📎 {label} · {t('فتح المرفق','Open attachment')}</a>}
    {media.caption && <figcaption>{media.caption}</figcaption>}
  </figure>;
}
