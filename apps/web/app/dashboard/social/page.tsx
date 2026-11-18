'use client';
import {ExternalDeliveryNotice} from '../../../components/product/ExternalDeliveryNotice';
import Link from 'next/link';
import { useLocale } from '../../../components/product/locale';
import { NavIcon } from '../../../components/product/NavIcon';
import { SOCIAL_FORMATS, SocialFormat } from '../../../lib/social-posts';
import styles from './social.module.css';
export default function Page() {
  const { t } = useLocale();
  return (
    <main className={styles.page}>
      <ExternalDeliveryNotice publishing />
      <header className={styles.heading}>
        <h1>{t('النشر على Facebook وInstagram', 'Facebook & Instagram Poster')}</h1>
        <p>
          {t(
            'جهّز محتواك ومسوداتك، واربط الحسابات المصرح بها قبل النشر.',
            'Prepare content and drafts, and connect authorized accounts before publishing.',
          )}
        </p>
      </header>
      <div className={styles.formats}>
        {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((key) => {
          const f = SOCIAL_FORMATS[key];
          return (
            <Link href={'/dashboard/social/' + key} key={key}>
              <span className={styles.formatIcon}>
                <NavIcon name={f.icon} />
              </span>
              <h2>{t(f.ar, f.en)}</h2>
              <p>{t(f.descriptionAr, f.descriptionEn)}</p>
              <strong>{t('فتح', 'Open')} <span className={styles.cardArrow}><NavIcon name="chevron" /></span></strong>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
