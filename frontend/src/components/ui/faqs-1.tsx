import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'

export type FaqItem = {
  id: string
  title: string
  content: string
}

const defaultQuestions: FaqItem[] = [
  {
    id: 'item-1',
    title: 'Do I need an account to try Career Workbench?',
    content:
      'No. You can start as a guest, run the workflow, and decide later whether you want to save your history.',
  },
  {
    id: 'item-2',
    title: 'Do I need a job description for it to be useful?',
    content:
      'No. The resume review works on its own. Adding a job post makes matching, cover letters, and interview prep much more specific.',
  },
  {
    id: 'item-3',
    title: 'What kind of feedback do I get first?',
    content:
      'You get a score, missing keywords or thin proof, and the highest-leverage edits before lower-priority polish.',
  },
  {
    id: 'item-4',
    title: 'Can I reuse the same context across the tools?',
    content:
      'Yes. Your resume baseline and target role carry through the session so every output stays aligned instead of starting from a blank form.',
  },
  {
    id: 'item-5',
    title: 'What do I leave with?',
    content:
      'Depending on the path you take, you can leave with a sharper resume, role-match gaps, a cover letter draft, interview prep, and a clearer next-step plan.',
  },
]

export function FaqsSection({
  title = 'Frequently asked questions',
  description = "Here are the questions people usually ask before they move from a single resume upload into the full workflow.",
  questions = defaultQuestions,
  supportHref = '#',
  supportLabel = 'support team',
  className,
}: {
  title?: string
  description?: string
  questions?: FaqItem[]
  supportHref?: string
  supportLabel?: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-10">
        {title || description ? (
          <div className="space-y-2">
            {title ? (
              <h2 className="text-3xl font-semibold tracking-[var(--tracking-title)] text-[var(--text-strong)] md:text-4xl">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-2xl text-[var(--text-body)]">{description}</p>
            ) : null}
          </div>
        ) : null}
        <Accordion
          type="single"
          collapsible
          className="w-full space-y-3"
          defaultValue={questions[0]?.id}
        >
          {questions.map((item) => (
            <AccordionItem
              value={item.id}
              key={item.id}
              className="overflow-hidden rounded-[calc(var(--radius-xl)+0.1rem)] border border-[color-mix(in_srgb,var(--border-soft)_86%,white_14%)] bg-[rgba(255,255,255,0.74)] shadow-[0_6px_18px_rgba(19,44,72,0.035)]"
            >
              <AccordionTrigger className="px-5 py-4 text-left text-[0.98rem] leading-6 font-semibold text-[var(--text-strong)] hover:no-underline md:px-6 md:py-5">
                {item.title}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5 text-[var(--text-body)] md:px-6 md:pb-6">
                {item.content}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="text-sm text-[var(--text-muted)] md:text-[0.96rem]">
          Can&apos;t find what you&apos;re looking for? Contact our{' '}
          <a href={supportHref} className="text-primary hover:underline">
            {supportLabel}
          </a>
          .
        </p>
      </div>
    </div>
  )
}
