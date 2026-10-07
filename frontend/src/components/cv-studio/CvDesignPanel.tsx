import { Badge, Notice, RadioGroup, RadioItem, Section, Segmented, Stack, Switch } from '#/components/kit'
import type { CvStyle, CvStyleCatalog } from '#/lib/api/schemas'

const TEMPLATE_GROUPS = [
  { group: 'ats-safe', title: 'ATS-safe' },
  { group: 'more', title: 'More designs' },
] as const
const TEMPLATE_FONT = 'template'
export const LESS_SAFE_NOTICE = 'Some job portals may read this layout out of order. Use an ATS-safe template for portal applications.'

const sentenceCase = (text: string) => text.replace('-', ' ').replace(/^./, (letter) => letter.toUpperCase())

export function CvDesignPanel({ style, catalog, onChange }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
}) {
  const locked = style.ats_mode
  // ATS mode forces one template and offers only the ATS-safe ones; an id without a template yet
  // (or one the catalog does not list) shows as the first catalog template, as it prints.
  const shownId = locked ? catalog.ats_mode.template_id : style.template_id
  const selected = catalog.templates.find((template) => template.id === shownId) ?? catalog.templates[0]
  const offered = locked
    ? catalog.templates.filter((template) => catalog.ats_mode.offered_template_ids.includes(template.id))
    : catalog.templates

  return (
    <Stack gap={6}>
      <Section headingLevel={3} title="Mode">
        <Switch
          controlPosition="end"
          label="ATS-friendly mode"
          description="Uses a plain one-column layout and a standard font so application systems read every line."
          checked={locked}
          onCheckedChange={(ats_mode) => onChange({ ats_mode })}
        />
      </Section>

      <Section headingLevel={3} title="Template" description={locked ? 'Paused while ATS-friendly mode is on.' : undefined}>
        <Stack gap={4}>
          {TEMPLATE_GROUPS.map(({ group, title }) => {
            const templates = offered.filter((template) => template.group === group)
            if (templates.length === 0) return null
            return (
              <Stack key={group} gap={2}>
                <Section headingLevel={4} title={title}>
                  <RadioGroup
                    aria-label={group === 'ats-safe' ? 'ATS-safe templates' : 'More designs'}
                    name="cv-template"
                    variant="card"
                    disabled={locked}
                    value={selected.id}
                    onValueChange={(template_id) => onChange({ template_id: template_id as CvStyle['template_id'] })}
                  >
                    {templates.map((template) => (
                      <RadioItem
                        key={template.id}
                        value={template.id}
                        label={<>{template.name} <Badge size="sm" tone={template.ats_safe ? 'success' : 'neutral'}>{template.ats_safe ? 'ATS-safe' : 'Less ATS-safe'}</Badge></>}
                        description={template.description}
                        meta={template.columns === 1 ? 'One column' : 'Two columns'}
                      />
                    ))}
                  </RadioGroup>
                </Section>
              </Stack>
            )
          })}
          {!locked && !selected.ats_safe ? <Notice tone="warning">{LESS_SAFE_NOTICE}</Notice> : null}
        </Stack>
      </Section>

      <Section headingLevel={3} title="Font">
        <RadioGroup aria-label="Font" variant="card" disabled={locked} value={style.font_id ?? TEMPLATE_FONT} onValueChange={(font_id) => onChange({ font_id: font_id === TEMPLATE_FONT ? null : (font_id as NonNullable<CvStyle['font_id']>) })}>
          <RadioItem value={TEMPLATE_FONT} label="Template default" description="The typefaces the template was designed with." />
          {catalog.fonts.map((font) => (
            <RadioItem
              key={font.id}
              value={font.id}
              label={<span style={{ fontFamily: font.css_family }}>{font.name}</span>}
              meta={sentenceCase(font.category)}
            />
          ))}
        </RadioGroup>
      </Section>

      <Section headingLevel={3} title="Accent colour">
        <RadioGroup aria-label="Accent colour" variant="swatch" orientation="horizontal" disabled={locked} value={style.accent_color} onValueChange={(accent_color) => onChange({ accent_color: accent_color as CvStyle['accent_color'] })}>
          {catalog.palette.map(({ value, name }) => (
            <RadioItem key={value} value={value} label={name} swatch={value} />
          ))}
        </RadioGroup>
      </Section>

      <Section headingLevel={3} title="Spacing">
        <Segmented
          fullWidth
          aria-label="Spacing"
          disabled={locked}
          value={style.density}
          onValueChange={(density) => onChange({ density })}
          options={catalog.densities.map(({ id, name }) => ({ value: id, label: name }))}
        />
      </Section>

      <Section headingLevel={3} title="Length">
        <Switch
          controlPosition="end"
          label="Fit to one page"
          description="Shrinks the type and spacing a little, never below 9 pt text, to keep the CV on one page. If it can’t fit, it stays at that size and runs over."
          checked={style.fit_one_page}
          onCheckedChange={(fit_one_page) => onChange({ fit_one_page })}
        />
      </Section>

      <Section headingLevel={3} title="Page size">
        <Segmented
          fullWidth
          aria-label="Page size"
          value={style.page_size}
          onValueChange={(page_size) => onChange({ page_size })}
          options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]}
        />
      </Section>
    </Stack>
  )
}
