import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { cn } from '#/lib/utils'
import { useFieldControl } from './field'
import type { ControlSize } from './input'
import { useMergedRef } from './utils'

/** A choice control names itself: visible label text, or aria-label / aria-labelledby. */
type Named =
  | { label: ReactNode; 'aria-label'?: string; 'aria-labelledby'?: string }
  | { label?: undefined; 'aria-label': string; 'aria-labelledby'?: string }
  | { label?: undefined; 'aria-label'?: string; 'aria-labelledby': string }

type ChoiceOwnProps = {
  /** Second line of quiet explanatory text under the label. */
  description?: ReactNode
  invalid?: boolean
  /** Draw the same frame as Input/Select (2px outline, 44px height) so it can sit in a toolbar row. */
  framed?: boolean
  /** Height of a framed control (sm 36, md 44, lg 56; 44 on touch), to sit beside an Input or Select of the same size. Ignored unless framed. */
  size?: ControlSize
  /** "end" puts the control at the far edge and the label first (settings rows). */
  controlPosition?: 'start' | 'end'
  /** Convenience over onChange. */
  onCheckedChange?: (checked: boolean) => void
}

type ChoiceInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size' | 'children'>

export type CheckboxProps = ChoiceInputProps &
  ChoiceOwnProps &
  Named & {
    /** Mixed state for a "select all" parent. Visual only: `checked` still drives the value. */
    indeterminate?: boolean
  }

export type SwitchProps = ChoiceInputProps & ChoiceOwnProps & Named

type ChoiceProps = ChoiceInputProps &
  ChoiceOwnProps & {
    label?: ReactNode
    kind: 'checkbox' | 'switch'
    indeterminate?: boolean
  }

const Choice = forwardRef<HTMLInputElement, ChoiceProps>(function Choice(props, ref) {
  const {
    kind,
    label,
    description,
    invalid: invalidProp,
    framed = false,
    size = 'md',
    controlPosition = 'start',
    indeterminate = false,
    onCheckedChange,
    onChange,
    className,
    id: idProp,
    required: requiredProp,
    disabled: disabledProp,
    ...rest
  } = props

  const field = useFieldControl({
    id: idProp,
    'aria-describedby': rest['aria-describedby'],
    'aria-invalid': rest['aria-invalid'],
    invalid: invalidProp,
    required: requiredProp,
    disabled: disabledProp,
  })

  const descriptionId = useId()
  const labelId = useId()
  const describedBy = [description ? descriptionId : undefined, field.describedBy].filter(Boolean).join(' ') || undefined

  const inputRef = useRef<HTMLInputElement>(null)
  const mergedRef = useMergedRef(ref, inputRef)

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event)
    onCheckedChange?.(event.target.checked)
  }

  return (
    <label
      className={cn('kit-check', className)}
      data-kind={kind}
      data-framed={framed || undefined}
      data-size={framed ? size : undefined}
      data-control-position={controlPosition === 'end' ? 'end' : undefined}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
    >
      <input
        {...rest}
        ref={mergedRef}
        id={field.id}
        type="checkbox"
        role={kind === 'switch' ? 'switch' : undefined}
        className={kind === 'switch' ? 'kit-check__switch' : 'kit-check__box'}
        aria-labelledby={rest['aria-labelledby'] ?? (label && !rest['aria-label'] ? labelId : undefined)}
        aria-describedby={describedBy}
        aria-invalid={field.invalid || undefined}
        required={field.required || undefined}
        disabled={field.disabled}
        onChange={handleChange}
      />
      {label || description ? (
        <span className="kit-check__text">
          {label ? (
            <span id={labelId} className="kit-check__label">
              {label}
            </span>
          ) : null}
          {description ? (
            <span id={descriptionId} className="kit-check__description">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  )
})

/** Native checkbox, restyled. Wrapped in its own <label>: the whole row is the hit area. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(props, ref) {
  return <Choice {...props} ref={ref} kind="checkbox" />
})

/** On/off setting that applies immediately: a native checkbox with role="switch". */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(props, ref) {
  return <Choice {...props} ref={ref} kind="switch" />
})
