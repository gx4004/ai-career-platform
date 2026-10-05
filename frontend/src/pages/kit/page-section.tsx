import { ArrowLeft, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  Cluster,
  KeyValue,
  Lead,
  MetaRow,
  Page,
  PageHeader,
  Row,
  RowBody,
  RowMeta,
  RowTitle,
  Section,
  Split,
  Stack,
  Stat,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  List,
  ScoreBar,
} from '#/components/kit'
import { DemoLink, GallerySection, Group, Specimen } from './gallery-parts'
import { LONG_TITLE } from './sample-data'

function Back() {
  return (
    <Button asChild variant="link" size="sm">
      <DemoLink>
        <ArrowLeft aria-hidden="true" />
        All applications
      </DemoLink>
    </Button>
  )
}

function Rows({ count }: { count: number }) {
  return (
    <List aria-label="Specimen rows">
      {Array.from({ length: count }, (_, index) => (
        <Row key={index} density="compact">
          <RowBody>
            <RowTitle>Specimen row {index + 1}</RowTitle>
          </RowBody>
          <RowMeta>Sep {29 - index}</RowMeta>
        </Row>
      ))}
    </List>
  )
}

function TabbedHeader() {
  return (
    <Tabs defaultValue="overview">
      <PageHeader
        headingLevel={3}
        title="Senior Backend Engineer, Platform"
        meta={['Northwind Labs', 'Interview', 'Applied 6 days ago']}
        actions={<Button size="sm">Mark as applied</Button>}
        tabs={
          <TabsList aria-label="Application sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents" count={3}>
              Documents
            </TabsTrigger>
            <TabsTrigger value="tasks" count={2}>
              Tasks
            </TabsTrigger>
          </TabsList>
        }
      />
      <TabsContent value="overview">
        <p className="kit-gallery__paragraph">The tab row sits on the edge of the panel below; the header adds no space under it.</p>
      </TabsContent>
      <TabsContent value="documents">
        <p className="kit-gallery__paragraph">Documents.</p>
      </TabsContent>
      <TabsContent value="tasks">
        <p className="kit-gallery__paragraph">Tasks.</p>
      </TabsContent>
    </Tabs>
  )
}

function Rail() {
  return (
    <>
      <Stat label="Skills fit" value={92} unit="%" delta="+6 since Sep 24" tone="success" />
      <ScoreBar label="Keyword match" value={78} valueLabel="78%" />
      <KeyValue
        layout="stacked"
        items={[
          { label: 'Stage', value: 'Interview' },
          { label: 'Applied', value: 'Sep 23, 2026' },
          { label: 'Contact', value: null },
        ]}
      />
    </>
  )
}

function SplitMain() {
  return (
    <>
      <Lead>Your CV already speaks to the platform work; two bullets undersell it.</Lead>
      <Section title="Fix first" count={3}>
        <Rows count={3} />
      </Section>
      <Section title="Requirements">
        <Rows count={2} />
      </Section>
    </>
  )
}

export function PageSection() {
  return (
    <GallerySection
      id="page"
      title="Page, PageHeader, Split"
      note="The frame every in-app page uses: 40px gutters (16 on phones), a display-type title row with 40px above it, 40px between blocks. Frames below render Page as a div so the gallery keeps its own main landmark."
    >
      <Group title="PageHeader">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="back, title, lead, meta, actions">
            <div className="kit-gallery__frame">
              <PageHeader
                headingLevel={3}
                back={<Back />}
                title="Senior Backend Engineer, Platform"
                lead="Everything for this application in one place."
                meta={['Northwind Labs', 'Remote, Europe', null, 'Applied 6 days ago']}
                actions={
                  <>
                    <Button variant="secondary" size="sm">
                      Archive
                    </Button>
                    <Button size="sm">
                      <Plus aria-hidden="true" />
                      Add task
                    </Button>
                  </>
                }
              />
            </div>
          </Specimen>
          <Specimen label="title only">
            <div className="kit-gallery__frame">
              <PageHeader headingLevel={3} title="Dashboard" />
            </div>
          </Specimen>
          <Specimen label="meta, one action">
            <div className="kit-gallery__frame">
              <PageHeader
                headingLevel={3}
                title="Your applications"
                meta={['7 in progress', '2 ready to apply']}
                actions={
                  <Button asChild size="sm">
                    <DemoLink>Find jobs</DemoLink>
                  </Button>
                }
              />
            </div>
          </Specimen>
          <Specimen label="200-character title, actions wrap under it on a phone">
            <div className="kit-gallery__frame">
              <PageHeader
                headingLevel={3}
                title={LONG_TITLE}
                meta={['Fernhill Systems', 'Berlin']}
                actions={
                  <>
                    <Button variant="secondary" size="sm">
                      Archive
                    </Button>
                    <Button size="sm">Mark as applied</Button>
                  </>
                }
              />
            </div>
          </Specimen>
          <Specimen label="with tabs">
            <div className="kit-gallery__frame">
              <TabbedHeader />
            </div>
          </Specimen>
          <Specimen label="title and lead">
            <div className="kit-gallery__frame">
              <PageHeader headingLevel={3} title="Settings" lead="Account, notifications and data." />
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="Page (narrow), as a whole">
        <Page as="div" width="narrow" className="kit-gallery__page">
          <PageHeader
            headingLevel={3}
            title="Applications"
            meta={['7 in progress']}
            actions={
              <Button asChild size="sm">
                <DemoLink>Find jobs</DemoLink>
              </Button>
            }
          />
          <Section title="In progress" count={3} actions={<Badge tone="accent">Live</Badge>}>
            <Rows count={3} />
          </Section>
          <Section title="Closed" count={1}>
            <Rows count={1} />
          </Section>
        </Page>
      </Group>

      <Group title="Split: side by side when its container is 56rem or wider, stacked otherwise">
        <Specimen label="wide container (rail at the end, sticky)">
          <Split rail={<Rail />} railLabel="Summary" stickyRail className="kit-gallery__split-wide">
            <SplitMain />
          </Split>
        </Specimen>
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="narrow container, rail below">
            <div className="kit-gallery__frame kit-gallery__frame--narrow">
              <Split rail={<Rail />} railLabel="Summary">
                <SplitMain />
              </Split>
            </div>
          </Specimen>
          <Specimen label="narrow container, railFirst (the rail above the main column)">
            <div className="kit-gallery__frame kit-gallery__frame--narrow">
              <Split rail={<Rail />} railLabel="Summary" railFirst>
                <SplitMain />
              </Split>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="Stack and Cluster">
        <Cluster gap={6} align="start">
          <Stack gap={2} className="kit-gallery__bounded">
            <Badge>gap 2</Badge>
            <Badge>gap 2</Badge>
            <Badge>gap 2</Badge>
          </Stack>
          <Stack gap={6} className="kit-gallery__bounded">
            <Badge>gap 6</Badge>
            <Badge>gap 6</Badge>
          </Stack>
          <Cluster gap={3} justify="between" className="kit-gallery__bounded">
            <MetaRow>
              <span>cluster</span>
              <span>between</span>
            </MetaRow>
            <Button size="sm" variant="secondary">
              Action
            </Button>
          </Cluster>
        </Cluster>
      </Group>
    </GallerySection>
  )
}
