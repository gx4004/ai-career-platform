import { useId } from 'react'
import type { CSSProperties } from 'react'

type WorkbenchArtVariant = 'hero' | 'dashboard' | 'tool' | 'auth' | 'empty'

type WorkbenchArtProps = {
  accent?: string
  className?: string
  variant?: WorkbenchArtVariant
}

function GlassCard({
  x,
  y,
  width,
  height,
  radius,
}: {
  x: number
  y: number
  width: number
  height: number
  radius: number
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={radius}
      fill="rgba(8, 25, 18, 0.92)"
      stroke="rgba(105, 238, 177, 0.12)"
    />
  )
}

export function WorkbenchArt({
  accent = 'var(--accent)',
  className,
  variant = 'tool',
}: WorkbenchArtProps) {
  const id = useId().replace(/:/g, '')
  const gradientId = `cw-gradient-${id}`
  const glowId = `cw-glow-${id}`
  const grainId = `cw-grain-${id}`

  const shell = (
    <>
      <rect x="18" y="18" width="444" height="284" rx="34" fill="rgba(7, 22, 17, 0.82)" stroke="rgba(61, 220, 151, 0.16)" />
      <rect x="18" y="18" width="444" height="38" rx="34" fill="rgba(16, 44, 32, 0.94)" />
      <circle cx="44" cy="37" r="4" fill="rgba(236, 255, 244, 0.34)" />
      <circle cx="60" cy="37" r="4" fill="rgba(236, 255, 244, 0.2)" />
      <circle cx="76" cy="37" r="4" fill="rgba(236, 255, 244, 0.12)" />
      <rect x="358" y="29" width="76" height="14" rx="7" fill="rgba(236, 255, 244, 0.08)" />
      <path d="M42 92H438" stroke="rgba(138, 245, 193, 0.06)" />
      <path d="M42 140H438" stroke="rgba(138, 245, 193, 0.06)" />
      <path d="M42 188H438" stroke="rgba(138, 245, 193, 0.06)" />
      <path d="M42 236H438" stroke="rgba(138, 245, 193, 0.06)" />
      <path d="M112 72V280" stroke="rgba(138, 245, 193, 0.05)" />
      <path d="M192 72V280" stroke="rgba(138, 245, 193, 0.05)" />
      <path d="M272 72V280" stroke="rgba(138, 245, 193, 0.05)" />
      <path d="M352 72V280" stroke="rgba(138, 245, 193, 0.05)" />
    </>
  )

  const heroArt = (
    <>
      <GlassCard x={48} y={86} width={174} height={172} radius={28} />
      <GlassCard x={246} y={76} width={162} height={120} radius={28} />
      <GlassCard x={246} y={210} width={162} height={54} radius={22} />
      <rect x="74" y="112" width="96" height="14" rx="7" fill="rgba(240, 255, 247, 0.18)" />
      <rect x="74" y="138" width="122" height="10" rx="5" fill="rgba(240, 255, 247, 0.1)" />
      <rect x="74" y="158" width="112" height="10" rx="5" fill="rgba(240, 255, 247, 0.1)" />
      <rect x="74" y="190" width="106" height="44" rx="16" fill="rgba(78, 235, 167, 0.08)" stroke="rgba(78, 235, 167, 0.18)" />
      <rect x="92" y="206" width="62" height="9" rx="4.5" fill="rgba(240, 255, 247, 0.14)" />
      <circle cx="327" cy="136" r="38" fill={`url(#${gradientId})`} />
      <circle cx="327" cy="136" r="58" fill={`url(#${gradientId})`} opacity="0.14" filter={`url(#${glowId})`} />
      <path d="M311 137L323 149L347 121" stroke="rgba(4, 19, 12, 0.92)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M148 238C198 190 248 168 300 164C334 162 366 170 392 184" stroke={`url(#${gradientId})`} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="148" cy="238" r="7" fill="var(--art-accent)" />
      <circle cx="302" cy="164" r="7" fill="#4BF0A8" />
      <circle cx="392" cy="184" r="7" fill="#A3E560" />
      <rect x="268" y="224" width="48" height="26" rx="12" fill="rgba(78, 235, 167, 0.1)" stroke="rgba(78, 235, 167, 0.18)" />
      <rect x="326" y="224" width="58" height="26" rx="12" fill="rgba(163, 229, 96, 0.1)" stroke="rgba(163, 229, 96, 0.18)" />
    </>
  )

  const dashboardArt = (
    <>
      <GlassCard x={48} y={82} width={124} height={180} radius={26} />
      <GlassCard x={188} y={82} width={222} height={86} radius={26} />
      <GlassCard x={188} y={182} width={222} height={80} radius={26} />
      <rect x="70" y="108" width="66" height="12" rx="6" fill="rgba(240, 255, 247, 0.16)" />
      <rect x="70" y="138" width="82" height="9" rx="4.5" fill="rgba(240, 255, 247, 0.1)" />
      <rect x="70" y="162" width="70" height="9" rx="4.5" fill="rgba(240, 255, 247, 0.1)" />
      <rect x="70" y="194" width="72" height="46" rx="16" fill="rgba(78, 235, 167, 0.08)" stroke="rgba(78, 235, 167, 0.18)" />
      <path d="M212 140L244 124L274 138L314 112L356 134L388 118" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {[212, 244, 274, 314, 356, 388].map((x, index) => (
        <circle key={x} cx={x} cy={[140, 124, 138, 112, 134, 118][index]} r="6" fill={index === 5 ? '#A3E560' : 'var(--art-accent)'} />
      ))}
      {[0, 1, 2, 3].map((item) => (
        <g key={item}>
          <circle cx={74 + item * 48} cy="222" r="16" fill="rgba(78, 235, 167, 0.08)" stroke="rgba(78, 235, 167, 0.18)" />
          {item < 3 ? <path d={`M90 ${222}h20`} stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" /> : null}
        </g>
      ))}
      <rect x="216" y="204" width="68" height="12" rx="6" fill="rgba(240, 255, 247, 0.14)" />
      <rect x="216" y="228" width="94" height="10" rx="5" fill="rgba(240, 255, 247, 0.1)" />
    </>
  )

  const toolArt = (
    <>
      <GlassCard x={46} y={82} width={194} height={182} radius={28} />
      <GlassCard x={258} y={82} width={156} height={82} radius={24} />
      <GlassCard x={258} y={182} width={156} height={82} radius={24} />
      <rect x="70" y="108" width="100" height="14" rx="7" fill="rgba(240, 255, 247, 0.16)" />
      {[138, 158, 178, 198].map((y, index) => (
        <rect key={y} x="70" y={y} width={124 - index * 8} height="9" rx="4.5" fill="rgba(240, 255, 247, 0.1)" />
      ))}
      <circle cx="294" cy="122" r="18" fill={`url(#${gradientId})`} />
      <circle cx="294" cy="122" r="30" fill={`url(#${gradientId})`} opacity="0.12" filter={`url(#${glowId})`} />
      <rect x="324" y="108" width="54" height="10" rx="5" fill="rgba(240, 255, 247, 0.16)" />
      <rect x="324" y="128" width="42" height="10" rx="5" fill="rgba(240, 255, 247, 0.1)" />
      <path d="M96 234C138 198 196 174 258 174" stroke={`url(#${gradientId})`} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="258" cy="174" r="7" fill="var(--art-accent)" />
      <rect x="280" y="206" width="48" height="34" rx="14" fill="rgba(78, 235, 167, 0.1)" stroke="rgba(78, 235, 167, 0.18)" />
      <rect x="340" y="206" width="52" height="34" rx="14" fill="rgba(163, 229, 96, 0.1)" stroke="rgba(163, 229, 96, 0.18)" />
    </>
  )

  const authArt = (
    <>
      {[
        [52, 86, '#4BF0A8'],
        [206, 86, '#22CDA2'],
        [360, 86, '#A3E560'],
        [52, 192, '#17B7A5'],
        [206, 192, '#4FE3A9'],
        [360, 192, '#85CC17'],
      ].map(([x, y, fill]) => (
        <g key={`${x}-${y}`}>
          <GlassCard x={Number(x)} y={Number(y)} width={72} height={72} radius={20} />
          <circle cx={Number(x) + 36} cy={Number(y) + 25} r="12" fill={String(fill)} fillOpacity="0.86" />
          <rect x={Number(x) + 17} y={Number(y) + 47} width="38" height="8" rx="4" fill="rgba(240, 255, 247, 0.12)" />
        </g>
      ))}
      <circle cx="240" cy="160" r="54" fill="rgba(8, 24, 18, 0.94)" stroke="rgba(105, 238, 177, 0.14)" />
      <circle cx="240" cy="160" r="30" fill={`url(#${gradientId})`} />
      <circle cx="240" cy="160" r="46" fill={`url(#${gradientId})`} opacity="0.14" filter={`url(#${glowId})`} />
      <path d="M228 160L238 170L256 150" stroke="rgba(4, 19, 12, 0.9)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )

  const emptyArt = (
    <>
      <GlassCard x={126} y={92} width={228} height={148} radius={30} />
      <rect x="160" y="126" width="154" height="12" rx="6" fill="rgba(240, 255, 247, 0.14)" />
      <rect x="160" y="154" width="112" height="10" rx="5" fill="rgba(240, 255, 247, 0.1)" />
      <rect x="172" y="190" width="122" height="14" rx="7" fill="rgba(78, 235, 167, 0.16)" />
      <circle cx="116" cy="122" r="10" fill="rgba(23, 183, 165, 0.68)" />
      <circle cx="366" cy="114" r="8" fill="rgba(163, 229, 96, 0.72)" />
      <path d="M84 220C104 220 104 244 124 244C144 244 144 220 164 220" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" />
      <path d="M320 246C334 246 334 264 348 264C362 264 362 246 376 246" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" />
      <circle cx="240" cy="166" r="24" fill={`url(#${gradientId})`} opacity="0.92" />
      <circle cx="240" cy="166" r="38" fill={`url(#${gradientId})`} opacity="0.12" filter={`url(#${glowId})`} />
      <path d="M230 166L236 172L248 158" stroke="rgba(4, 19, 12, 0.92)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )

  const art =
    variant === 'hero'
      ? heroArt
      : variant === 'dashboard'
        ? dashboardArt
        : variant === 'auth'
          ? authArt
          : variant === 'empty'
            ? emptyArt
            : toolArt

  return (
    <svg
      viewBox="0 0 480 320"
      fill="none"
      className={className}
      style={{ ['--art-accent' as string]: accent } as CSSProperties}
    >
      <defs>
        <linearGradient id={gradientId} x1="54" x2="418" y1="28" y2="284">
          <stop offset="0%" stopColor="var(--art-accent)" stopOpacity="0.96" />
          <stop offset="52%" stopColor="#35DA9E" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#A3E560" stopOpacity="0.88" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.06" />
          </feComponentTransfer>
        </filter>
      </defs>
      {shell}
      {art}
      <rect x="18" y="18" width="444" height="284" rx="34" fill="#FFFFFF" filter={`url(#${grainId})`} opacity="0.09" />
    </svg>
  )
}
