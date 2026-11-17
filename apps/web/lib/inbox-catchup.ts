/** Bounded incremental catch-up. Server paging prevents silently losing an offline backlog. */
export async function catchUpMessages<T extends { id: string; seq: number | string }>(
  after: number,
  load: (after: number) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<T[]> {
  const messages: T[] = [];
  const ids = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const result = await load(after);
    let next = after;
    for (const message of result.items) {
      next = Math.max(next, Number(message.seq) || 0);
      if (!ids.has(message.id)) { ids.add(message.id); messages.push(message); }
    }
    if (!result.hasMore || next <= after) break;
    after = next;
  }
  return messages;
}
