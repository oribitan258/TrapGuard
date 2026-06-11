// Shared TrapGuard brand + control primitives for the extension pages
// (popup + options). Tailwind v4 logical-property classes only — no inline
// styles (CLAUDE.md). SVG presentation attributes (width/height/stroke) are not
// inline `style` and are allowed. Hebrew/RTL is handled by the host page roots.

/** The TrapGuard red-shield logo (ported verbatim from designs/*.jsx). */
export function ShieldLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 118"
      width={size}
      height={Math.round(size * 1.18)}
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <radialGradient id="tg-fill" cx="50%" cy="34%" r="64%">
          <stop offset="0%" stopColor="#F0455C" />
          <stop offset="48%" stopColor="#B81E30" />
          <stop offset="100%" stopColor="#5A0E18" />
        </radialGradient>
        <filter
          id="tg-border-glow"
          x="-20%"
          y="-15%"
          width="140%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          id="tg-beam-glow"
          x="-30%"
          y="-200%"
          width="160%"
          height="500%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* ① Shield body */}
      <path d="M50 5 L91 18 L91 57 C91 88 71 106 50 115 C29 106 9 88 9 57 L9 18 Z" fill="url(#tg-fill)" />
      {/* ② Glowing outer rim */}
      <path
        d="M50 5 L91 18 L91 57 C91 88 71 106 50 115 C29 106 9 88 9 57 L9 18 Z"
        fill="none"
        stroke="#E0304C"
        strokeWidth="2.5"
        opacity="0.35"
        filter="url(#tg-border-glow)"
      />
      {/* ③ Crisp 1px border */}
      <path
        d="M50 5 L91 18 L91 57 C91 88 71 106 50 115 C29 106 9 88 9 57 L9 18 Z"
        fill="none"
        stroke="#C42438"
        strokeWidth="0.8"
        opacity="0.9"
      />
      {/* ④ Top-edge metallic highlights */}
      <path d="M51 6.5 L89 19" stroke="rgba(255,255,255,0.13)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M49 6.5 L11 19" stroke="rgba(255,255,255,0.13)" strokeWidth="1.2" strokeLinecap="round" />
      {/* ⑤ Corner HUD brackets */}
      <path d="M15 27 L15 20 L22 20" fill="none" stroke="#D42840" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <path d="M85 27 L85 20 L78 20" fill="none" stroke="#D42840" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      {/* ⑥ Scanner frame corners */}
      <path d="M31 38 L31 33 L36 33" fill="none" stroke="#E83050" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <path d="M69 38 L69 33 L64 33" fill="none" stroke="#E83050" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <path d="M31 75 L31 80 L36 80" fill="none" stroke="#E83050" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <path d="M69 75 L69 80 L64 80" fill="none" stroke="#E83050" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      {/* ⑦ Code lines — above beam (brighter) */}
      <rect x="43" y="38.5" width="14" height="2.6" rx="1.3" fill="rgba(255,255,255,0.62)" />
      <rect x="38" y="44.8" width="24" height="2.6" rx="1.3" fill="rgba(255,255,255,0.72)" />
      <rect x="41" y="51.1" width="18" height="2.6" rx="1.3" fill="rgba(255,255,255,0.66)" />
      {/* ⑧ Code lines — below beam (dimmer) */}
      <rect x="40" y="61.8" width="20" height="2.6" rx="1.3" fill="rgba(255,255,255,0.52)" />
      <rect x="37" y="68.1" width="26" height="2.6" rx="1.3" fill="rgba(255,255,255,0.46)" />
      <rect x="44" y="74.4" width="12" height="2.6" rx="1.3" fill="rgba(255,255,255,0.40)" />
      {/* ⑨ Scan beam — glow */}
      <line x1="29" y1="57" x2="71" y2="57" stroke="#FF3355" strokeWidth="3" opacity="0.45" filter="url(#tg-beam-glow)" />
      {/* ⑩ Scan beam — crisp */}
      <line x1="29" y1="57" x2="71" y2="57" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* ⑪ Scanner origin dot */}
      <circle cx="29" cy="57" r="2" fill="#FF6B82" />
    </svg>
  );
}

/** Emerald check-shield used to mark the "100% local" privacy guarantee. */
export function PrivacyShield({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-emerald"
    >
      <path
        d="M12 2.5 L20 5 V11 C20 16 16.5 19.5 12 21.5 C7.5 19.5 4 16 4 11 V5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 11.8 L11 14.2 L15.5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The "TrapGuard" wordmark — an all-ruby gradient (class `.tg-wordmark`, see
 * tailwind.css) with a white shimmer woven across some letters on dark, switching
 * to bright-ruby highlights on light (where white would vanish), plus a soft
 * crimson glow. Latin/LTR (brand name, never translated). `className` = size.
 */
export function Wordmark({ className = 'text-base' }: { className?: string }) {
  return (
    <span
      dir="ltr"
      className={`tg-wordmark bg-clip-text font-extrabold tracking-tight text-transparent [unicode-bidi:isolate] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] drop-shadow-[0_0_10px_rgba(224,48,76,0.5)] ${className}`}
    >
      TrapGuard
    </span>
  );
}

/** TrapGuard wordmark + shield, used in page headers. */
export function Logotype({ size = 28 }: { size?: number }) {
  return (
    <div className="flex flex-row items-center gap-2.5">
      <ShieldLogo size={size} />
      <Wordmark className="text-lg" />
    </div>
  );
}

/** A 36×20 pill toggle. Controlled; logical `start-*` so it slides correctly under RTL. */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
        on ? 'bg-emerald' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all duration-200 ${
          on ? 'start-[18px]' : 'start-0.5'
        }`}
      />
    </button>
  );
}
