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
        <h1><NavIcon name="social" /> {t('النشر الاجتماعي', 'Social publishing')}</h1>
        <span>Facebook · Instagram</span>
      </header>
      <div className={styles.formats}>
        {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((key) => {
          const f = SOCIAL_FORMATS[key];
          return (
            <Link href={'/dashboard/social/' + key} key={key} data-format={key}>
              <span className={styles.formatIcon}>
                <NavIcon name={f.icon} />
              </span>
              <h2>{t(f.ar, f.en)}</h2>
              <p>{t(f.descriptionAr, f.descriptionEn)}</p>
              <span className={styles.cardArrow}><NavIcon name="chevron" /></span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
