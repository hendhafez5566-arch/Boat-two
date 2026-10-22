export interface Chunk {
  index: number;
  content: string;
}

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

const MAX_CHUNKS = 2000;
const SENTENCE_SPLIT = /(?<=[.!?؟۔\n])\s+/;

function hardSplit(text: string, max: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max));
  return out;
}

/** تقسيم الفقرة الطويلة على حدود الجمل، وما زاد عن الحد يُقسَّم بالحروف */
function splitLong(paragraph: string, max: number): string[] {
  if (paragraph.length <= max) return [paragraph];
  const out: string[] = [];
  let cur = '';
  for (const sentence of paragraph.split(SENTENCE_SPLIT)) {
    if (sentence.length > max) {
      if (cur) out.push(cur);
      cur = '';
      out.push(...hardSplit(sentence, max));
      continue;
    }
    if (cur && cur.length + 1 + sentence.length > max) {
      out.push(cur);
      cur = sentence;
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function tailAtWordBoundary(text: string, n: number): string {
  if (n <= 0 || text.length <= n) return n <= 0 ? '' : text;
  const tail = text.slice(-n);
  const sp = tail.search(/\s/);
  return sp === -1 ? tail : tail.slice(sp + 1);
}

/**
 * تقطيع نص إلى مقاطع للبحث الدلالي: يحافظ على الفقرات والعناوين (# …) ويضيف تداخلاً بسيطاً بين المقاطع.
 */
export function chunkText(input: string, opts: ChunkOptions = {}): Chunk[] {
  const max = opts.maxChars ?? 900;
  const overlap = Math.min(opts.overlap ?? 100, Math.floor(max / 3));
  const text = input.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!text) return [];

  const chunks: string[] = [];
  let heading = '';
  let cur = '';
  let curHasHeading = false;

  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = '';
    curHasHeading = false;
  };

  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (/^#{1,6}\s/.test(p) && !p.includes('\n')) {
      heading = p;
      continue; // العنوان يُضاف كسياق للمقاطع التي تليه
    }
    for (const piece of splitLong(p, max)) {
      const prefix: string = heading && !curHasHeading && !cur ? `${heading}\n` : '';
      if (cur && cur.length + 2 + piece.length > max) {
        const prev = cur;
        flush();
        const carry = tailAtWordBoundary(prev, overlap);
        cur = (heading ? `${heading}\n` : '') + (carry ? `${carry} ` : '') + piece;
        curHasHeading = !!heading;
      } else if (cur) {
        cur += `\n\n${piece}`;
      } else {
        cur = prefix + piece;
        curHasHeading = !!prefix;
      }
    }
  }
  flush();

  if (chunks.length > MAX_CHUNKS) throw new Error(`Document is too large (more than ${MAX_CHUNKS} chunks)`);
  return chunks.map((content, index) => ({ index, content }));
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** كل سؤال وجوابه مقطع واحد (لا نقسّمهما حتى لا يضيع الربط بينهما) */
export function faqChunks(items: FaqItem[]): Chunk[] {
  return items
    .filter((i) => i.question.trim() && i.answer.trim())
    .map((i, index) => ({ index, content: `Q: ${i.question.trim()}\nA: ${i.answer.trim()}`.slice(0, 3000) }));
}

export const FAQ_DELIMITER = '\n---\n';

export function faqToText(items: FaqItem[]): string {
  return faqChunks(items).map((c) => c.content).join(FAQ_DELIMITER);
}

export function faqFromText(text: string): Chunk[] {
  return text
    .split(FAQ_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((content, index) => ({ index, content: content.slice(0, 3000) }));
}
