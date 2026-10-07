import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Highlight, Sticker, StretchedLink, TONES, type Tone } from '#/components/kit'
import { GallerySection, Group, Row } from './gallery-parts'

const ROOM = { padding: '8px 10px 14px 6px' } as const

/** Plates and shadows hang a few pixels outside the box: give every specimen row room. */
function Room({ children }: { children: ReactNode }) {
  return <div style={ROOM}>{children}</div>
}

function SlapDemo() {
  const [run, setRun] = useState(0)
  return (
    <div style={{ display: 'grid', gap: 'var(--s4)', justifyItems: 'start' }}>
      <Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>
        Replay the slap
      </Button>
      <div key={run} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 'var(--s6)', ...ROOM }}>
        <Sticker tone="lemon" tilt={-2} reveal="slap" revealOrder={1} style={{ inlineSize: '12rem' }}>
          <strong>Prove Python</strong>
          <p>Slaps in first, lands level.</p>
        </Sticker>
        <Sticker tone="lemon" tilt={1.6} reveal="slap" revealOrder={2} style={{ inlineSize: '12rem' }}>
          <strong>Quantify two bullets</strong>
          <p>Slaps in second.</p>
        </Sticker>
        <Sticker as="span" size="sm" tone="mint" tilt={-3} reveal="slap" revealOrder={3}>
          Strong foundation
        </Sticker>
      </div>
    </div>
  )
}

export function StickerSection() {
  return (
    <GallerySection
      id="sticker"
      title="Sticker"
      note="An object drawn as a sticker: tone fill, 2px ink outline, one hard shadow. The plate tilts; the text never does. Tilt is clamped to 3 degrees."
    >
      <Group title="Tones (md, level)">
        <Row top>
          {TONES.map((tone: Tone) => (
            <Room key={tone}>
              <Sticker tone={tone} style={{ inlineSize: '9rem' }}>
                <strong>{tone}</strong>
                <p>Ink text on every tone</p>
              </Sticker>
            </Room>
          ))}
        </Row>
      </Group>

      <Group title="Sizes: sm (shadow 2), md (shadow 4), xl (shadow 7)">
        <Row top>
          <Room>
            <Sticker as="span" size="sm" tone="mint" tilt={-3}>
              Strong foundation
            </Sticker>
          </Room>
          <Room>
            <Sticker as="span" size="sm" tone="white" tilt={2.5}>
              <strong>2</strong> issues
            </Sticker>
          </Room>
          <Room>
            <Sticker tone="tangerine" tilt={-0.6} style={{ inlineSize: '14rem' }}>
              <strong>Interviewing</strong>
              <p>Prepare for the next round</p>
            </Sticker>
          </Room>
          <Room>
            <Sticker size="xl" tone="lilac" tilt={-1.4} style={{ inlineSize: '16rem' }}>
              <strong>Build</strong>
              <p>The big one: landing steps</p>
            </Sticker>
          </Room>
        </Row>
      </Group>

      <Group title="Tilt: -3, -2, 0, 1.6, 3 (a 12 requests 3: clamped)">
        <Row top>
          {[-3, -2, 0, 1.6, 3, 12].map((tilt) => (
            <Room key={tilt}>
              <Sticker tone="lemon" tilt={tilt} data-testid={`tilt-${tilt}`} style={{ inlineSize: '7.5rem' }}>
                <strong>{tilt}deg</strong>
              </Sticker>
            </Room>
          ))}
        </Row>
      </Group>

      <Group title="Levelled by layout: --kit-tilt-scale: 0 on a container (stacked, full-width stickers)">
        <Row top>
          <Room>
            <div style={{ '--kit-tilt-scale': 0 } as CSSProperties} data-testid="tilt-scale-0">
              <Sticker tone="lemon" tilt={-2} style={{ inlineSize: '16rem' }}>
                <strong>Asked for -2deg</strong>
                <p>The container levels it: a full-width plate would dip at the far edge.</p>
              </Sticker>
            </div>
          </Room>
        </Row>
      </Group>

      <Group title="Pin (the honest note) and a long, unbroken title">
        <Row top>
          <Room>
            <div style={{ paddingBlockStart: 14 }}>
              <Sticker pin tilt={1.2} tone="white" style={{ inlineSize: '16rem' }}>
                <strong>A thesis project in public beta</strong>
                <p>
                  Built for <Highlight>CS graduates</Highlight> and <Highlight>career switchers</Highlight>.
                </p>
              </Sticker>
            </div>
          </Room>
          <Room>
            <Sticker tone="rose" tilt={0.6} style={{ inlineSize: '14rem' }}>
              <strong style={{ overflowWrap: 'anywhere' }}>
                Senior Principal Staff Backend Platform Infrastructure Reliability Engineering Manager Supercalifragilistic
              </strong>
            </Sticker>
          </Room>
        </Row>
      </Group>

      <Group title="Whole-sticker link (Tab to it: the focus ring sits inside the fill, clear of the outline)">
        <Row top>
          <Room>
            <Sticker tone="tangerine" tilt={-0.6} style={{ inlineSize: '14rem' }} data-testid="sticker-link-md">
              <StretchedLink href="#sticker">
                <strong>Interviewing</strong>
              </StretchedLink>
              <p>Prepare for the next round</p>
            </Sticker>
          </Room>
          <Room>
            <Sticker size="sm" tone="lilac" style={{ inlineSize: '10rem' }} data-testid="sticker-link-sm">
              <StretchedLink href="#sticker">CV Studio</StretchedLink>
            </Sticker>
          </Room>
        </Row>
      </Group>

      <Group title="Reveal: the slap (plays on mount; reduced motion shows the final state)">
        <SlapDemo />
      </Group>
    </GallerySection>
  )
}
