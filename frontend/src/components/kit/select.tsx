import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '#/lib/utils'
import { useFieldControl } from './field'
import type { ControlSize } from './input'

export type SelectProps = Omit<ComponentPropsWithoutRef<'select'>, 'size' | 'multiple'> & {
  size?: ControlSize
  invalid?: boolean
  /** Short text or icon inside the frame before the value, e.g. "Sort". */
  leading?: ReactNode
}

/**
 * Styled native select (single choice): same frame and height as Input.
 * `className` styles the frame; native props and `ref` belong to the <select>.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(props, ref) {
  const {
    size = 'md',
    invalid: invalidProp,
    leading,
    className,
    id: idProp,
    required: requiredProp,
    disabled: disabledProp,
    children,
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

  return (
    <div
      className={cn('kit-select', className)}
      data-size={size}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
    >
      {leading ? <span className="kit-select__leading">{leading}</span> : null}
      <select
        {...rest}
        ref={ref}
        id={field.id}
        className="kit-select__control"
        aria-describedby={field.describedBy}
        aria-invalid={field.invalid || undefined}
        required={field.required || undefined}
        disabled={field.disabled}
      >
        {children}
      </select>
      <ChevronDown className="kit-select__chevron" aria-hidden="true" />
    </div>
  )
})
