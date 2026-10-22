/** A slightly wonky pencil who lives in the margin and takes notes. */
export default function PencilMascot({ mood = 'idle' }: { mood?: 'idle' | 'writing' }) {
  return (
    <svg
      className={`pencil-mascot pencil-mascot--${mood}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Pencil, the margin-notes assistant"
    >
      {/* pencil body, tipped as if mid-note */}
      <g transform="rotate(-24 32 32)">
        {/* eraser */}
        <rect x="24" y="4" width="16" height="9" rx="4" fill="#e6a99a" stroke="#5b4a3f" strokeWidth="2" />
        {/* ferrule */}
        <rect x="24" y="12" width="16" height="6" fill="#c9c2b4" stroke="#5b4a3f" strokeWidth="2" />
        {/* barrel */}
        <rect x="24" y="17" width="16" height="27" fill="#f4d97c" stroke="#5b4a3f" strokeWidth="2" />
        <line x1="30" y1="17" x2="30" y2="44" stroke="#e9c653" strokeWidth="3" />
        {/* sharpened wood */}
        <path d="M24 44 L32 57 L40 44 Z" fill="#f0dcc0" stroke="#5b4a3f" strokeWidth="2" strokeLinejoin="round" />
        {/* graphite tip */}
        <path d="M28.6 52 L32 57 L35.4 52 Z" fill="#5b4a3f" />
      </g>

      {/* a face, because a mascot should look back at you */}
      <g className="pencil-mascot__face">
        <circle cx="24" cy="30" r="2.6" fill="#5b4a3f" />
        <circle cx="40" cy="30" r="2.6" fill="#5b4a3f" />
        <path
          d="M25.5 38 Q32 43 38.5 38"
          fill="none"
          stroke="#5b4a3f"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* rosy cheeks */}
        <circle cx="19" cy="36" r="3" fill="#e6a99a" opacity="0.55" />
        <circle cx="45" cy="36" r="3" fill="#e6a99a" opacity="0.55" />
      </g>

      {/* little scribbles it is making */}
      <g className="pencil-mascot__scribbles" stroke="#7c9a72" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M8 52 q6 -5 11 0 t11 0" />
        <path d="M46 14 q5 -4 9 0" opacity="0.7" />
      </g>
    </svg>
  )
}
