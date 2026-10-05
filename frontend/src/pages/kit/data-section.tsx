import {
  Cluster,
  Panel,
  PanelBody,
  KeyValue,
  KeyValueRow,
  MetaRow,
  ScoreBar,
  Stat,
} from '#/components/kit'
import { DemoLink, GallerySection, Group, Specimen } from './gallery-parts'

const BREAKDOWN: Array<[string, number]> = [
  ['Keyword coverage', 92],
  ['Measurable impact', 64],
  ['Role alignment', 58],
  ['Formatting', 88],
  ['Seniority signals', 37],
  ['Education', 100],
  ['Links and contact', 24],
  ['Length', 71],
]

export function DataSection() {
  return (
    <GallerySection
      id="data"
      title="MetaRow, KeyValue, Stat, ScoreBar"
      note="Small data displays. Numbers are tabular everywhere; display type appears on Stat's number and ScoreBar's value."
    >
      <Group title="MetaRow: dot between items, never at a line start">
        <div className="kit-gallery__grid">
          <Specimen label="four items">
            <MetaRow>
              <strong>Northwind Labs</strong>
              <span>Remote, Europe</span>
              <span>3 days ago</span>
              <span>via Greenhouse</span>
            </MetaRow>
          </Specimen>
          <Specimen label="missing items (null, false, empty string): no double or trailing dots">
            <MetaRow>
              {null}
              <strong>Tidewater</strong>
              {false}
              {''}
              <span>Lisbon</span>
              {undefined}
            </MetaRow>
          </Specimen>
          <Specimen label="one item">
            <MetaRow>
              <span>Applied</span>
            </MetaRow>
          </Specimen>
          <Specimen label="all missing renders nothing (nothing between the brackets)">
            <p className="kit-gallery__paragraph">
              [<MetaRow>{[null, undefined, false, '']}</MetaRow>]
            </p>
          </Specimen>
          <Specimen label="wrapping at 14rem: a line never starts with a dot">
            <div className="kit-gallery__w-14">
              <MetaRow>
                <strong>Northwind Labs</strong>
                <span>Remote, Europe</span>
                <span>3 days ago</span>
                <span>via Greenhouse</span>
                <span>Full time</span>
              </MetaRow>
            </div>
          </Specimen>
          <Specimen label="wrapping at 20rem">
            <div className="kit-gallery__w-20">
              <MetaRow>
                <strong>Northwind Labs</strong>
                <span>Remote, Europe</span>
                <span>3 days ago</span>
                <span>via Greenhouse</span>
                <span>Full time</span>
              </MetaRow>
            </div>
          </Specimen>
          <Specimen label="long unbroken item at 14rem">
            <div className="kit-gallery__w-14">
              <MetaRow>
                <span>https://careers.northwind-labs.example.com/jobs/senior-backend-engineer-platform</span>
                <span>Remote</span>
              </MetaRow>
            </div>
          </Specimen>
          <Specimen label="right to left (dir=rtl)">
            <div dir="rtl">
              <MetaRow>
                <strong>شركة الأفق</strong>
                <span>الرياض</span>
                <span>قبل ٣ أيام</span>
                <span>عبر Lever</span>
              </MetaRow>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="KeyValue: 2px dividers, quiet labels, tabular values">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="inline, divided (default)">
            <KeyValue
              items={[
                { label: 'Stage', value: 'Interview' },
                { label: 'Applied', value: 'Sep 23, 2026' },
                { label: 'Salary', value: '€95,000 to €115,000' },
                { label: 'Contact', value: null },
                { label: 'Application id', value: 'app_01JBX7W2K3Q8R5T9', mono: true },
              ]}
            />
          </Specimen>
          <Specimen label="not divided (a report's Why it matters / Fix)">
            <KeyValue
              divided={false}
              labelWidth="7.5rem"
              items={[
                { label: 'Why it matters', value: 'Hiring managers skim for a number next to every claim.' },
                { label: 'Fix', value: 'Say how much faster, and over what period.' },
              ]}
            />
          </Specimen>
          <Specimen label="stacked (a narrow rail)">
            <div className="kit-gallery__w-14">
              <KeyValue
                layout="stacked"
                items={[
                  { label: 'Stage', value: 'Interview' },
                  { label: 'Applied', value: 'Sep 23, 2026' },
                  { label: 'Location', value: 'Remote, Europe (Central European Time, flexible)' },
                ]}
              />
            </div>
          </Specimen>
          <Specimen label="children form, long value wraps">
            <KeyValue>
              <KeyValueRow label="Source">
                <DemoLink>https://careers.northwind-labs.example.com/jobs/senior-backend-engineer-platform/apply</DemoLink>
              </KeyValueRow>
              <KeyValueRow label="Notes">Asked about on-call and the relocation package. Second round with the staff engineer on Thursday.</KeyValueRow>
              <KeyValueRow label="Referral">{''}</KeyValueRow>
            </KeyValue>
          </Specimen>
        </div>
      </Group>

      <Group title="Stat: display number, label under it">
        <Cluster gap={8} align="start">
          <Stat label="Skills fit" value={92} unit="%" delta="+6 since Sep 24" tone="success" />
          <Stat label="Applications" value={7} />
          <Stat label="Replies" value="2 of 9" delta="-1 this week" tone="danger" />
          <Stat label="Needs review" value={3} delta="2 new" tone="warning" />
          <Stat label="Median time to reply" value={4.5} unit="days" size="md" />
          <Stat label="Tokens" value="1,204,332" size="md" delta="steady" />
        </Cluster>
      </Group>

      <Group title="ScoreBar: 20px pill bar, ink by default, number always shown">
        <div className="kit-gallery__grid">
          <Specimen label="stacked, auto tone (92 / 58 / 23)">
            <div className="kit-gallery__stack">
              <ScoreBar label="Skills fit" value={92} valueLabel="92%" />
              <ScoreBar label="Skills fit" value={58} valueLabel="58%" />
              <ScoreBar label="Skills fit" value={23} valueLabel="23%" />
            </div>
          </Specimen>
          <Specimen label="forced tones and value labels">
            <div className="kit-gallery__stack">
              <ScoreBar label="Progress" value={60} tone="accent" valueLabel="3 of 5 steps" />
              <ScoreBar label="Neutral" value={45} tone="neutral" />
              <ScoreBar label="Ink (explicit)" value={70} tone="ink" />
              <ScoreBar label="Good (mint)" value={88} tone="success" />
              <ScoreBar label="Fair (lemon)" value={55} tone="warning" />
              <ScoreBar label="Problem (rose)" value={31} tone="danger" />
              <ScoreBar label="Low is quiet, not red (lowTone=neutral)" value={23} lowTone="neutral" />
              <ScoreBar label="Custom thresholds (good at 50)" value={55} thresholds={{ good: 50, fair: 20 }} />
            </div>
          </Specimen>
          <Specimen label="edges: 0, 100, over max, max 5">
            <div className="kit-gallery__stack">
              <ScoreBar label="Zero" value={0} />
              <ScoreBar label="Full" value={100} />
              <ScoreBar label="Over max is clamped" value={140} valueLabel="140" />
              <ScoreBar label="Out of five" value={4} max={5} valueLabel="4 / 5" />
            </div>
          </Specimen>
          <Specimen label="small, no label (aria-label only)">
            <div className="kit-gallery__stack kit-gallery__bounded">
              <ScoreBar aria-label="Skills fit" value={74} size="sm" />
              <ScoreBar aria-label="Skills fit" value={74} size="sm" layout="inline" valueLabel="74%" />
            </div>
          </Specimen>
          <Specimen label="inline, fixed number column (valueWidth): bars align down a list">
            <div className="kit-gallery__stack kit-gallery__bounded">
              <ScoreBar aria-label="Fit" value={100} size="sm" layout="inline" valueLabel="100% fit" valueWidth="3.5rem" />
              <ScoreBar aria-label="Fit" value={62} size="sm" layout="inline" valueLabel="62% fit" valueWidth="3.5rem" />
              <ScoreBar aria-label="Fit" value={8} size="sm" layout="inline" valueLabel="8% fit" valueWidth="3.5rem" />
            </div>
          </Specimen>
        </div>
        <Specimen label="Breakdown panel (parity with result.png): bars are ink, the two lowest are the tangerine highlight">
          <Panel>
            <PanelBody>
              <div className="kit-gallery__stack">
                {[
                  ['Keyword alignment', 75, true],
                  ['Impact evidence', 78, false],
                  ['Structure', 82, false],
                  ['Clarity', 76, false],
                  ['Completeness', 74, true],
                ].map(([label, value, low]) => (
                  <ScoreBar key={String(label)} layout="inline" label={label as string} value={value as number} tone={low ? 'accent' : 'ink'} />
                ))}
              </div>
            </PanelBody>
          </Panel>
        </Specimen>
        <Specimen label="Date stamp (Stat size=stamp)">
          <Stat size="stamp" label="in 5 days" value="Oct 9" />
        </Specimen>
        <Specimen label="inline, a score breakdown (8 rows)">
          <div className="kit-gallery__bounded kit-gallery__bounded--wide">
            <div className="kit-gallery__stack">
              {BREAKDOWN.map(([label, value]) => (
                <ScoreBar key={label} layout="inline" label={label} value={value} />
              ))}
            </div>
          </div>
        </Specimen>
      </Group>
    </GallerySection>
  )
}
