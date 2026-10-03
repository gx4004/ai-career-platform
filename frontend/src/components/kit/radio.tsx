import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { cn } from '#/lib/utils'
import { useFieldControl } from './field'

/**
 * plain: dot and text, no frame (a short vertical list).
 * framed: the Input frame around a one-line option (inline groups, toolbar rows).
 * card: a bordered block with room for a description and trailing text (template and font pickers).
 * swatch: a round colour chip; the label is the accessible name and is not drawn.
 */
export type RadioVariant = 'plain' | 'framed' | 'card' | 'swatch'

type RadioContextValue = {
  name: string
  value: string | undefined
  variant: RadioVariant
  disabled: boolean
  required: boolean
  invalid: boolean
  onSelect: (value: string) => void
}

const RadioContext = createContext<RadioContextValue | null>(null)

export type RadioGroupProps = Omit<ComponentPropsWithoutRef<'div'>, 'defaultValue' | 'onChange'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Shared `name` of the native radios (forms and arrow-key grouping). Generated when omitted. */
  name?: string
  variant?: RadioVariant
  /** vertical stacks the options (default); horizontal lays them in a wrapping row. */
  orientation?: 'vertical' | 'horizontal'
  disabled?: boolean
  required?: boolean
  invalid?: boolean
}

/**
 * A single-choice group of native radio inputs. Keyboard is the browser's own: Tab enters the group on
 * the selected option, arrow keys move and select. Name it with `aria-label`, or wrap it in a Field with
 * a label. Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 */
export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(props, ref) {
  const {
    value: valueProp,
    defaultValue,
    onValueChange,
    name: nameProp,
    variant = 'plain',
    orientation = 'vertical',
    disabled: disabledProp,
    required: requiredProp,
    invalid: invalidProp,
    className,
    id: idProp,
    children,
    ...rest
  } = props

  const field = useFieldControl({
    id: idProp,
    'aria-describedby': rest['aria-describedby'],
    'aria-invalid': rest['aria-invalid'],
    'aria-labelledby': rest['aria-labelledby'],
    invalid: invalidProp,
    required: requiredProp,
    disabled: disabledProp,
  })

  const generatedName = useId()
  const [inner, setInner] = useState(defaultValue)
  const value = valueProp !== undefined ? valueProp : inner

  const onSelect = (next: string) => {
    if (valueProp === undefined) setInner(next)
    onValueChange?.(next)
  }

  return (
    <RadioContext.Provider
      value={{
        name: nameProp ?? `kit-radio-${generatedName}`,
        value,
        variant,
        disabled: field.disabled,
        required: field.required,
        invalid: field.invalid,
        onSelect,
      }}
    >
      <div
        {...rest}
        ref={ref}
        id={field.id}
        role="radiogroup"
        className={cn('kit-radiogroup', className)}
        data-variant={variant}
        data-orientation={orientation}
        data-invalid={field.invalid || undefined}
        data-disabled={field.disabled || undefined}
        aria-labelledby={field.labelledBy}
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid || undefined}
        aria-required={field.required || undefined}
        aria-disabled={field.disabled || undefined}
      >
        {children}
      </div>
    </RadioContext.Provider>
  )
})

type RadioItemBase = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size' | 'children' | 'value' | 'checked' | 'defaultChecked' | 'name' | 'onChange'> & {
  /** The value this option stands for. */
  value: string
  /** Second line of quiet text under the label (plain and card). */
  description?: ReactNode
  /** Quiet text at the end of the row (card): "Serif", a count. */
  meta?: ReactNode
  /** swatch only: any CSS colour. It is data, so it is passed through a custom property instead of a class. */
  swatch?: string
}

/** The option's accessible name: visible label text (not for swatches) or aria-label / aria-labelledby. */
export type RadioItemProps = RadioItemBase &
  (
    | { label: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }
    | { label?: undefined; 'aria-label': string; 'aria-labelledby'?: string }
    | { label?: undefined; 'aria-label'?: string; 'aria-labelledby': string }
  )

/** One option. Must sit inside a RadioGroup. The whole label row (or card, or swatch) is the hit area. */
export const RadioItem = forwardRef<HTMLInputElement, RadioItemProps>(function RadioItem(props, ref) {
  const group = useContext(RadioContext)
  if (!group) throw new Error('RadioItem must be used inside <RadioGroup>')

  const { value, label, description, meta, swatch, className, disabled: disabledProp, id, style, ...rest } = props
  const labelId = useId()
  const descriptionId = useId()
  const disabled = disabledProp ?? group.disabled
  const checked = group.value === value
  const swatchVariant = group.variant === 'swatch'
  const name = rest['aria-label'] ?? (swatchVariant && typeof label === 'string' ? label : undefined)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) group.onSelect(value)
  }

  return (
    <label
      className={cn('kit-radio', className)}
      data-variant={group.variant}
      data-checked={checked || undefined}
      data-invalid={group.invalid || undefined}
      data-disabled={disabled || undefined}
      title={swatchVariant ? name : undefined}
      style={swatchVariant && swatch ? ({ ...style, '--kit-swatch': swatch } as CSSProperties) : style}
    >
      <input
        {...rest}
        ref={ref}
        id={id}
        type="radio"
        className="kit-radio__input"
        name={group.name}
        value={value}
        checked={checked}
        disabled={disabled}
        required={group.required || undefined}
        aria-label={swatchVariant ? name : rest['aria-label']}
        aria-labelledby={rest['aria-labelledby'] ?? (label && !swatchVariant && !rest['aria-label'] ? labelId : undefined)}
        aria-describedby={description ? descriptionId : rest['aria-describedby']}
        onChange={handleChange}
      />
      {swatchVariant ? null : (
        <>
          {label || description ? (
            <span className="kit-radio__text">
              {label ? (
                <span id={labelId} className="kit-radio__label">
                  {label}
                </span>
              ) : null}
              {description ? (
                <span id={descriptionId} className="kit-radio__description">
                  {description}
                </span>
              ) : null}
            </span>
          ) : null}
          {meta ? <span className="kit-radio__meta">{meta}</span> : null}
        </>
      )}
    </label>
  )
})
