import { useState } from 'react'
import { Clock, FileCheck2, Layers, Mail, MessageCircle, Route, Search, Settings, Target, UserRound, X } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Select,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetSide,
  type SheetSize,
  useToast,
} from '#/components/kit'
import { GallerySection, Grid, Group, Row, Specimen, Stage } from './gallery-parts'

const DESCRIPTION = [
  'Build and run the data pipelines behind the matching platform. You will own ingestion from third-party job boards, normalisation and the scoring service.',
  'Work with product to decide what the match score should show, and with design on how it reads in the list. We care about plain, trustworthy numbers.',
  'You have shipped Python services in production, are comfortable with Postgres, and like deleting code more than writing it.',
  'The team is six people, remote across European time zones, with a weekly demo and no standing meetings otherwise.',
]

function DrawerBody({ long = false }: { long?: boolean }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>Senior Backend Engineer, Platform</SheetTitle>
        <SheetDescription>Northwind Labs · Remote, Europe · Posted 3 days ago</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <div className="kit-gallery__row kit-gallery__paragraph">
          <Badge tone="success">Strong match</Badge>
          <Badge tone="warning">2 skills to build</Badge>
        </div>
        {(long ? DESCRIPTION.concat(DESCRIPTION, DESCRIPTION) : DESCRIPTION).map((text, index) => (
          <p key={index} className="kit-gallery__paragraph">
            {text}
          </p>
        ))}
      </SheetBody>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="secondary">Hide job</Button>
        </SheetClose>
        <Button>Add to applications</Button>
      </SheetFooter>
    </>
  )
}

function DrawerDemo({ side, size, label }: { side: SheetSide; size?: SheetSize; label: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">{label}</Button>
      </SheetTrigger>
      <SheetContent side={side} size={size}>
        <DrawerBody long />
      </SheetContent>
    </Sheet>
  )
}

function FiltersSheet() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">Filters sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list to the jobs you want to see.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="kit-gallery__form">
            <Field label="Company">
              <Select defaultValue="">
                <option value="">All companies</option>
                <option>Northwind Labs</option>
                <option>Fernhill</option>
              </Select>
            </Field>
            <Field label="Posted">
              <Select defaultValue="">
                <option value="">Any time</option>
                <option>Past week</option>
              </Select>
            </Field>
            <Checkbox label="Remote only" />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost">Clear</Button>
          <Button onClick={() => setOpen(false)}>Show jobs</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const TOOLS = [
  { label: 'Resume Analyzer', icon: FileCheck2, tone: 'tangerine' },
  { label: 'Job Match', icon: Target, tone: 'mint' },
  { label: 'Career Path', icon: Route, tone: 'lilac' },
  { label: 'Cover Letter', icon: Mail, tone: 'lemon' },
  { label: 'Interview Q&A', icon: MessageCircle, tone: 'rose' },
  { label: 'Portfolio Planner', icon: Layers, tone: 'aqua' },
] as const

const PLACES = [
  { label: 'History', icon: Clock },
  { label: 'Profile', icon: UserRound },
  { label: 'Search', icon: Search },
  { label: 'Settings', icon: Settings },
]

/**
 * withToast: the sheet opens while a two-action toast is up (the dashboard's "+ Add", then More). On a phone the toast
 * sits at the top, compact, and the sheet stops below it; check it at 320x640.
 */
function ToolsSheet({ withToast = false }: { withToast?: boolean }) {
  const { toast } = useToast()
  return (
    <Sheet
      onOpenChange={(open) => {
        if (open && withToast) {
          toast({
            tone: 'success',
            title: 'Added to your applications',
            description: 'Backend Engineer, Inference',
            action: { label: 'View application', onClick: () => undefined },
            secondaryAction: { label: 'Undo', onClick: () => undefined },
          })
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="secondary">{withToast ? 'Tools sheet under a toast' : 'Tools sheet (tiles)'}</Button>
      </SheetTrigger>
      <SheetContent side="bottom" size="sm">
        <SheetHeader>
          <SheetTitle>Tools</SheetTitle>
          <SheetDescription visuallyHidden>Career tools and the places you can go.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <ul className="kit-gallery__tool-list">
            {TOOLS.map(({ label, icon: Icon, tone }) => (
              <li key={label}>
                <SheetClose asChild>
                  <button type="button" className="kit-gallery__tool-row kit-tone" data-tone={tone}>
                    <span className="kit-gallery__tool-disc">
                      <Icon aria-hidden="true" />
                    </span>
                    {label}
                  </button>
                </SheetClose>
              </li>
            ))}
          </ul>
          <ul className="kit-gallery__tool-list kit-gallery__tool-list--plain">
            {PLACES.map(({ label, icon: Icon }) => (
              <li key={label}>
                <SheetClose asChild>
                  <button type="button" className="kit-gallery__tool-row">
                    <Icon aria-hidden="true" />
                    {label}
                  </button>
                </SheetClose>
              </li>
            ))}
          </ul>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function StaticDrawer() {
  return (
    <Sheet open>
      <div className="kit-sheet" data-side="right" data-size="sm" data-closable="true">
        <DrawerBody />
        <Button type="button" iconOnly variant="ghost" size="sm" className="kit-panel__close" aria-label="Close">
          <X aria-hidden="true" />
        </Button>
      </div>
    </Sheet>
  )
}

function StaticBottom() {
  return (
    <Sheet open>
      <div className="kit-sheet" data-side="bottom" data-closable="true">
        <span className="kit-sheet__grab" aria-hidden="true" />
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list to the jobs you want to see.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="kit-gallery__form">
            <Field label="Company">
              <Select defaultValue="">
                <option value="">All companies</option>
              </Select>
            </Field>
            <Checkbox label="Remote only" />
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost">Clear</Button>
          <Button>Show jobs</Button>
        </SheetFooter>
        <Button type="button" iconOnly variant="ghost" size="sm" className="kit-panel__close" aria-label="Close">
          <X aria-hidden="true" />
        </Button>
      </div>
    </Sheet>
  )
}

export function SheetSection() {
  return (
    <GallerySection
      id="sheet"
      title="Sheet"
      note="The same modal behaviour as Dialog, white with the 2px ink outline. Right-hand drawer on desktop (slides 24px and fades in, 200ms), bottom sheet at 767px and below or always (28px top corners, a grab bar that is decoration only, rises 60px in 260ms). Both leave with a 120ms fade; reduced motion shows the final state at once."
    >
      <Group title="At rest (static previews)">
        <Grid wide>
          <Specimen label="drawer, sm (384)">
            <Stage label="Static preview of a drawer" className="kit-gallery__stage--tall kit-gallery__stage--drawer">
              <StaticDrawer />
            </Stage>
          </Specimen>
          <Specimen label="bottom sheet">
            <Stage label="Static preview of a bottom sheet" className="kit-gallery__stage--tall kit-gallery__stage--bottom">
              <StaticBottom />
            </Stage>
          </Specimen>
        </Grid>
      </Group>

      <Group title="Drawer: responsive (open them; resize below 769px to see the bottom sheet)">
        <Row>
          <DrawerDemo side="responsive" size="sm" label="Small (384)" />
          <DrawerDemo side="responsive" size="md" label="Medium (480)" />
          <DrawerDemo side="responsive" size="lg" label="Large (576)" />
        </Row>
      </Group>

      <Group title="Always a bottom sheet">
        <Row>
          <DrawerDemo side="bottom" label="Bottom sheet, long content" />
          <FiltersSheet />
          <ToolsSheet />
          <ToolsSheet withToast />
        </Row>
      </Group>
    </GallerySection>
  )
}
