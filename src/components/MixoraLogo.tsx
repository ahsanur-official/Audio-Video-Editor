import { useId } from 'react';

interface MixoraLogoProps {
  className?: string;
  showGlow?: boolean;
}

/**
 * Full circular MIXORA brand emblem matching the official Mixora logo:
 * Neon magenta-to-cyan outer ring, deep cosmic indigo background,
 * folded 3D ribbon "M" with play icon & orbital swoosh, "Mixora" wordmark
 * with gradient X, "AUDIO • VIDEO • MASHUP STUDIO" subtitle, waveform bars,
 * and layered bottom sound waves. Always renders the complete uncropped circle.
 */
export function MixoraLogo({ className = 'w-12 h-12', showGlow = true }: MixoraLogoProps) {
  const uid = useId().replace(/:/g, '');
  const ringId = `mixora-ring-${uid}`;
  const bgId = `mixora-bg-${uid}`;
  const glowLeftId = `mixora-glow-l-${uid}`;
  const glowRightId = `mixora-glow-r-${uid}`;
  const clipId = `mixora-clip-${uid}`;
  const mLeftId = `mixora-m-left-${uid}`;
  const mLeftShadowId = `mixora-m-lsh-${uid}`;
  const mRightId = `mixora-m-right-${uid}`;
  const mBridgeId = `mixora-m-bridge-${uid}`;
  const orbitId = `mixora-orbit-${uid}`;
  const xGradId = `mixora-x-${uid}`;
  const eqGradId = `mixora-eq-${uid}`;
  const lineLeftId = `mixora-ll-${uid}`;
  const lineRightId = `mixora-lr-${uid}`;
  const wave1Id = `mixora-w1-${uid}`;
  const wave2Id = `mixora-w2-${uid}`;
  const wave3Id = `mixora-w3-${uid}`;

  return (
    <svg
      viewBox="0 0 512 512"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Mixora — Audio · Video · Mashup Studio Logo"
      className={`shrink-0 select-none overflow-visible ${
        showGlow ? 'drop-shadow-[0_0_14px_rgba(139,92,246,0.38)]' : ''
      } ${className}`}
    >
      <defs>
        {/* Outer Neon Ring Gradient */}
        <linearGradient id={ringId} x1="8%" y1="30%" x2="92%" y2="70%">
          <stop offset="0%" stopColor="#EC48FF" />
          <stop offset="28%" stopColor="#9333EA" />
          <stop offset="62%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#00EEFF" />
        </linearGradient>

        {/* Deep Midnight Cosmic Circle Fill */}
        <radialGradient id={bgId} cx="46%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#140C42" />
          <stop offset="55%" stopColor="#09072A" />
          <stop offset="100%" stopColor="#050824" />
        </radialGradient>

        <radialGradient id={glowLeftId} cx="20%" cy="28%" r="48%">
          <stop offset="0%" stopColor="#B829F7" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#B829F7" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={glowRightId} cx="80%" cy="40%" r="46%">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
        </radialGradient>

        {/* Inner Circle Clip */}
        <clipPath id={clipId}>
          <circle cx="256" cy="256" r="240" />
        </clipPath>

        {/* M Ribbon Gradients */}
        <linearGradient id={mLeftId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF5CF4" />
          <stop offset="45%" stopColor="#B83BFF" />
          <stop offset="100%" stopColor="#7C2AE8" />
        </linearGradient>

        <linearGradient id={mLeftShadowId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4C1D95" />
          <stop offset="100%" stopColor="#9333EA" />
        </linearGradient>

        <linearGradient id={mBridgeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C026D3" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>

        <linearGradient id={mRightId} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#22F3FF" />
          <stop offset="48%" stopColor="#00C4FF" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>

        {/* Orbital Swoosh Gradient */}
        <linearGradient id={orbitId} x1="0%" y1="85%" x2="100%" y2="15%">
          <stop offset="0%" stopColor="#FF6BF5" />
          <stop offset="35%" stopColor="#A855F7" />
          <stop offset="70%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#00F5FF" />
        </linearGradient>

        {/* Gradient for "x" in Mixora */}
        <linearGradient id={xGradId} x1="0%" y1="20%" x2="100%" y2="80%">
          <stop offset="0%" stopColor="#EC48FF" />
          <stop offset="48%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#00F0FF" />
        </linearGradient>

        {/* Equalizer Gradient */}
        <linearGradient id={eqGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D946EF" />
          <stop offset="50%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>

        <linearGradient id={lineLeftId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D946EF" stopOpacity="0" />
          <stop offset="100%" stopColor="#C084FC" stopOpacity="0.95" />
        </linearGradient>

        <linearGradient id={lineRightId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C084FC" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
        </linearGradient>

        {/* Bottom Translucent Wave Gradients */}
        <linearGradient id={wave1Id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C026D3" stopOpacity="0.52" />
          <stop offset="50%" stopColor="#4F46E5" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.52" />
        </linearGradient>

        <linearGradient id={wave2Id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7E22CE" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#2563EB" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.58" />
        </linearGradient>

        <linearGradient id={wave3Id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E879F9" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#60A5FA" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {/* Deep Circle Interior */}
      <g clipPath={`url(#${clipId})`}>
        <circle cx="256" cy="256" r="244" fill={`url(#${bgId})`} />
        <circle cx="256" cy="256" r="244" fill={`url(#${glowLeftId})`} />
        <circle cx="256" cy="256" r="244" fill={`url(#${glowRightId})`} />

        {/* Layered Bottom Sound Waves */}
        <path
          d="M 10 402 C 110 368, 195 452, 295 442 C 385 432, 435 394, 505 410 L 505 512 L 10 512 Z"
          fill={`url(#${wave1Id})`}
        />
        <path
          d="M 10 446 C 120 408, 200 472, 310 434 C 392 406, 446 426, 505 446 L 505 512 L 10 512 Z"
          fill={`url(#${wave2Id})`}
        />
        <path
          d="M 55 398 C 145 384, 215 448, 306 436 C 390 426, 435 402, 478 412"
          fill="none"
          stroke={`url(#${wave3Id})`}
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.78"
        />
        <path
          d="M 85 448 C 175 416, 250 470, 355 426 C 415 402, 452 418, 482 430"
          fill="none"
          stroke={`url(#${wave3Id})`}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Back Portion of Orbital Swoosh */}
        <path
          d="M 250 112 C 325 84, 386 96, 386 146 C 386 184, 352 214, 326 226"
          fill="none"
          stroke={`url(#${orbitId})`}
          strokeWidth="11"
          strokeLinecap="round"
          opacity="0.92"
        />

        {/* Folded 3D Ribbon "M" Emblem */}
        {/* Left Leg Base */}
        <path
          d="M 168 232 L 168 134 C 168 107, 197 95, 218 111 L 284 162 L 254 188 L 212 155 L 212 232 C 212 246, 202 256, 190 256 C 178 256, 168 246, 168 232 Z"
          fill={`url(#${mLeftId})`}
        />
        {/* Inner Left Fold Shading */}
        <path
          d="M 192 142 L 212 155 L 212 232 C 212 245, 202 254, 192 255 Z"
          fill={`url(#${mLeftShadowId})`}
          opacity="0.42"
        />

        {/* Center Crossing Ribbon Bridge */}
        <path
          d="M 218 111 L 284 162 C 296 171, 294 188, 279 194 L 254 188 L 194 142 C 185 135, 192 104, 218 111 Z"
          fill={`url(#${mBridgeId})`}
          opacity="0.88"
        />

        {/* Right Leg & Diagonal Upstroke */}
        <path
          d="M 250 176 L 308 132 C 326 118, 350 130, 350 154 L 350 232 C 350 246, 340 256, 328 256 C 316 256, 306 246, 306 232 L 306 178 L 270 205 C 258 214, 240 190, 250 176 Z"
          fill={`url(#${mRightId})`}
        />

        {/* Front Sweeping Orbital Swoosh */}
        <path
          d="M 176 168 C 126 202, 114 238, 140 254 C 166 270, 232 254, 298 218"
          fill="none"
          stroke={`url(#${orbitId})`}
          strokeWidth="8.5"
          strokeLinecap="round"
        />

        {/* Crisp White Rounded Play Triangle inside M */}
        <path
          d="M 235 186 C 235 180, 241 177, 246 180 L 274 198 C 278 201, 278 207, 274 210 L 246 228 C 241 231, 235 228, 235 222 Z"
          fill="#FFFFFF"
        />

        {/* "Mixora" Bold Wordmark with Gradient X */}
        <text
          x="256"
          y="334"
          textAnchor="middle"
          fontFamily="'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif"
          fontSize="94"
          fontWeight="800"
          letterSpacing="-1.5"
        >
          <tspan fill="#FFFFFF">Mi</tspan>
          <tspan fill={`url(#${xGradId})`}>x</tspan>
          <tspan fill="#FFFFFF">ora</tspan>
        </text>

        {/* Subtitle: AUDIO • VIDEO • MASHUP STUDIO */}
        <text
          x="256"
          y="366"
          textAnchor="middle"
          fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
          fontSize="16.5"
          fontWeight="600"
          letterSpacing="3.4"
          fill="#F8FAFC"
        >
          <tspan>AUDIO </tspan>
          <tspan fill="#D946EF">•</tspan>
          <tspan> VIDEO </tspan>
          <tspan fill="#A855F7">•</tspan>
          <tspan> MASHUP STUDIO</tspan>
        </text>

        {/* Center Audio Waveform Equalizer + Side Hairlines */}
        <line
          x1="138"
          y1="400"
          x2="206"
          y2="400"
          stroke={`url(#${lineLeftId})`}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="306"
          y1="400"
          x2="374"
          y2="400"
          stroke={`url(#${lineRightId})`}
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        <g fill={`url(#${eqGradId})`}>
          <rect x="214" y="395" width="5" height="10" rx="2.5" />
          <rect x="223" y="391" width="5" height="18" rx="2.5" />
          <rect x="232" y="386" width="5" height="28" rx="2.5" />
          <rect x="241" y="391" width="5" height="18" rx="2.5" />
          <rect x="253" y="379" width="6" height="42" rx="3" />
          <rect x="266" y="391" width="5" height="18" rx="2.5" />
          <rect x="275" y="386" width="5" height="28" rx="2.5" />
          <rect x="284" y="391" width="5" height="18" rx="2.5" />
          <rect x="293" y="395" width="5" height="10" rx="2.5" />
        </g>
      </g>

      {/* Outer Neon Gradient Circle Border */}
      <circle
        cx="256"
        cy="256"
        r="244"
        fill="none"
        stroke={`url(#${ringId})`}
        strokeWidth="12"
      />
    </svg>
  );
}
