export function licensedQuantity(item: {
  quantity?: number | null;
  price?: { recurring?: { usage_type?: string } | null };
}) {
  if (item.price?.recurring?.usage_type === 'metered')
    throw new Error('Metered subscription changes require operator review');
  const quantity = item.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000)
    throw new Error('Unsupported subscription quantity requires review');
  return quantity;
}
