/** Only explicitly activated settings affect delivery. Legacy channels keep their behavior. */
export type ActiveBotSettings = {
  general?: { noMatchReply?: boolean; getStartedEnabled?: boolean };
  businessHour?: {
    timezone: string;
    offDays: string[];
    schedule: { day: string; start: string; end: string }[];
    disableBotDuringHours: boolean;
  };
  sharedInbox?: { inputFlowSessionExpiryMinutes?: number | null; signatureEnabled?: boolean; humanSessionExpiryMinutes?: number | null };
};
export function activeBotSettings(settings: unknown): ActiveBotSettings {
  return (settings as { botManagerActive?: ActiveBotSettings } | null)?.botManagerActive ?? {};
}
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function duringBusinessHours(config: ActiveBotSettings['businessHour'], now: Date): boolean {
  if (!config) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? '';
  const day = part('weekday');
  if (config.offDays.includes(day)) return false;
  const minute = Number(part('hour')) * 60 + Number(part('minute'));
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return config.schedule.some((r) => {
    if (!r.start || !r.end || r.start === r.end || config.offDays.includes(r.day)) return false;
    const start = minutes(r.start),
      end = minutes(r.end);
    if (start < end) return r.day === day && minute >= start && minute < end;
    const next = days[(days.indexOf(r.day) + 1) % 7];
    return (r.day === day && minute >= start) || (next === day && minute < end);
  });
}

/** Null/absent keeps the existing workspace policy; zero semantics are not adopted. */
export function humanSessionMinutes(settings: unknown, workspaceMinutes: number): number {
  const value = activeBotSettings(settings).sharedInbox?.humanSessionExpiryMinutes;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 525600
    ? value
    : workspaceMinutes;
}
