import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type DragEvent,
  type ReactNode,
} from 'react'
import { Upload, X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button, type ButtonSize, type ButtonVariant } from './button'
import { useFieldControl } from './field'
import { useMergedRef } from './utils'

export type FileInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'size' | 'value' | 'defaultValue' | 'children' | 'prefix'
> & {
  /** Text of the visible trigger. Default "Choose file" ("Choose files" with `multiple`). */
  label?: string
  /** Quiet line beside the trigger while nothing is chosen: "PDF or DOCX, up to 5 MB". */
  hint?: ReactNode
  /** inline: trigger and file name on one row. dropzone: a bordered area that also accepts a dropped file. Default inline. */
  variant?: 'inline' | 'dropzone'
  /** Look of the trigger button. Default secondary. */
  buttonVariant?: Extract<ButtonVariant, 'primary' | 'secondary' | 'ghost'>
  size?: ButtonSize
  invalid?: boolean
  /** Receives the chosen files (an empty array when cleared). The native onChange still fires for picks. */
  onFilesChange?: (files: File[]) => void
  /** Accessible name of the remove button. Default "Remove file" ("Remove files" with `multiple`). */
  removeLabel?: string
  /** Show a remove button once something is chosen. Default true. */
  clearable?: boolean
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * A native file input behind a kit Button-looking trigger. The real <input type="file"> stays in the tab
 * order (visually hidden), so Space and Enter open the picker and a form posts it as usual. Name it with a
 * surrounding Field label; the trigger text is read after it. Shows the chosen file name and size, and a
 * remove button. `variant="dropzone"` also accepts a dropped file. `className` goes on the wrapper; `ref`
 * and native props (`accept`, `name`, `multiple`, `onChange`, `data-testid`) go to the <input>.
 */
export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(function FileInput(props, ref) {
  const {
    label,
    hint,
    variant = 'inline',
    buttonVariant = 'secondary',
    size = 'md',
    invalid: invalidProp,
    onFilesChange,
    onChange,
    removeLabel,
    clearable = true,
    className,
    id: idProp,
    required: requiredProp,
    disabled: disabledProp,
    multiple,
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

  const generated = useId()
  const inputId = field.id ?? `kit-file-${generated}`
  const triggerId = `${inputId}-trigger`
  const inputRef = useRef<HTMLInputElement>(null)
  const mergedRef = useMergedRef(ref, inputRef)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)

  const commit = (next: File[]) => {
    setFiles(next)
    onFilesChange?.(next)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event)
    commit(Array.from(event.target.files ?? []))
  }

  const clear = () => {
    const input = inputRef.current
    if (input) input.value = ''
    commit([])
    input?.focus()
  }

  const dropHandlers =
    variant === 'dropzone' && !field.disabled
      ? {
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            setDragging(true)
          },
          onDragLeave: (event: DragEvent<HTMLDivElement>) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          },
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            setDragging(false)
            const input = inputRef.current
            const dropped = event.dataTransfer.files
            if (!input || dropped.length === 0) return
            // Hand the files to the real input so forms, `accept` and onChange all behave as for a normal pick.
            if (multiple) {
              input.files = dropped
            } else {
              const transfer = new DataTransfer()
              transfer.items.add(dropped[0])
              input.files = transfer.files
            }
            input.dispatchEvent(new Event('change', { bubbles: true }))
          },
        }
      : {}

  const hintId = hint && files.length === 0 ? `${inputId}-hint` : undefined
  const triggerText = label ?? (multiple ? 'Choose files' : 'Choose file')
  const describedBy = [hintId, field.describedBy].filter(Boolean).join(' ') || undefined
  const labelledBy = [field.labelledBy, triggerId].filter(Boolean).join(' ')

  return (
    <div
      className={cn('kit-file', className)}
      data-variant={variant}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
      data-dragging={dragging || undefined}
      data-has-file={files.length > 0 || undefined}
      {...dropHandlers}
    >
      <input
        {...rest}
        ref={mergedRef}
        id={inputId}
        type="file"
        className="kit-file__input"
        multiple={multiple}
        required={field.required || undefined}
        disabled={field.disabled}
        aria-invalid={field.invalid || undefined}
        aria-describedby={describedBy}
        aria-labelledby={rest['aria-label'] ? undefined : labelledBy}
        onChange={handleChange}
      />
      <label
        id={triggerId}
        htmlFor={inputId}
        className={cn('kit-button', `kit-button--${buttonVariant}`, `kit-button--${size}`, 'kit-file__trigger')}
        data-disabled={field.disabled ? 'true' : undefined}
      >
        <Upload aria-hidden="true" />
        {triggerText}
      </label>
      <div className="kit-file__info">
        {files.length > 0 ? (
          <p className="kit-file__names" data-testid="kit-file-names">
            {files.length === 1 ? (
              <>
                <span className="kit-file__name">{files[0].name}</span>
                <span className="kit-file__size">{formatSize(files[0].size)}</span>
              </>
            ) : (
              <>
                <span className="kit-file__name">{files.length} files</span>
                <span className="kit-file__size">{formatSize(files.reduce((sum, file) => sum + file.size, 0))}</span>
              </>
            )}
          </p>
        ) : hint ? (
          <p id={hintId} className="kit-file__hint">
            {hint}
          </p>
        ) : null}
      </div>
      {files.length > 0 && clearable && !field.disabled ? (
        <Button
          type="button"
          iconOnly
          variant="ghost"
          size="sm"
          className="kit-file__remove"
          aria-label={removeLabel ?? (multiple ? 'Remove files' : 'Remove file')}
          onClick={clear}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
})
