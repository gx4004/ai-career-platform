import { createContext, useContext, useId, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '#/lib/utils'

type FieldContextValue = {
  controlId: string
  labelId: string | undefined
  describedBy: string | undefined
  invalid: boolean
  required: boolean
  disabled: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

export type FieldProps = {
  /** Visible label. Omit it when the control names itself (Checkbox, Switch). */
  label?: ReactNode
  /** Keep the label for assistive tech and hide it visually (toolbar search boxes). */
  hideLabel?: boolean
  /** Shows the quiet "Optional" marker after the label. */
  optional?: boolean
  /** Marks the control required (native `required`). No visible asterisk: mark the optional ones instead. */
  required?: boolean
  help?: ReactNode
  /** Error message. Sets aria-invalid on the control and is announced when it appears. */
  error?: ReactNode
  disabled?: boolean
  /** Base id for the control; generated when omitted. */
  id?: string
  /**
   * Label a group of controls that name themselves (a list of highlights, a row of inputs): the wrapper becomes
   * `role="group"` named by the label, with the same 14px label and 8px gap as a single field. The controls inside are
   * not tied to the label (each keeps its own name), so help and error describe the group, not a control.
   */
  group?: boolean
  className?: string
  children: ReactNode
}

/**
 * Label, help and error text around exactly one control. The control inherits
 * its id, aria-describedby, aria-invalid, required and disabled from here.
 */
export function Field({
  label,
  hideLabel = false,
  optional = false,
  required = false,
  help,
  error,
  disabled = false,
  id,
  group = false,
  className,
  children,
}: FieldProps) {
  const generated = useId()
  const controlId = id ?? `kit-field-${generated}`
  const labelId = `${controlId}-label`
  const helpId = help ? `${controlId}-help` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined
  const invalid = Boolean(error)

  if (group) {
    return (
      <div
        role="group"
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={describedBy}
        className={cn('kit-field', className)}
        data-group="true"
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
      >
        {label ? (
          <span id={labelId} className={cn('kit-field__label', hideLabel && 'kit-sr-only')}>
            {label}
            {optional ? <span className="kit-field__marker">Optional</span> : null}
          </span>
        ) : null}
        {/* Each control keeps its own name: nothing here (or around the group) hands it an id or a label. */}
        <FieldContext.Provider value={null}>{children}</FieldContext.Provider>
        {help ? (
          <p id={helpId} className="kit-field__help">
            {help}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="kit-field__error" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <FieldContext.Provider value={{ controlId, labelId: label ? labelId : undefined, describedBy, invalid, required, disabled }}>
      <div className={cn('kit-field', className)} data-invalid={invalid || undefined} data-disabled={disabled || undefined}>
        {label ? (
          <label id={labelId} htmlFor={controlId} className={cn('kit-field__label', hideLabel && 'kit-sr-only')}>
            {label}
            {optional ? <span className="kit-field__marker">Optional</span> : null}
          </label>
        ) : null}
        {children}
        {help ? (
          <p id={helpId} className="kit-field__help">
            {help}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="kit-field__error" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

type FieldControlInput = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling'
  'aria-labelledby'?: string
  invalid?: boolean
  required?: boolean
  disabled?: boolean
}

/**
 * Used by every kit control: merges its own props with what the surrounding
 * Field provides. Explicit props always win over the Field's values.
 */
export function useFieldControl(props: FieldControlInput) {
  const field = useContext(FieldContext)
  const ariaInvalid = props['aria-invalid']
  const invalid =
    props.invalid ?? (ariaInvalid !== undefined ? ariaInvalid === true || ariaInvalid === 'true' : (field?.invalid ?? false))
  const describedBy = [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined

  return {
    id: props.id ?? field?.controlId,
    labelledBy: props['aria-labelledby'] ?? field?.labelId,
    describedBy,
    invalid,
    required: props.required ?? field?.required ?? false,
    disabled: props.disabled ?? field?.disabled ?? false,
  }
}
