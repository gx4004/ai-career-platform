import { useState } from 'react'
import { Count, Disclosure } from '#/components/kit'
import { GallerySection, Group, Specimen } from './gallery-parts'

function ControlledDemo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="kit-gallery__frame">
      <Disclosure variant="inline" title={open ? 'Hide sample answer' : 'Show sample answer'} open={open} onOpenChange={setOpen}>
        <p className="kit-gallery__paragraph">
          I led the migration of our ingestion jobs to a queue, which cut failed runs by a third. The part I am proudest of is the
          dead-letter review we added, so bad listings were fixed instead of silently skipped.
        </p>
      </Disclosure>
      <p className="kit-gallery__label">Controlled: the page owns the open state ({open ? 'open' : 'closed'}).</p>
    </div>
  )
}

export function DisclosureSection() {
  return (
    <GallerySection
      id="disclosure"
      title="Disclosure"
      note="A heading row that shows or hides its content. It is a real button with aria-expanded and aria-controls, controlled or uncontrolled. Closed content is not rendered."
    >
      <Group title="Section rows (stacked share their hairlines)">
        <div>
          <Disclosure title="What's working" meta={<Count value={3} />} defaultOpen headingLevel={3}>
            <ul className="kit-gallery__bullets">
              <li>Applications with a tailored CV reached interview 2.1 times more often.</li>
              <li>Roles posted in the last week got replies fastest.</li>
              <li>Remote roles in Europe are your strongest segment.</li>
            </ul>
          </Disclosure>
          <Disclosure title="Document checks" meta="2 to review" headingLevel={3}>
            <p className="kit-gallery__paragraph">Your CV mentions Kubernetes but the posting asks for Nomad.</p>
          </Disclosure>
          <Disclosure title="Notes" headingLevel={3}>
            <p className="kit-gallery__paragraph">Private notes for this application.</p>
          </Disclosure>
        </div>
      </Group>

      <Group title="Inline">
        <div className="kit-gallery__grid">
          <Specimen label="closed">
            <Disclosure variant="inline" title="Why?">
              <p className="kit-gallery__paragraph">Your summary does not mention the stack the posting leads with.</p>
            </Disclosure>
          </Specimen>
          <Specimen label="open">
            <Disclosure variant="inline" title="See what you sent" defaultOpen>
              <p className="kit-gallery__paragraph">Cover letter and CV, sent 3 days ago from your account.</p>
            </Disclosure>
          </Specimen>
          <Specimen label="controlled">
            <ControlledDemo />
          </Specimen>
          <Specimen label="disabled">
            <Disclosure variant="inline" title="Policy" disabled>
              <p>Hidden.</p>
            </Disclosure>
          </Specimen>
        </div>
      </Group>
    </GallerySection>
  )
}
