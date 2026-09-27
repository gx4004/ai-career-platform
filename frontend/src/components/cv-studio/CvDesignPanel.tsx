import { useId } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import type { CvStyle, CvStyleCatalog } from '#/lib/api/schemas'
import { cn } from '#/lib/utils'

export function CvDesignPanel({ style, catalog, onChange }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
}) {
  const atsHintId = useId()
  const locked = style.ats_mode
  const lockedNote = locked ? <p className="cvs-design__locked">Paused while ATS-friendly mode is on.</p> : null

  return (
    <div className="cvs-design">
      <div className={cn('cvs-ats-toggle', locked && 'is-on')}>
        <div className="cvs-ats-toggle__text">
          <p className="cvs-ats-toggle__title"><ShieldCheck size={16} aria-hidden="true" /> ATS-friendly mode</p>
          <p id={atsHintId} className="cvs-ats-toggle__hint">
            Uses a plain one-column layout and a standard font so application systems read every line.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={locked}
          aria-label="ATS-friendly mode"
          aria-describedby={atsHintId}
          className="cvs-switch"
          onClick={() => onChange({ ats_mode: !locked })}
        >
          <span className="cvs-switch__thumb" />
        </button>
      </div>

      <fieldset className="cvs-design__group" disabled={locked}>
        <legend>Template</legend>
        {lockedNote}
        <div className="cvs-template-list">
          {catalog.templates.map((template) => {
            const selected = style.template_id === template.id
            return (
              <label key={template.id} className={cn('cvs-template', selected && 'is-selected')}>
                <input
                  type="radio" name="cv-template" value={template.id} checked={selected} className="sr-only"
                  aria-describedby={`cv-template-${template.id}-desc`}
                  onChange={() => onChange({ template_id: template.id })}
                />
                <span className="cvs-template__check" aria-hidden="true">{selected ? <Check size={12} strokeWidth={3} /> : null}</span>
                <span className="cvs-template__text">
                  <span className="cvs-template__name">
                    {template.name}
                    {template.ats_safe ? <span className="cvs-badge cvs-badge--safe">ATS-safe</span> : <span className="cvs-badge">Two columns</span>}
                  </span>
                  <span id={`cv-template-${template.id}-desc`} className="cvs-template__desc">{template.description}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="cvs-design__group" disabled={locked}>
        <legend>Font</legend>
        <div className="cvs-font-list">
          {catalog.fonts.map((font) => (
            <label key={font.id} className={cn('cvs-font', style.font_id === font.id && 'is-selected')}>
              <input type="radio" name="cv-font" value={font.id} checked={style.font_id === font.id} className="sr-only" onChange={() => onChange({ font_id: font.id })} />
              <span className="cvs-font__sample" style={{ fontFamily: font.css_family }}>{font.name}</span>
              <span className="cvs-font__category">{font.category.replace('-', ' ')}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="cvs-design__group" disabled={locked}>
        <legend>Accent colour</legend>
        <div className="cvs-swatches">
          {catalog.palette.map(({ value, name }) => (
            <label key={value} className={cn('cvs-swatch', style.accent_color === value && 'is-selected')} title={name}>
              <input type="radio" name="cv-accent" value={value} checked={style.accent_color === value} className="sr-only" aria-label={name} onChange={() => onChange({ accent_color: value })} />
              <span className="cvs-swatch__dot" style={{ background: value }} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="cvs-design__group" disabled={locked}>
        <legend>Spacing</legend>
        <div className="cvs-segmented">
          {catalog.densities.map(({ id, name }) => (
            <label key={id} className={cn('cvs-segmented__option', style.density === id && 'is-selected')}>
              <input type="radio" name="cv-density" value={id} checked={style.density === id} className="sr-only" onChange={() => onChange({ density: id })} />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
