/** Turn the known malformed workbook failure into an actionable localized message. */
export function catalogError(message: string, language: string) {
  if (message === 'Cannot import workbook: Invalid XLSX archive')
    return language === 'ar'
      ? 'تعذّر فتح ملف Excel لأنه تالف أو ليس بصيغة XLSX صحيحة. افتحه في Excel واحفظ نسخة جديدة، ثم ارفعها مجددًا.'
      : 'This Excel file is damaged or is not a valid XLSX workbook. Open it in Excel, save a new copy, and upload it again.';
  return message;
}
