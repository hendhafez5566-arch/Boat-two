type Translate = (ar: string, en: string) => string;

/** User-facing recovery messages, scoped to the manager rather than global API behavior. */
export function managerError(error: unknown, t: Translate): string {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof Error && 'details' in error
    ? (error as Error & {
        details?: { code?: string; limit?: string; message?: { code?: string; limit?: string } };
      }).details
    : undefined;
  const code = details?.code ?? details?.message?.code;
  const quota = details?.limit ?? details?.message?.limit;
  if (code === 'PLAN_LIMIT' || message.includes('PLAN_LIMIT')) {
    if (quota === 'flows' || message.includes('"limit":"flows"')) {
      return t(
        'اكتملت سعة التدفقات في الباقة الحالية، بما فيها المسودات والتدفقات الفرعية. راجع «اشتراكي ← الباقات» أو عدّل تدفقًا موجودًا.',
        'The flow quota is full, including drafts and reusable subflows. Review My Subscription → Plans or edit an existing flow.',
      );
    }
    return t(
      'وصلت إلى أحد حدود الباقة الحالية. راجع «اشتراكي» لمعرفة السعة المتاحة.',
      'A plan limit has been reached. Review My Subscription to see available quotas.',
    );
  }
  if (/^(Failed to fetch|NetworkError|Load failed)/i.test(message))
    return t(
      'تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة.',
      'Could not reach the server. Check your connection and try again.',
    );
  return message;
}
