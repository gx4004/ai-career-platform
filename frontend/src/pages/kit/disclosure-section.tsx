import { useState } from 'react'
import { Count, Disclosure, Panel, PanelBody, PanelHeader } from '#/components/kit'
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
      note="A heading row that shows or hides its content. It is a real button with aria-expanded and aria-controls, controlled or uncontrolled. Closed content is not rendered, and nothing animates: the chevron and the content swap at once."
    >
      <Group title="Section rows in a flush Panel (stacked rows share their 2px rules; the chevron disc turns lemon while open)">
        <Panel flush>
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
        </Panel>
      </Group>

      <Group title='size="lg": a foldable panel heading, in the PanelHeader title face (display 20/800)'>
        <Panel flush>
          <Disclosure title="What's working" size="lg" defaultOpen headingLevel={2}>
            <p className="kit-gallery__paragraph">A reply is an interview or an offer.</p>
          </Disclosure>
        </Panel>
      </Group>

      <Group title='ruled: a Panel headed by a foldable row, beside a PanelHeader panel (open: the 2px ink rule under the row; the hover fill keeps the panel&apos;s rounded corners, all four while closed)'>
        <div className="kit-gallery__grid">
          <Specimen label="open, in a plain Panel">
            <Panel as="section">
              <Disclosure title="What's working" size="lg" ruled defaultOpen headingLevel={3}>
                <p className="kit-gallery__paragraph">A reply is an interview or an offer.</p>
              </Disclosure>
            </Panel>
          </Specimen>
          <Specimen label="closed: hover it to see the corners">
            <Panel as="section">
              <Disclosure title="What's working" size="lg" ruled headingLevel={3}>
                <p className="kit-gallery__paragraph">A reply is an interview or an offer.</p>
              </Disclosure>
            </Panel>
          </Specimen>
          <Specimen label="the PanelHeader panel it sits beside">
            <Panel as="section">
              <PanelHeader title="Prepare applications for me" headingLevel={3} />
              <PanelBody>
                <p className="kit-gallery__paragraph">Pick the jobs you want and we draft the documents.</p>
              </PanelBody>
            </Panel>
          </Specimen>
        </div>
      </Group>

      <Group title="In a 288px column (a 320px phone): a long title wraps beside the chevron, a short title keeps one line beside a long meta, and a meta that cannot fit beside its title takes the line under it">
        <div style={{ maxInlineSize: '18rem' }} data-specimen="disclosure-long-title">
          <Panel flush>
            <Disclosure title="Can I use Career Workbench without uploading my resume to a third-party service?" headingLevel={3}>
              <p className="kit-gallery__paragraph">Yes. Paste the text instead; nothing leaves your account.</p>
            </Disclosure>
            <Disclosure title="Attempt 1" meta="No weak spots · 1 suggestion" headingLevel={3}>
              <p className="kit-gallery__paragraph">Feedback for the first attempt.</p>
            </Disclosure>
            <Disclosure title="Earlier round · attempt 2" meta="Quantify the outcome" headingLevel={3}>
              <p className="kit-gallery__paragraph">Feedback for an earlier attempt.</p>
            </Disclosure>
          </Panel>
        </div>
      </Group>

      <Group title="Section rows on their own, and disabled">
        <div>
          <Disclosure title="Offer details" meta="Added Oct 2" headingLevel={3}>
            <p className="kit-gallery__paragraph">Base salary, bonus and start date as you entered them.</p>
          </Disclosure>
          <Disclosure title="Archived notes" meta="Locked" headingLevel={3} disabled>
            <p className="kit-gallery__paragraph">Hidden.</p>
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
