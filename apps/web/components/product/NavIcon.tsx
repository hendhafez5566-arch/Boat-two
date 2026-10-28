const paths: Record<string, string> = {
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  moreVertical: 'M12 5h.01M12 12h.01M12 19h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  language: 'M3 5h12M9 3v2M5 5c0 6 7 10 7 10M13 5c0 6-6 10-10 11M14 21l4-11 4 11M15.5 17h5',
  userClock:
    'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 21v-2a6 6 0 0 1 8-6M22 17a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM17 14v3l2 1',
  stopwatch: 'M9 2h6M12 2v3M18 6l2-2M12 9v5l2 1M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  calendar: 'M4 5h16v16H4V5ZM4 9h16M8 3v4M16 3v4M8 13h2M14 13h2M8 17h2',
  flag: 'M5 22V3h13l-3 5 3 5H5',
  handshake:
    'm3 11 5 5 4-4 5 4 4-5M1 7l4-3 5 3M23 7l-4-3-7 3-3 4 3 2 4-3M6 17l2 2 3-2M10 19l2 2 3-3M14 20l3-2',
  coins:
    'M3 6c0-4 12-4 12 0s-12 4-12 0ZM3 6v5c0 3 6 4 10 2M3 11v5c0 3 6 4 10 2M13 12c0-4 9-4 9 0s-9 4-9 0ZM13 12v6c0 4 9 4 9 0v-6',
  temperature: 'M9 15V5a3 3 0 0 1 6 0v10a5 5 0 1 1-6 0ZM12 8v11',
  share:
    'M8 12l8-5M8 13l8 5M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  mail: 'M3 5h18v14H3V5ZM3 5l9 8 9-8',
  phone: 'M7 3 3 5c0 8 8 16 16 16l2-4-5-3-2 2-6-6 2-2-3-5Z',
  smile: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 9h.01M16 9h.01M8 14c2 4 6 4 8 0',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 2M4 16l2 2a7 7 0 0 0 12-1',
  plus: 'M12 4v16M4 12h16',
  chat: 'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',
  unread: 'M3 3l18 18M4 9a8 8 0 0 0 14 9M9 4a8 8 0 0 1 11 11M3 21l2-5',
  archive: 'M3 4h18v5H3V4Zm2 5v12h14V9M9 13h6',
  blocked: 'M6 6l12 12M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  filter: 'M3 4h18l-7 8v8l-4-2v-6L3 4Z',
  copy: 'M8 8h12v13H8V8ZM16 8V3H3v13h5',
  edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
  export: 'M4 10v11h16V10M12 16V2m-5 5 5-5 5 5',
  folder: 'M3 5h7l2 3h9v13H3V5Z',
  social: 'M4 4h16v16H4V4ZM4 15l5-5 5 5 3-3 3 3M15 8h.01',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'm6 9 6 6 6-6',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  shield: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z',
  upgrade: 'M3 5h18v14H3V5Zm0 4h18M7 15h4',
  support: 'M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 12v4a2 2 0 0 0 2 2h1v-6H4M12 20h4',
  developer: 'm8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12',
  integrations: 'M7 7h4v4H7V7ZM13 13h4v4h-4v-4ZM11 9h2a2 2 0 0 1 2 2v2',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  sequences: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  commerce: 'M3 4h2l2 12h11l2-8H6M9 20h.01M17 20h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  question: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-4 5-4 13 0 18M12 3c4 5 4 13 0 18',
  variable: 'M8 4H5v16h3M16 4h3v16h-3M10 9l4 6M14 9l-4 6',
  check: 'M5 12l4 4L19 6',
  undo: 'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6',
  redo: 'm15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  play: 'm8 4 12 8-12 8V4Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  team: 'M4 20v-3a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v3M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 10a2 2 0 1 0 0-4M18 14a3 3 0 0 1 3 3v3',
  departments: 'M9 3h6v5H9V3ZM3 16h6v5H3v-5ZM15 16h6v5h-6v-5ZM12 8v4M6 16v-4h12v4',
  audit: 'M5 3h14v18H5V3ZM8 7h8M8 11h8M8 15h5',
  ai: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8M9 9h6v6H9V9Z',
  onboarding: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 12l3 3 5-6',
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
    'M9 3h6l.6 2.3 2 .9 2.2-.6 3 5-1.7 1.7v2.3l1.7 1.7-3 5-2.2-.6-2 .9L15 24H9l-.6-2.4-2-.9-2.2.6-3-5L3 14.6v-2.3L1.2 10.6l3-5 2.2.6 2-.9L9 3ZM16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z',
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
