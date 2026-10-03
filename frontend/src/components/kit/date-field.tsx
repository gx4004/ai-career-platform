import { forwardRef, type ChangeEvent } from 'react'
import { Input, type InputProps } from './input'

export type DateFieldProps = Omit<InputProps, 'type' | 'clearable' | 'onClear' | 'clearLabel' | 'trailing'> & {
  /** Convenience over onChange: receives the ISO date string ("2026-10-31") or "" when cleared. */
  onValueChange?: (value: string) => void
}

/** Native date input in the Input frame. Value format is always YYYY-MM-DD. */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { onValueChange, onChange, ...rest },
  ref,
) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event)
    onValueChange?.(event.target.value)
  }

  return <Input {...rest} ref={ref} type="date" onChange={handleChange} />
})
