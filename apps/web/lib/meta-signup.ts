/** Coordinates SDK auth and FINISH messages in either order. No credential logging. */
export function embeddedSignupSession(timeoutMs = 15000) {
  let selected: { wabaId: string; phoneNumberId: string } | undefined;
  let finish: ((value: { wabaId: string; phoneNumberId: string }) => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    receive(origin: string, payload: unknown) {
      if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(origin)) return;
      try {
        const value = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (value?.type !== 'WA_EMBEDDED_SIGNUP' || value?.event !== 'FINISH') return;
        const wabaId = value.data?.waba_id;
        const phoneNumberId = value.data?.phone_number_id;
        if (
          typeof wabaId !== 'string' ||
          !/^\d+$/.test(wabaId) ||
          typeof phoneNumberId !== 'string' ||
          !/^\d+$/.test(phoneNumberId)
        )
          return;
        selected = { wabaId, phoneNumberId };
        finish?.(selected);
      } catch {
        /* Other Meta messages are not signup results. */
      }
    },
    wait(): Promise<{ wabaId: string; phoneNumberId: string }> {
      if (selected) return Promise.resolve(selected);
      return new Promise((resolve, reject) => {
        finish = (value) => {
          if (timer) clearTimeout(timer);
          resolve(value);
        };
        timer = setTimeout(
          () => reject(new Error('Meta signup account selection did not complete. Please retry.')),
          timeoutMs,
        );
      });
    },
    dispose() {
      if (timer) clearTimeout(timer);
      finish = undefined;
    },
  };
}
