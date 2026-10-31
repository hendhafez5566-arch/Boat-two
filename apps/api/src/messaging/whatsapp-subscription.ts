/**
 * Read-only interpretation of Meta's /{waba-id}/subscribed_apps listing.
 * Never subscribe or overwrite webhook overrides during diagnosis.
 */
export function inspectWhatsAppSubscription(
  payload: unknown,
  appId: string,
  expectedCallback: string,
): 'subscribed' | 'missing' | 'overridden' | 'incomplete' {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return 'incomplete';
  const response = payload as {
    data?: { whatsapp_business_api_data?: { id?: string | number }; override_callback_uri?: string }[];
    paging?: { next?: string };
  };
  if (!Array.isArray(response.data)) return 'incomplete';
  const found = response.data.find((row) =>
    String(row?.whatsapp_business_api_data?.id ?? '') === appId,
  );
  if (!found) return response.paging?.next ? 'incomplete' : 'missing';
  if (found.override_callback_uri && found.override_callback_uri !== expectedCallback)
    return 'overridden';
  return 'subscribed';
}
