import { Badge, RadioGroup, RadioItem, Section, Segmented, Stack, Switch } from '#/components/kit'
import type { CvStyle, CvStyleCatalog } from '#/lib/api/schemas'

const sentenceCase = (text: string) => text.replace('-', ' ').replace(/^./, (letter) => letter.toUpperCase())

export function CvDesignPanel({ style, catalog, onChange }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
}) {
  const locked = style.ats_mode

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
        <RadioGroup aria-label="Template" variant="card" disabled={locked} value={style.template_id} onValueChange={(template_id) => onChange({ template_id: template_id as CvStyle['template_id'] })}>
          {catalog.templates.map((template) => (
            <RadioItem
              key={template.id}
              value={template.id}
              label={<>{template.name} <Badge size="sm" tone={template.ats_safe ? 'success' : 'neutral'}>{template.ats_safe ? 'ATS-safe' : 'Two columns'}</Badge></>}
              description={template.description}
            />
          ))}
        </RadioGroup>
      </Section>

      <Section headingLevel={3} title="Font">
        <RadioGroup aria-label="Font" variant="card" disabled={locked} value={style.font_id} onValueChange={(font_id) => onChange({ font_id: font_id as CvStyle['font_id'] })}>
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
    </Stack>
  )
}
