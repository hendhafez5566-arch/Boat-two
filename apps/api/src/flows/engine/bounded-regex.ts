import { runInNewContext } from 'node:vm';

/** Bound configurable regular expressions, including legacy published graphs.
 * Only strings enter a fixed expression; no tenant code is evaluated.
 * Invalid/over-budget patterns fail closed as a non-match.
 */
export interface RegexBudget { remainingMs: number }
export function boundedRegexTest(pattern: string, value: string, budget?: RegexBudget): boolean {
  if (!pattern || pattern.length > 200 || (budget && budget.remainingMs < 1)) return false;
  const started = performance.now();
  try {
    return runInNewContext("new RegExp(pattern, 'i').test(value)",
      { pattern, value: value.slice(0, 1000) },
      { timeout: Math.max(1, Math.min(25, Math.floor(budget?.remainingMs ?? 25))), contextCodeGeneration: { strings: false, wasm: false } }) === true;
  } catch {
    return false;
  } finally {
    if (budget) budget.remainingMs -= performance.now() - started;
  }
}

export function isValidRegexPattern(pattern: string): boolean {
  if (!pattern || pattern.length > 200) return false;
  try {
    return runInNewContext("new RegExp(pattern, 'i'); true", {pattern},
      {timeout:25,contextCodeGeneration:{strings:false,wasm:false}}) === true;
  } catch { return false; }
}
