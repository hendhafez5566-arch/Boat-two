export function estimateCost(
  input: number,
  output: number,
  inputRate: string | number | null,
  outputRate: string | number | null,
): number | null {
  if (inputRate === null || outputRate === null) return null;
  const cost = Math.round((input * Number(inputRate) + output * Number(outputRate)) / 1000000);
  return Number.isSafeInteger(cost) && cost >= 0 ? cost : null;
}
