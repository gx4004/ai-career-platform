import { useState } from 'react'
import { Clock, Star } from 'lucide-react'
import { Avatar, Badge, Card, CardHeader, CardTitle, Chip, Count, Kbd, MetaRow, Sticker, type BadgeTone } from '#/components/kit'
import { GallerySection, Group, Row, Specimen } from './gallery-parts'

const TONES: Array<{ tone: BadgeTone; label: string }> = [
  { tone: 'neutral', label: 'Saved' },
  { tone: 'accent', label: 'Applied' },
  { tone: 'success', label: 'Offer' },
  { tone: 'warning', label: 'Needs review' },
  { tone: 'danger', label: 'Rejected' },
  { tone: 'info', label: 'Draft' },
]

const PALETTE: Array<{ tone: BadgeTone; label: string }> = [
  { tone: 'tangerine', label: 'Interviewing' },
  { tone: 'mint', label: 'Offer' },
  { tone: 'lilac', label: 'Applied' },
  { tone: 'lemon', label: 'Saved' },
  { tone: 'rose', label: 'High' },
  { tone: 'aqua', label: 'Portfolio' },
  { tone: 'stone', label: 'Closed' },
  { tone: 'white', label: 'Matches' },
]

function ChipGroup() {
  const [terms, setTerms] = useState(['backend engineer', 'platform', 'Staff engineer, data infrastructure and developer productivity'])
  return (
    <ul className="kit-gallery__chips" aria-label="Keywords">
      {terms.map((term) => (
        <li key={term}>
          <Chip removeLabel={`Remove ${term}`} onRemove={() => setTerms((current) => current.filter((item) => item !== term))}>
            {term}
          </Chip>
        </li>
      ))}
    </ul>
  )
}

export function BadgeSection() {
  return (
    <GallerySection
      id="badge"
      title="Badge, Count, Kbd"
      note="One status chip for every status in the app. The label always says the status; the dot is decoration."
    >
      <Group title="Tones, medium (26)">
        <Row>
          {TONES.map(({ tone, label }) => (
            <Badge key={tone} tone={tone}>
              {label}
            </Badge>
          ))}
        </Row>
      </Group>

      <Group title="Tones, small (22)">
        <Row>
          {TONES.map(({ tone, label }) => (
            <Badge key={tone} tone={tone} size="sm">
              {label}
            </Badge>
          ))}
        </Row>
      </Group>

      <Group title="Palette tones: stage, severity, tool (colour by meaning)">
        <Row>
          {PALETTE.map(({ tone, label }) => (
            <Badge key={tone} tone={tone}>
              {label}
            </Badge>
          ))}
        </Row>
        <Row>
          <Specimen label="severity (data-severity): high / medium / low">
            <Row>
              <Badge tone="danger" data-severity="high">
                High
              </Badge>
              <Badge tone="warning" data-severity="medium">
                Medium
              </Badge>
              <Badge tone="neutral" data-severity="low">
                Low
              </Badge>
            </Row>
          </Specimen>
          <Specimen label="severity on a lemon Fix-first sticker: white (tone wins over data-severity)">
            <Sticker tone="lemon" size="sm">
              <Row>
                <Badge tone="white" data-severity="high">
                  High
                </Badge>
                <Badge tone="white" data-severity="medium">
                  Medium
                </Badge>
                <Badge tone="white" data-severity="low">
                  Low
                </Badge>
              </Row>
            </Sticker>
          </Specimen>
          <Specimen label="score (a run's score beside its row)">
            <Row>
              <Badge tone="tangerine" score>
                89/100
              </Badge>
              <Badge tone="mint" score>
                75%
              </Badge>
            </Row>
          </Specimen>
          <Specimen label="quiet (info)">
            <Badge tone="info">Remote-friendly</Badge>
          </Specimen>
          <Specimen label="wrap (a long name goes onto more lines, no ellipsis)">
            <div style={{ maxInlineSize: '14rem' }}>
              <Badge tone="info" wrap>
                Job from Senior Backend Engineer, Platform at Northwind Labs
              </Badge>
            </div>
          </Specimen>
        </Row>
      </Group>

      <Group title="With icon (replaces the dot; decorative, the label still says it)">
        <Row>
          <Badge tone="white" icon={<Clock />}>Deadline</Badge>
          <Badge tone="rose" icon={<Clock />}>Due in 3 days</Badge>
          <Badge tone="lemon" size="sm" icon={<Star />}>Starred</Badge>
        </Row>
      </Group>

      <Group title="With dot">
        <Row>
          {TONES.map(({ tone, label }) => (
            <Badge key={tone} tone={tone} dot>
              {label}
            </Badge>
          ))}
          {TONES.slice(0, 3).map(({ tone, label }) => (
            <Badge key={`${tone}-sm`} tone={tone} size="sm" dot>
              {label}
            </Badge>
          ))}
        </Row>
      </Group>

      <Group title="On tinted surfaces: every tone keeps its outline or fill, so none disappears (selected Card)">
        <Row top>
          <div className="kit-gallery__narrow">
            <Card selected>
              <CardHeader>
                <CardTitle>Senior Backend Engineer</CardTitle>
              </CardHeader>
              <MetaRow>
                <span>Northwind Labs</span>
                <span>Remote</span>
              </MetaRow>
              <Row>
                {TONES.map(({ tone, label }) => (
                  <Badge key={tone} tone={tone} size="sm">
                    {label}
                  </Badge>
                ))}
              </Row>
            </Card>
          </div>
        </Row>
      </Group>

      <Group title="Long text (truncates inside its container)">
        <Row>
          <Specimen label="max 10rem">
            <div className="kit-gallery__narrow">
              <Badge tone="warning" dot>
                Missing: Kubernetes, Terraform and Helm
              </Badge>
            </div>
          </Specimen>
        </Row>
      </Group>

      <Group title="In a row">
        <ul className="kit-gallery__list">
          <li>
            <span className="kit-gallery__list-title">Senior Backend Engineer, Platform</span>
            <Badge tone="success" dot>
              Offer
            </Badge>
          </li>
          <li>
            <span className="kit-gallery__list-title">Engineering Manager, Core Services</span>
            <Badge tone="accent" dot>
              Interviewing
            </Badge>
          </li>
          <li>
            <span className="kit-gallery__list-title">Security Engineer</span>
            <Badge tone="neutral" dot>
              Saved
            </Badge>
          </li>
        </ul>
      </Group>

      <Group title="Chip: a removable value the person typed (keywords, locations). Remove one to see the list shrink">
        <Row>
          <Specimen label="removable">
            <ChipGroup />
          </Specimen>
          <Specimen label="plain / disabled">
            <Row>
              <Chip>Berlin</Chip>
              <Chip onRemove={() => undefined} disabled removeLabel="Remove Berlin">
                Berlin
              </Chip>
            </Row>
          </Specimen>
        </Row>
      </Group>

      <Group title="Count: tabular text, or the outlined pill after a heading">
        <Row>
          <Specimen label="muted">
            <Count value={12} />
          </Specimen>
          <Specimen label="accent">
            <Count value={3} tone="accent" />
          </Specimen>
          <Specimen label="max={99}">
            <Count value={148} max={99} />
          </Specimen>
          <Specimen label="text">
            <Count value="2 of 7" />
          </Specimen>
          <Specimen label="next to a heading">
            <span className="kit-gallery__group-title">
              Applications <Count value={7} />
            </span>
          </Specimen>
          <Specimen label="pill: rose / lemon / mint / white">
            <Row>
              <Count variant="pill" tone="rose" value={2} />
              <Count variant="pill" tone="lemon" value={2} />
              <Count variant="pill" tone="mint" value={3} />
              <Count variant="pill" value={5} />
              <Count variant="pill" value={128} />
            </Row>
          </Specimen>
        </Row>
      </Group>

      <Group title="Avatar: initials on a lilac disc, never a per-person colour">
        <Row>
          <Specimen label="sm / md / lg">
            <Row>
              <Avatar name="Ada Lovelace" size="sm" />
              <Avatar name="Ada Lovelace" />
              <Avatar name="Ada Lovelace" size="lg" />
            </Row>
          </Specimen>
          <Specimen label="from an email">
            <Avatar name="grace.hopper@example.com" />
          </Specimen>
          <Specimen label="one name">
            <Avatar name="Cher" />
          </Specimen>
          <Specimen label="decorative, next to the written name">
            <Row>
              <Avatar name="Ada Lovelace" decorative />
              <span>Ada Lovelace</span>
            </Row>
          </Specimen>
        </Row>
      </Group>

      <Group title="Kbd">
        <Row>
          <Kbd>⌘K</Kbd>
          <Kbd>Esc</Kbd>
          <Kbd>↵</Kbd>
          <span>
            <Kbd>⌘</Kbd> <Kbd>Shift</Kbd> <Kbd>P</Kbd>
          </span>
        </Row>
      </Group>
    </GallerySection>
  )
}
