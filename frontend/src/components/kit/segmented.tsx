import { useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { cn } from '#/lib/utils'
import { useFieldControl } from './field'

type SegmentedLabel =
  | { label: ReactNode; icon?: ReactNode; 'aria-label'?: string }
  | { label?: undefined; icon: ReactNode; 'aria-label': string }

export type SegmentedOption<T extends string | number> = SegmentedLabel & {
  value: T
  disabled?: boolean
}

type SegmentedBaseProps<T extends string | number> = Omit<
  ComponentPropsWithoutRef<'div'>,
  'role' | 'children' | 'defaultValue' | 'onChange' | 'dir'
> & {
  options: ReadonlyArray<SegmentedOption<T>>
  size?: 'sm' | 'md'
  /** Options share the full width equally instead of hugging their labels. */
  fullWidth?: boolean
  disabled?: boolean
  /** Force the invalid look and aria-invalid. A surrounding Field with an error does this automatically. */
  invalid?: boolean
  required?: boolean
  ref?: Ref<HTMLDivElement>
}

/** With `deselectable`, value is `T | null` and clicking the selected option reports null. */
export type SegmentedProps<T extends string | number, Deselectable extends boolean = false> = SegmentedBaseProps<T> & {
  deselectable?: Deselectable
  /** null or undefined means nothing is selected. */
  value?: Deselectable extends true ? T | null : T
  defaultValue?: Deselectable extends true ? T | null : T
  onValueChange?: (value: Deselectable extends true ? T | null : T) => void
}

/**
 * Single-select radiogroup for short option lists (view, tone, filter).
 * Arrow keys move and select, Home/End jump, Tab enters on the selected option.
 * Name it with aria-label, aria-labelledby or a surrounding Field label (a Field also wires its help,
 * error and required to it). Native div props (data-testid, aria-describedby, onBlur) reach the root.
 */
export function Segmented<T extends string | number, Deselectable extends boolean = false>(
  props: SegmentedProps<T, Deselectable>,
) {
  const {
    options,
    size = 'md',
    fullWidth = false,
    disabled: disabledProp,
    invalid: invalidProp,
    required: requiredProp,
    id: idProp,
    className,
    ref,
    deselectable = false,
    // Own props that must not reach the DOM through the rest spread.
    value: _value,
    defaultValue: _defaultValue,
    onValueChange: _onValueChange,
    ...rest
  } = props

  const field = useFieldControl({
    id: idProp,
    'aria-labelledby': props['aria-labelledby'],
    'aria-describedby': props['aria-describedby'],
    'aria-invalid': props['aria-invalid'],
    invalid: invalidProp,
    required: requiredProp,
    disabled: disabledProp,
  })

  const [innerValue, setInnerValue] = useState<T | null | undefined>(props.defaultValue as T | null | undefined)
  const controlled = 'value' in props
  const value = (controlled ? props.value : innerValue) as T | null | undefined
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  const commit = (next: T | null) => {
    if (!controlled) setInnerValue(next)
    ;(props.onValueChange as ((value: T | null) => void) | undefined)?.(next)
  }

  const groupDisabled = field.disabled
  const enabled = options.filter((option) => !option.disabled && !groupDisabled)
  const selectedEnabled = enabled.find((option) => option.value === value)
  const tabbable = selectedEnabled ?? enabled[0]

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: T) => {
    const index = enabled.findIndex((option) => option.value === current)
    let target: SegmentedOption<T> | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = enabled[(index + 1) % enabled.length]
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        target = enabled[(index - 1 + enabled.length) % enabled.length]
        break
      case 'Home':
        target = enabled[0]
        break
      case 'End':
        target = enabled[enabled.length - 1]
        break
      default:
        return
    }
    event.preventDefault()
    if (!target) return
    commit(target.value)
    buttons.current.get(target.value)?.focus()
  }

  return (
    <div
      {...rest}
      ref={ref}
      id={field.id}
      role="radiogroup"
      className={cn('kit-segmented', className)}
      data-size={size}
      data-full-width={fullWidth || undefined}
      data-disabled={groupDisabled || undefined}
      data-invalid={field.invalid || undefined}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-label'] ? undefined : field.labelledBy}
      aria-describedby={field.describedBy}
      aria-invalid={field.invalid || undefined}
      aria-required={field.required || undefined}
      aria-disabled={groupDisabled || undefined}
    >
      {options.map((option) => {
        const checked = option.value === value
        const isDisabled = Boolean(option.disabled) || groupDisabled
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              if (node) buttons.current.set(option.value, node)
              else buttons.current.delete(option.value)
            }}
            type="button"
            role="radio"
            className="kit-segmented__option"
            aria-checked={checked}
            aria-label={option['aria-label']}
            data-state={checked ? 'checked' : 'unchecked'}
            disabled={isDisabled}
            tabIndex={tabbable && option.value === tabbable.value ? 0 : -1}
            onClick={() => commit(deselectable && checked ? null : option.value)}
            onKeyDown={(event) => onKeyDown(event, option.value)}
          >
            {option.icon ? <span className="kit-segmented__icon">{option.icon}</span> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
