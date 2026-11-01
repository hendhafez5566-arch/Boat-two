export function previewReplyHint(status: string, busy: boolean, language: string) {
  const ar = language === 'ar';
  if (busy) return ar ? 'جارٍ تنفيذ الخطوة…' : 'Running the step…';
  if (status.startsWith('waiting')) return ar ? 'اكتب ردّ العميل…' : 'Type a customer reply…';
  if (status === 'handed_off')
    return ar
      ? 'تم التحويل لموظف — أعد البدء لتجربة جديدة'
      : 'Handed off — restart for a new preview';
  if (status === 'error')
    return ar
      ? 'تعذّرت التجربة — راجع الخطأ ثم أعد البدء'
      : 'Preview failed — review the error and restart';
  if (status) return ar ? 'انتهت التجربة — اضغط إعادة البدء' : 'Preview ended — select Restart';
  return ar ? 'ابدأ التجربة أولًا' : 'Start the preview first';
}
