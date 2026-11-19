/** Independent decorative SVG; no vendor artwork or reference assets. */
export default function ConnectionIllustration({ mode }: { mode: 'embedded' | 'api' }) {
  return (
    <svg viewBox="0 0 180 200" width="180" height="200" aria-hidden="true" focusable="false">
      <circle cx="105" cy="65" r="55" fill={mode === 'embedded' ? '#effaf2' : '#eff4ff'} />
      {mode === 'embedded' ? (
        <>
          <rect x="42" y="70" width="91" height="115" rx="14" fill="#e3f1ed" />
          <rect x="51" y="82" width="73" height="86" rx="7" fill="#f8fcfa" />
          <path
            d="M67 99h36M67 112h27M67 125h36"
            stroke="#9bccb8"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="112" cy="54" r="25" fill="#21b56a" />
          <path
            d="m100 54 8 8 16-17"
            stroke="white"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="86" cy="174" r="3" fill="#80bba2" />
        </>
      ) : (
        <>
          <rect x="28" y="81" width="121" height="84" rx="9" fill="#cbd6fb" />
          <path d="M28 94h121" stroke="#6759e8" strokeWidth="22" />
          <circle cx="40" cy="85" r="2" fill="white" />
          <circle cx="48" cy="85" r="2" fill="white" />
          <rect x="39" y="111" width="14" height="14" rx="4" fill="#7666ec" />
          <path d="m42 118 3 3 6-7" fill="none" stroke="white" strokeWidth="2" />
          <path d="M64 116h62M64 139h47" stroke="white" strokeWidth="7" strokeLinecap="round" />
          <path
            d="M47 64c8-30 68-37 91 5"
            stroke="#aea5ec"
            strokeDasharray="4 5"
            strokeWidth="2"
            fill="none"
          />
          <circle cx="94" cy="38" r="13" fill="#b6b0ee" />
          <circle cx="94" cy="38" r="6" fill="white" />
        </>
      )}
    </svg>
  );
}
