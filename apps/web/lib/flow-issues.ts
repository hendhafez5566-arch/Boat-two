export type FlowIssue = { nodeId?: string; message: string };
/** API semantic errors are arrays; Zod field errors are a dictionary. Never put that dictionary in React list state. */
export function flowIssues(value: unknown, nodeIds: string[] = []): FlowIssue[] {
  if (Array.isArray(value))
    return value.flatMap((item) => {
      if (typeof item === 'string') return [{ message: item }];
      if (!item || typeof item.message !== 'string') return [];
      const path = Array.isArray(item.path) ? item.path : [];
      const i = path.indexOf('nodes');
      const nodeId =
        typeof item.nodeId === 'string'
          ? item.nodeId
          : i >= 0 && typeof path[i + 1] === 'number'
            ? nodeIds[path[i + 1]]
            : undefined;
      return [{ ...(nodeId ? { nodeId } : {}), message: item.message }];
    });
  if (value && typeof value === 'object')
    return Object.values(value).flatMap((v) => flowIssues(v, nodeIds));
  return [];
}
