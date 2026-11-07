type Translate = (ar: string, en: string) => string;

/** User-facing recovery messages, scoped to the manager rather than global API behavior. */
export function managerError(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('PLAN_LIMIT'))
    return t(
      'وصلت مساحة العمل إلى الحد المسموح لعدد البوتات في خطتك الحالية. راجع حدود الاشتراك قبل إنشاء بوت آخر.',
      'Your workspace has reached the bot limit for its current plan. Review your subscription limits before creating another bot.',
    );
  if (/^(Failed to fetch|NetworkError|Load failed)/i.test(message))
    return t(
      'تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة.',
      'Could not reach the server. Check your connection and try again.',
    );
  return message;
}
