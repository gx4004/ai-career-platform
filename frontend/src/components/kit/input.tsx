import {
  forwardRef,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useFieldControl } from './field'
import { useMergedRef } from './utils'

export type ControlSize = 'sm' | 'md' | 'lg'

export type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'size' | 'prefix'> & {
  size?: ControlSize
  /** Force the invalid look. A surrounding Field with an error does this automatically. */
  invalid?: boolean
  /** Icon or short text before the value (search icon, "https://"). */
  leading?: ReactNode
  /** Icon or short text after the value. */
  trailing?: ReactNode
  /** Shows a clear button while the field has a value (search boxes). */
  clearable?: boolean
  /** Called after the clear button emptied the field. */
  onClear?: () => void
  clearLabel?: string
}

/**
 * Text input. `className` styles the frame (width, margin); native props and
 * `ref` belong to the inner <input>.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  const {
    size = 'md',
    invalid: invalidProp,
    leading,
    trailing,
    clearable = false,
    onClear,
    clearLabel = 'Clear',
    className,
    id: idProp,
    required: requiredProp,
    disabled: disabledProp,
    onChange,
    readOnly,
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

  const inputRef = useRef<HTMLInputElement>(null)
  const mergedRef = useMergedRef(ref, inputRef)
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(
    () => rest.defaultValue !== undefined && String(rest.defaultValue) !== '',
  )
  const hasValue = rest.value !== undefined ? String(rest.value) !== '' : uncontrolledHasValue

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUncontrolledHasValue(event.target.value !== '')
    onChange?.(event)
  }

  const clear = () => {
    const input = inputRef.current
    if (!input) return
    // Go through the native setter so React sees a real input event (works for controlled and uncontrolled).
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
    onClear?.()
  }

  // Clicks on the padding or an adornment focus the field like a native input would.
  const focusFromFrame = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target === inputRef.current || target.closest('button')) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn('kit-input', className)}
      data-size={size}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
      data-readonly={readOnly || undefined}
      data-empty={!hasValue || undefined}
      onMouseDown={focusFromFrame}
    >
      {leading ? <span className="kit-input__adornment">{leading}</span> : null}
      <input
        {...rest}
        ref={mergedRef}
        id={field.id}
        className="kit-input__control"
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid || undefined}
        required={field.required || undefined}
        disabled={field.disabled}
        readOnly={readOnly}
        onChange={handleChange}
      />
      {clearable && hasValue && !field.disabled && !readOnly ? (
        <button type="button" className="kit-input__clear" aria-label={clearLabel} onClick={clear}>
          <X aria-hidden="true" />
        </button>
      ) : null}
      {trailing ? <span className="kit-input__adornment">{trailing}</span> : null}
    </div>
  )
})
