import { useState } from 'react'
import { Button, ScoreSeal } from '#/components/kit'
import { GallerySection, Group, Row, Specimen } from './gallery-parts'

function StampDemo() {
  const [run, setRun] = useState(0)
  return (
    <div style={{ display: 'grid', gap: 'var(--s4)', justifyItems: 'start' }}>
      <Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>
        Replay the stamp
      </Button>
      <div style={{ padding: 'var(--s4) var(--s5) var(--s5) var(--s3)' }}>
        <ScoreSeal key={run} value={77} label="Resume score (reveal)" reveal="stamp" size={220} />
      </div>
    </div>
  )
}

export function SealSection() {
  return (
    <GallerySection
      id="seal"
      title="ScoreSeal"
      note="The score stamp: 18 scalloped lobes, a hard shadow, a dotted ring, tilted -4 degrees. The number counts up when the result has just arrived; every other time it is simply there."
    >
      <Group title="Resume score 77 at 300 (the result hero)">
        <div style={{ padding: 'var(--s2) var(--s4) var(--s4) var(--s2)' }}>
          <ScoreSeal value={77} label="Resume score (hero)" />
        </div>
      </Group>

      <Group title="Sizes: sm 170 (landing example), md 220 (phones, 404), lg 230 (closer)">
        <Row top>
          <Specimen label="sm, tangerine">
            <ScoreSeal value={84} label="Example score sm" size="sm" />
          </Specimen>
          <Specimen label="md, tangerine">
            <ScoreSeal value={77} label="Example score md" size="md" />
          </Specimen>
          <Specimen label="lg, lemon">
            <ScoreSeal value={84} label="Example score lg" size="lg" tone="lemon" />
          </Specimen>
        </Row>
      </Group>

      <Group title="Small: 132 (the landing closer on phones). The /100 holds the 12px text floor instead of shrinking to 9.9px">
        <Row top>
          <ScoreSeal value={84} label="Example score 132" size={132} tone="lemon" />
        </Row>
      </Group>

      <Group title="Tones and text values: mint, lilac, stone, three digits, 404 (lemon, no unit), a bang">
        <Row top>
          <ScoreSeal value={92} label="Mint score" size="sm" tone="mint" />
          <ScoreSeal value={61} label="Lilac score" size="sm" tone="lilac" unit="%" />
          <ScoreSeal value={100} label="Perfect score" size="sm" />
          <ScoreSeal value="404" label="Error 404" size="sm" tone="lemon" unit={null} />
          <ScoreSeal value="!" label="Something went wrong" size="sm" tone="stone" unit={null} />
          <ScoreSeal value={null} label="Missing score" size="sm" />
        </Row>
      </Group>

      <Group title="Rose tone and words longer than four characters: one size tier per character (Applied, Facts, Offer)">
        <Row top>
          <ScoreSeal value={3} label="Days left" size="sm" tone="rose" unit="days" />
          <ScoreSeal value="✓" label="Application status" size="sm" tone="lilac" unit="Applied" />
          <ScoreSeal value="Offer" label="Stage" size="sm" tone="mint" unit={null} />
          <ScoreSeal value="Hired" label="Outcome" size="sm" tone="rose" unit={null} />
          <ScoreSeal value="Applied" label="Status word" size="sm" tone="lilac" unit={null} />
          <ScoreSeal value="Interview" label="Status long word" size="sm" tone="tangerine" unit={null} />
        </Row>
      </Group>

      <Group title="Reveal: stamp in, count up (plays on mount; reduced motion shows the final state)">
        <StampDemo />
      </Group>
    </GallerySection>
  )
}
