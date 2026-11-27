'use client';

import { useState } from 'react';
import { NavIcon } from '../product/NavIcon';
import styles from './product-catalog.module.css';
import { useLocale } from '../product/locale';

const weekdays = [
  ['mon', 'الاثنين', 'Monday'], ['tue', 'الثلاثاء', 'Tuesday'],
  ['wed', 'الأربعاء', 'Wednesday'], ['thu', 'الخميس', 'Thursday'],
  ['fri', 'الجمعة', 'Friday'], ['sat', 'السبت', 'Saturday'],
  ['sun', 'الأحد', 'Sunday'],
] as const;

const featuredZones = [
  ['Africa/Cairo', 'القاهرة', 'Cairo'], ['Asia/Riyadh', 'الرياض', 'Riyadh'],
  ['Asia/Dubai', 'دبي', 'Dubai'], ['UTC', 'التوقيت العالمي', 'Coordinated Universal Time'],
] as const;
const otherZones = (Intl.supportedValuesOf?.('timeZone') ?? []).filter(
  (zone) => !featuredZones.some(([id]) => id === zone),
);

export function readAppointmentHours(form: FormData, t: ReturnType<typeof useLocale>['t']) {
  const schedule: Partial<Record<typeof weekdays[number][0], [string, string][]>> = {};
  for (const [day, ar, en] of weekdays) {
    const starts = form.getAll(day + '-start');
    const ends = form.getAll(day + '-end');
    if (!starts.length) continue;
    schedule[day] = starts.map((start, index) => {
      const end = ends[index];
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      if (typeof start !== 'string' || typeof end !== 'string' || !time.test(start) || !time.test(end) || start === end) {
        throw new Error(t(
          `اختر وقت بدء وانتهاء مختلفين ليوم ${ar}.`,
          `Choose different start and end times for ${en}.`,
        ));
      }
      return [start, end];
    });
  }
  return schedule;
}

export function AppointmentHours() {
  const { t } = useLocale();
  const [periods, setPeriods] = useState<Partial<Record<typeof weekdays[number][0], number>>>({ mon: 1, tue: 1 });

  return <fieldset className={styles.hours}><legend><NavIcon name="stopwatch"/>{t('ساعات العمل', 'Working hours')}</legend>
    <label className="field">
      {t('المنطقة الزمنية للخدمة', 'Service timezone')}
      <select name="timezone" defaultValue="Africa/Cairo" required>
        {featuredZones.map(([id, ar, en]) => <option key={id} value={id}>{t(ar, en)} ({id})</option>)}
        {otherZones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
      </select>
    </label>
    <p>{t(
      'اترك فجوة بين الفترات لتحديد استراحة. إذا كان وقت النهاية أسبق من البداية، تمتد الفترة إلى اليوم التالي.',
      'Leave a gap between periods to schedule a break. An end time earlier than the start runs into the next day.',
    )}</p>
    <p className={styles.formHint}>{t('إذا لم تحدد أي يوم، تكون الخدمة متاحة طوال الأسبوع.', 'With no days selected, the service is available all week.')}</p><div className={styles.hoursTable}>
    {weekdays.map(([day, ar, en]) => {
      const count = periods[day] ?? 0;
      const setCount = (next: number) => setPeriods((current) => ({ ...current, [day]: next }));
      return <div key={day} className={styles.dayRow} data-active={count>0}><label className={styles.dayName}>
          <input type="checkbox" checked={count > 0} onChange={(event) => setCount(event.target.checked ? 1 : 0)} />
          <strong>{t(ar,en)}</strong></label><div className={styles.dayPeriods}>{count===0&&<small>{t('غير محدد','Not scheduled')}</small>}
        {Array.from({ length: count }, (_, index) => (
          <div className={styles.timePair} key={index}>
            <label className="field">{t('من', 'From')} {index + 1}
              <input name={day + '-start'} type="time" defaultValue={index === 0 ? '09:00' : undefined} required />
            </label>
            <label className="field">{t('إلى', 'To')} {index + 1}
              <input name={day + '-end'} type="time" defaultValue={index === 0 ? '17:00' : undefined} required />
            </label>
          </div>
        ))}
        </div>{count > 0 && <div className={styles.dayActions}>
          <button type="button" className="btn" disabled={count === 6} onClick={() => setCount(count + 1)}>
            <NavIcon name="plus"/>{t('فترة','Period')}
          </button>
          {count > 1 && <button type="button" className="btn" onClick={() => setCount(count - 1)}>
            <NavIcon name="trash"/>{t('حذف الأخيرة','Remove last')}
          </button>}
        </div>}
      </div>;
    })}</div>
  </fieldset>;
}
