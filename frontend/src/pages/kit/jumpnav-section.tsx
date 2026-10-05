import { JumpNav } from '#/components/kit'
import { GallerySection, Group } from './gallery-parts'

const ITEMS = [
  { id: 'jump-demo-fix', label: 'Fix first' },
  { id: 'jump-demo-breakdown', label: 'Score breakdown' },
  { id: 'jump-demo-strengths', label: 'Major strengths' },
  { id: 'jump-demo-refinements', label: 'Refinement areas' },
]

export function JumpNavSection() {
  return (
    <GallerySection
      id="jumpnav"
      title="JumpNav"
      note="In-page links of a long report. The section nearest the top reads as current; a click scrolls (instantly under reduced motion). This specimen is not sticky."
    >
      <Group title="Four sections">
        <JumpNav aria-label="On this demo page" items={ITEMS} sticky={false} />
        {ITEMS.map((item) => (
          <p key={item.id} id={item.id} style={{ margin: 0, scrollMarginBlockStart: 72, minBlockSize: '40vh' }}>
            {item.label}: the section the link scrolls to.
          </p>
        ))}
      </Group>
    </GallerySection>
  )
}
