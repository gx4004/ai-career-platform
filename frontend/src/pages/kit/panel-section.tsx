import { Badge, Button, List, Notice, Panel, PanelBody, PanelFooter, PanelHeader, RoundStamp, Row, RowBody, RowMeta, RowTitle, StageMark } from '#/components/kit'
import { GallerySection, Group, Grid } from './gallery-parts'

const PIPELINE: Array<{ stage: 'saved' | 'applied' | 'interviewing' | 'offer' | 'closed'; name: string; count: number }> = [
  { stage: 'saved', name: 'Saved', count: 2 },
  { stage: 'applied', name: 'Applied', count: 1 },
  { stage: 'interviewing', name: 'Interviewing', count: 1 },
  { stage: 'offer', name: 'Offer', count: 1 },
  { stage: 'closed', name: 'Closed', count: 1 },
]

export function PanelSection() {
  return (
    <GallerySection
      id="panel"
      title="Panel"
      note="A flat white container with a 2px ink outline and no shadow: lists, forms and grouped facts. Stickers are for objects; panels are for content."
    >
      <Grid wide>
        <Group title="Header, body, actions">
          <Panel>
            <PanelHeader title="What you're sending" count={3} countTone="lemon" actions={<Button size="sm" variant="secondary">Edit</Button>} />
            <PanelBody>
              <p style={{ margin: 0 }}>Three documents go out with this application. Check each before you apply.</p>
            </PanelBody>
          </Panel>
        </Group>

        <Group title="Flush list with a tone footer (the pipeline)">
          <Panel flush>
            <PanelHeader title="Pipeline" headingLevel={3} />
            <List framed={false} aria-label="Pipeline">
              {PIPELINE.map((entry) => (
                <Row key={entry.stage} density="compact">
                  <StageMark stage={entry.stage} variant="count" count={entry.count} label={entry.name} />
                  <RowBody>
                    <RowTitle>{entry.name}</RowTitle>
                  </RowBody>
                </Row>
              ))}
            </List>
            <PanelFooter tone="mint">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s4)' }}>
                <strong>Reply rate</strong>
                <RoundStamp value={50} unit="%" label="Reply rate 50%" />
              </div>
            </PanelFooter>
          </Panel>
        </Group>

        <Group title="Tones: stone (nested import card), lilac (practice mode)">
          <Panel tone="stone">
            <PanelBody>
              <strong>Import from a link</strong>
              <p style={{ margin: '4px 0 0' }}>A nested panel in the stone tint.</p>
            </PanelBody>
          </Panel>
          <Panel tone="lilac">
            <PanelHeader title="Practice mode" />
            <PanelBody>
              <p style={{ margin: 0 }}>A tinted panel keeps the outline; only the fill changes.</p>
            </PanelBody>
          </Panel>
        </Group>

        <Group title="Inside a panel: notice, badge, long title">
          <Panel as="section">
            <PanelHeader title="Senior Principal Staff Backend Platform Infrastructure Reliability Engineer, Supercalifragilistic" headingLevel={3} />
            <PanelBody>
              <Notice>One component per job: the notice is the same inside a panel.</Notice>
              <div style={{ marginBlockStart: 'var(--s3)' }}>
                <Badge tone="success">Ready to apply</Badge>
              </div>
            </PanelBody>
            <PanelFooter>
              <RowMeta>Updated Oct 3</RowMeta>
            </PanelFooter>
          </Panel>
        </Group>
      </Grid>
    </GallerySection>
  )
}
