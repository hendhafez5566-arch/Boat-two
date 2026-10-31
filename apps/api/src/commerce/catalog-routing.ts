/** Only unambiguous company contact/location/hours questions may use the existing
 * knowledge assistant. Commercial and mixed requests stay catalog-grounded, so
 * missing prices cannot fall through to an older knowledge document.
 */
export function isGeneralCompanyQuestion(question: string): boolean {
  const q = question.toLowerCase().normalize('NFKC').replace(/[أإآ]/g, 'ا');
  if (q.length > 240) return false;
  if (
    /سعر|اسعار|بكام|تكلف|خصم|عرض|عروض|متاح|توافر|مخزون|حجز|برنامج|برامج|منتج|صنف|مقاس|غرف|طفل|اطفال|price|cost|discount|offer|stock|availab|book|product|item|size|room|child|\d/.test(
      q,
    )
  )
    return false;
  const intent =
    /عنوان\s*(الشركه|الشركة|المطعم|المتجر|المحل)|مواعيد\s*(العمل|الشركه|الشركة|المحل)|ساعات\s*العمل|رقم\s*(التواصل|الشركه|الشركة|المحل|الهاتف|التليفون)|تليفون\s*(الشركه|الشركة)|ايميل\s*(الشركه|الشركة)|company\s*(address|location|phone|email)|opening\s*hours|business\s*hours|contact\s*(number|details|email)/;
  if (!intent.test(q)) return false;
  const polite = new Set([
    'فين',
    'ايه',
    'ما',
    'هو',
    'هي',
    'هى',
    'من',
    'فضلك',
    'لو',
    'سمحت',
    'ممكن',
    'اعرف',
    'اين',
    'what',
    'are',
    'is',
    'your',
    'the',
    'please',
    'where',
    'can',
    'i',
    'know',
    'me',
    'tell',
  ]);
  return q
    .replace(intent, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .every((word) => polite.has(word));
}
