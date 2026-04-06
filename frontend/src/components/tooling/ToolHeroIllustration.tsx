import type { ToolId } from '#/lib/tools/registry'

/* ── Unified blue palette ──────────────────────────────────────────────── */
const WRAP_STYLE: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: 22,
  background: 'linear-gradient(135deg, #dbeafe, #eff6ff)',
  border: '1px solid rgba(147,197,253,0.5)',
  boxShadow: '0 4px 18px rgba(37,99,235,0.14)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
  flexShrink: 0,
}

/* ── Keyframe definitions (injected once) ─────────────────────────────── */
const KEYFRAMES = `
@keyframes illust-scan {
  0%,100% { top: 10%; opacity: 0.5; }
  50%      { top: 82%; opacity: 1;   }
}
@keyframes illust-breathe {
  0%,100% { transform: scale(1);    opacity: 0.55; }
  50%     { transform: scale(1.09); opacity: 0.85; }
}
@keyframes illust-bar-grow {
  from { transform: scaleY(0); opacity: 0; }
  to   { transform: scaleY(1); opacity: 1; }
}
@keyframes illust-cursor-blink {
  0%,49% { opacity: 1; }
  50%,100% { opacity: 0; }
}
@keyframes illust-bob {
  0%,100% { transform: translateY(0);   }
  50%     { transform: translateY(-4px); }
}
@keyframes illust-pulse-tile {
  0%,100% { opacity: 0.55; }
  50%     { opacity: 1;    }
}
`

/* ── Per-tool illustration content ───────────────────────────────────────
   All colours come from the unified blue palette only.
   Each returns a React.ReactNode rendered inside the 88×88 wrapper.
─────────────────────────────────────────────────────────────────────────── */

function ResumeIllust() {
  return (
    /* Document + scan beam + doc-lines */
    <div style={{ position: 'relative', width: 44, height: 54 }}>
      {/* doc body */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: 6,
        background: '#ffffff',
        border: '1.5px solid rgba(147,197,253,0.6)',
      }} />
      {/* doc lines */}
      {[14, 22, 30, 38].map((top, i) => (
        <div key={i} style={{
          position: 'absolute', left: 7, right: 7, top,
          height: 3, borderRadius: 2,
          background: 'rgba(37,99,235,0.22)',
          width: i === 0 ? '55%' : undefined,
        }} />
      ))}
      {/* scan beam */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 3,
        background: 'rgba(37,99,235,0.65)',
        boxShadow: '0 0 10px rgba(37,99,235,0.4)',
        borderRadius: 2,
        animation: 'illust-scan 2.6s ease-in-out infinite',
      }} />
    </div>
  )
}

function JobMatchIllust() {
  const circleBase: React.CSSProperties = {
    position: 'absolute',
    width: 42, height: 42,
    borderRadius: '50%',
    border: '2px solid rgba(37,99,235,0.45)',
    background: 'rgba(219,234,254,0.5)',
  }
  return (
    <div style={{ position: 'relative', width: 64, height: 42 }}>
      <div style={{
        ...circleBase, left: 0,
        animation: 'illust-breathe 3s ease-in-out infinite',
      }} />
      <div style={{
        ...circleBase, right: 0,
        animation: 'illust-breathe 3s ease-in-out infinite 0.6s',
      }} />
    </div>
  )
}

function CareerIllust() {
  /* 4 vertical bars growing from bottom, staggered */
  const heights = [26, 38, 32, 44]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 52 }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: 12, height: h, borderRadius: '3px 3px 0 0',
          background: i === 3 ? 'rgba(37,99,235,0.45)' : 'rgba(37,99,235,0.22)',
          transformOrigin: 'bottom center',
          animation: `illust-bar-grow 0.7s ease-out both ${i * 0.12}s`,
        }} />
      ))}
    </div>
  )
}

function CoverLetterIllust() {
  return (
    <div style={{ position: 'relative', width: 46, height: 56 }}>
      {/* doc body */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: 6,
        background: '#ffffff',
        border: '1.5px solid rgba(147,197,253,0.6)',
      }} />
      {/* text lines */}
      {[12, 20, 28, 36].map((top, i) => (
        <div key={i} style={{
          position: 'absolute', left: 8, top,
          height: 3, borderRadius: 2,
          background: 'rgba(37,99,235,0.22)',
          width: i === 3 ? '30%' : '68%',
        }} />
      ))}
      {/* blinking cursor */}
      <div style={{
        position: 'absolute',
        left: 8 + Math.round(0.3 * 30),   /* end of last partial line */
        top: 36,
        width: 2, height: 12,
        borderRadius: 1,
        background: '#1d4ed8',
        animation: 'illust-cursor-blink 1s step-end infinite',
      }} />
    </div>
  )
}

function InterviewIllust() {
  /* Two speech bubbles — "them" (top-left) and "me" (bottom-right) */
  const bubbleBase: React.CSSProperties = {
    position: 'absolute',
    borderRadius: 10,
    padding: '5px 8px',
  }
  return (
    <div style={{ position: 'relative', width: 64, height: 52 }}>
      {/* them */}
      <div style={{
        ...bubbleBase, top: 0, left: 0,
        width: 38, height: 20,
        background: 'rgba(37,99,235,0.18)',
        border: '1px solid rgba(147,197,253,0.5)',
        animation: 'illust-bob 2.4s ease-in-out infinite',
      }} />
      {/* me */}
      <div style={{
        ...bubbleBase, bottom: 0, right: 0,
        width: 38, height: 20,
        background: 'rgba(37,99,235,0.45)',
        border: '1px solid rgba(147,197,253,0.6)',
        animation: 'illust-bob 2.4s ease-in-out infinite 0.7s',
      }} />
    </div>
  )
}

function PortfolioIllust() {
  /* 2×3 tile grid with alternating fills */
  const tiles: { x: number; y: number; w: number; h: number; alt: boolean }[] = [
    { x: 0,  y: 0,  w: 28, h: 22, alt: false },
    { x: 32, y: 0,  w: 22, h: 22, alt: true  },
    { x: 0,  y: 26, w: 22, h: 18, alt: true  },
    { x: 26, y: 26, w: 28, h: 18, alt: false },
  ]
  return (
    <div style={{ position: 'relative', width: 56, height: 48 }}>
      {tiles.map((t, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: t.x, top: t.y, width: t.w, height: t.h,
          borderRadius: 5,
          background: t.alt ? '#dbeafe' : 'rgba(37,99,235,0.22)',
          border: '1px solid rgba(147,197,253,0.4)',
          animation: `illust-pulse-tile 2.5s ease-in-out infinite ${i * 0.3}s`,
        }} />
      ))}
    </div>
  )
}

/* ── Map ─────────────────────────────────────────────────────────────────── */
const illustrations: Record<ToolId, () => React.ReactNode> = {
  resume:         () => <ResumeIllust />,
  'job-match':    () => <JobMatchIllust />,
  career:         () => <CareerIllust />,
  'cover-letter': () => <CoverLetterIllust />,
  interview:      () => <InterviewIllust />,
  portfolio:      () => <PortfolioIllust />,
}

/* ── Component ───────────────────────────────────────────────────────────── */

let keyframesInjected = false

export function ToolHeroIllustration({
  toolId,
  loading = false,
}: {
  toolId: ToolId
  /** accent is no longer used (unified blue palette) but kept for API compat */
  accent?: string
  loading?: boolean
}) {
  /* Inject keyframes once into <head> */
  if (typeof document !== 'undefined' && !keyframesInjected) {
    keyframesInjected = true
    const style = document.createElement('style')
    style.dataset['illustKeyframes'] = '1'
    style.textContent = KEYFRAMES
    document.head.appendChild(style)
  }

  const Illustration = illustrations[toolId]
  if (!Illustration) return null

  return (
    <div
      className="tool-illust-wrap"
      style={{
        ...WRAP_STYLE,
        /* slightly faster scan when loading */
        ...(loading ? { '--illust-speed': '0.6' } as React.CSSProperties : {}),
      }}
    >
      <Illustration />
    </div>
  )
}
