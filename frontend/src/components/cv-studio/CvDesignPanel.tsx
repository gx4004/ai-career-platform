import { useId } from 'react'
import type { CSSProperties } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import { CV_ACCENT_PALETTE } from '#/lib/api/schemas'
import type { CvStyle, CvStyleCatalog, CvTemplateId } from '#/lib/api/schemas'
import { DENSITY_LABELS } from '#/lib/cv-studio/catalog'
import { ACCENT_NAMES, FONT_STACKS, TEMPLATE_TOKENS } from '#/lib/cv-studio/preview'
import { cn } from '#/lib/utils'

type Accent = (typeof CV_ACCENT_PALETTE)[number]
const isAccent = (value: string): value is Accent => (CV_ACCENT_PALETTE as readonly string[]).includes(value)

/** A tiny CSS drawing of each template's layout, tinted with the chosen accent. */
function TemplateThumb({ id, accent }: { id: CvTemplateId; accent: string }) {
  const tokens = TEMPLATE_TOKENS[id]
  return (
    <span
      className={`cvs-thumb cvs-thumb--${id} cvs-thumb--${tokens.font}`}
      style={{ '--thumb-accent': accent } as CSSProperties}
      aria-hidden="true"
    >
      {id === 'modern-two-column' ? (
        <>
          <span className="cvs-thumb__side"><i className="cvs-thumb__name" /><i /><i /><i className="cvs-thumb__rule" /><i /><i /></span>
          <span className="cvs-thumb__main"><i className="cvs-thumb__rule" /><i /><i /><i /><i className="cvs-thumb__rule" /><i /><i /></span>
        </>
      ) : (
        <>
          <i className="cvs-thumb__name" />
          <i className="cvs-thumb__rule" /><i /><i /><i className="cvs-thumb__short" />
          <i className="cvs-thumb__rule" /><i /><i /><i className="cvs-thumb__short" />
          <i className="cvs-thumb__rule" /><i /><i className="cvs-thumb__short" />
        </>
      )}
    </span>
  )
}

export function CvDesignPanel({ style, catalog, onChange }: {
  style: CvStyle; catalog: CvStyleCatalog; onChange: (patch: Partial<CvStyle>) => void
}) {
  const atsHintId = useId()
  const locked = style.ats_mode
  const palette = catalog.palette.filter(isAccent)
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
        <div className="cvs-template-grid">
          {catalog.templates.map((template) => {
            const selected = style.template_id === template.id
            return (
              <label key={template.id} className={cn('cvs-template', selected && 'is-selected')}>
                <input
                  type="radio" name="cv-template" value={template.id} checked={selected} className="sr-only"
                  aria-describedby={`cv-template-${template.id}-desc`}
                  onChange={() => onChange({ template_id: template.id })}
                />
                <TemplateThumb id={template.id} accent={style.accent_color} />
                <span className="cvs-template__name">{template.name}</span>
                <span id={`cv-template-${template.id}-desc`} className="cvs-template__desc">{template.description}</span>
                {template.ats_safe ? <span className="cvs-badge cvs-badge--safe">ATS-safe</span> : <span className="cvs-badge">Two columns</span>}
                {selected ? <span className="cvs-template__check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span> : null}
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
              <span className="cvs-font__sample" style={{ fontFamily: FONT_STACKS[font.id] }}>{font.name}</span>
              <span className="cvs-font__category">{font.category.replace('-', ' ')}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="cvs-design__group" disabled={locked}>
        <legend>Accent colour</legend>
        <div className="cvs-swatches">
          {palette.map((color) => (
            <label key={color} className={cn('cvs-swatch', style.accent_color === color && 'is-selected')} title={ACCENT_NAMES[color]}>
              <input type="radio" name="cv-accent" value={color} checked={style.accent_color === color} className="sr-only" aria-label={ACCENT_NAMES[color]} onChange={() => onChange({ accent_color: color })} />
              <span className="cvs-swatch__dot" style={{ background: color }} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="cvs-design__group" disabled={locked}>
        <legend>Spacing</legend>
        <div className="cvs-segmented">
          {catalog.densities.map((density) => (
            <label key={density} className={cn('cvs-segmented__option', style.density === density && 'is-selected')}>
              <input type="radio" name="cv-density" value={density} checked={style.density === density} className="sr-only" onChange={() => onChange({ density })} />
              {DENSITY_LABELS[density]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
