import { Check } from 'lucide-react'
import {
  FitStamp,
  Highlight,
  NumberDisc,
  RoundStamp,
  SkillPips,
  StageMark,
  ToneDot,
  ToolTile,
  type StageMarkProps,
} from '#/components/kit'
import { toolList, tools } from '#/lib/tools/registry'
import { GallerySection, Group, Row, Specimen } from './gallery-parts'

const STAGES: Array<StageMarkProps['stage']> = ['saved', 'applied', 'interviewing', 'offer', 'closed']

export function TilesSection() {
  return (
    <GallerySection
      id="tiles"
      title="Tiles and stamps"
      note="Small marks that say which tool, which stage, how good a fit. Colour is assigned by meaning; every number is also text."
    >
      <Group title="ToolTile: one tone per tool (sm 28, md 40, lg 56 tilted, xl 120)">
        <Row>
          {toolList.map((tool) => (
            <ToolTile key={tool.id} tone={tool.tone} icon={tool.icon} size="md" />
          ))}
          {toolList.map((tool) => (
            <ToolTile key={`sm-${tool.id}`} tone={tool.tone} icon={tool.icon} size="sm" />
          ))}
        </Row>
        <Row top>
          <div style={{ padding: '6px 10px 10px 6px', display: 'flex', flexWrap: 'wrap', gap: 'var(--s6)', alignItems: 'center' }}>
            {toolList.slice(0, 3).map((tool) => (
              <ToolTile key={`lg-${tool.id}`} tone={tool.tone} icon={tool.icon} size="lg" />
            ))}
            <ToolTile tone={tools.portfolio.tone} icon={tools.portfolio.icon} size="xl" />
          </div>
        </Row>
      </Group>

      <Group title="StageMark: count (pipeline), dot, badge">
        <Row>
          {STAGES.map((stage, index) => (
            <StageMark key={stage} stage={stage} variant="count" count={index + 1} label={stage} />
          ))}
          <StageMark stage="applied" variant="count" count={128} label="applied, many" />
        </Row>
        <Row>
          {STAGES.map((stage) => (
            <StageMark key={stage} stage={stage} variant="dot" label={stage} />
          ))}
        </Row>
        <Row>
          {STAGES.map((stage) => (
            <StageMark key={stage} stage={stage} variant="badge" />
          ))}
        </Row>
      </Group>

      <Group title="NumberDisc: sm, md, lg; finished and current">
        <Row>
          <NumberDisc n={1} size="sm" />
          <NumberDisc n={2} />
          <NumberDisc n={3} size="lg" />
          <NumberDisc n={4} tone="mint" />
          <NumberDisc n={5} tone="lemon" />
        </Row>
        <Row>
          <Specimen label="finished: a node (mint check)">
            <NumberDisc n={<Check />} size="sm" tone="mint" />
          </Specimen>
          <Specimen label="current: dotted ring (lemon)">
            <div style={{ padding: 6 }}>
              <NumberDisc n={3} size="sm" tone="lemon" current />
            </div>
          </Specimen>
          <Specimen label="upcoming">
            <NumberDisc n={4} size="sm" />
          </Specimen>
        </Row>
      </Group>

      <Group title="ToneDot: the colour key before a label (sm 10, md 12)">
        <Row>
          {toolList.map((tool) => (
            <span key={tool.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <ToneDot tone={tool.tone} lead />
              {tool.shortLabel}
            </span>
          ))}
          <ToneDot tone="rose" size="md" />
        </Row>
      </Group>

      <Group title="FitStamp: 94 mint, 88, 73 lemon, 64 white, 100, no fit; small">
        <Row>
          {[94, 88, 73, 64, 100].map((value) => (
            <FitStamp key={value} value={value} />
          ))}
          <FitStamp value={null} />
          <FitStamp value={100} size="sm" />
          <FitStamp value={81} size="sm" />
          <FitStamp value={70} size="sm" />
          <FitStamp value={40} size="sm" />
        </Row>
      </Group>

      <Group title="SkillPips: 8 of 8, 5 of 7, 0 of 6, and 14 skills falls back to a bar">
        <Row>
          <Specimen label="8 of 8">
            <SkillPips matched={8} total={8} />
          </Specimen>
          <Specimen label="5 of 7">
            <SkillPips matched={5} total={7} />
          </Specimen>
          <Specimen label="0 of 6">
            <SkillPips matched={0} total={6} />
          </Specimen>
          <Specimen label="11 of 14">
            <SkillPips matched={11} total={14} />
          </Specimen>
        </Row>
      </Group>

      <Group title="RoundStamp: a rate above 0 is mint, 0 is stone">
        <Row>
          <div style={{ padding: 8 }}>
            <RoundStamp value={50} unit="%" label="Reply rate 50%" />
          </div>
          <div style={{ padding: 8 }}>
            <RoundStamp value={0} unit="%" label="Reply rate 0%" />
          </div>
          <div style={{ padding: 8 }}>
            <RoundStamp value="n/a" label="Reply rate not available" size={72} />
          </div>
        </Row>
      </Group>

      <Group title="Highlight">
        <p style={{ margin: 0, maxWidth: '30rem', fontSize: '1.1875rem', lineHeight: 1.5 }}>
          Built for <Highlight>CS graduates</Highlight> and <Highlight>career switchers</Highlight> who want to see what
          recruiters see.
        </p>
      </Group>
    </GallerySection>
  )
}
