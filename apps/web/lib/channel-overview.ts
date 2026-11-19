export type ConnectionAccount = {
  name: string;
  type: string;
  external_id: string;
  status: string;
  connectionHealth?: { state: string; reason?: string };
};
export function channelConnectionState(account: ConnectionAccount): string {
  if (account.status === 'disabled') return 'disconnected';
  if (
    account.connectionHealth?.state === 'needs_action' &&
    account.connectionHealth.reason === 'authorization_expiring'
  )
    return 'expiring';
  // Local activation alone never establishes provider connectivity.
  return account.connectionHealth?.state ?? 'needs_action';
}
export function filterConnectionAccounts<T extends ConnectionAccount>(
  accounts: T[],
  platform: string,
  status: string,
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  return accounts.filter(
    (account) =>
      (platform === 'all' || account.type === platform) &&
      (status === 'all' || channelConnectionState(account) === status) &&
      `${account.name} ${account.type} ${account.external_id}`.toLocaleLowerCase().includes(query),
  );
}
export function connectionAccountCounts(accounts: ConnectionAccount[]) {
  return {
    total: accounts.length,
    connected: accounts.filter((a) => channelConnectionState(a) === 'connected').length,
    expiring: accounts.filter((a) => channelConnectionState(a) === 'expiring').length,
    needsAction: accounts.filter(
      (a) => !['connected', 'disconnected'].includes(channelConnectionState(a)),
    ).length,
    disconnected: accounts.filter((a) => channelConnectionState(a) === 'disconnected').length,
  };
}
