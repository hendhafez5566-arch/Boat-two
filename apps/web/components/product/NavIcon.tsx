const paths: Record<string, string> = {
  crm: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  campaigns: 'm3 11 18-8-8 18-2-8-8-2Zm8 2L21 3',
  automations: 'M12 3v5M5 16v5M19 16v5M5 16h14M12 8H5v8M12 8h7v8',
  agents: 'M12 3v3M4 10h16v10H4V10ZM8 14h.01M16 14h.01M9 17h6M2 13h2M20 13h2',
  reports: 'M4 20V4M4 20h17M8 16v-5M13 16V7M18 16v-8',
  sessions: 'M12 8v4l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z',
  branding:
    'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a5 5 0 0 0 0-10h-4ZM7 9h.01M10 6h.01M16 7h.01',
  inbox: 'M3 4h18v16H3V4Zm0 10h5l2 3h4l2-3h5',
  flows: 'M4 3h6v6H4V3ZM14 15h6v6h-6v-6ZM7 9v9h7M10 6h7v9',
  channels: 'M7 7a7 7 0 0 1 10 0M4 4a12 12 0 0 1 16 0M10 10a3 3 0 0 1 4 0M12 14v7',
  knowledge: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4ZM12 6v16',
  delivery:
    'M3 7h13v10H3V7Zm13 4h3l3 3v3h-6M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  billing: 'M3 5h18v14H3V5Zm0 4h18M7 15h4',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
};
export function NavIcon({ name }: { name: string }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] || 'M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7ZM14 14h7v7h-7v-7Z'} />
    </svg>
  );
}
