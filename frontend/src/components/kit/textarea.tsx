import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
} from 'react'
import { cn } from '#/lib/utils'
import { useFieldControl } from './field'
import { useMergedRef } from './utils'

export type TextareaProps = ComponentPropsWithoutRef<'textarea'> & {
  invalid?: boolean
  /** Grow with the content instead of scrolling; replaces AutoGrowTextarea. */
  autosize?: boolean
  /** With autosize: stop growing after this many rows and scroll. */
  maxRows?: number
  /** Reading-length text (a letter's paragraphs): 17px / 1.6 instead of the 15px form-field type. */
  prose?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(props, ref) {
  const {
    invalid: invalidProp,
    autosize = false,
    maxRows,
    prose = false,
    rows,
    className,
    id: idProp,
    required: requiredProp,
    disabled: disabledProp,
    readOnly,
    onChange,
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

  const innerRef = useRef<HTMLTextAreaElement>(null)
  const mergedRef = useMergedRef(ref, innerRef)

  const measure = () => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    delete el.dataset.capped
    const styles = getComputedStyle(el)
    const px = (value: string) => parseFloat(value) || 0
    const borders = px(styles.borderTopWidth) + px(styles.borderBottomWidth)
    const lineHeight = px(styles.lineHeight) || 20
    const paddingBottom = px(styles.paddingBottom)
    const full = el.scrollHeight + borders
    const max = maxRows ? lineHeight * maxRows + px(styles.paddingTop) + paddingBottom + borders : Infinity
    const capped = full > max
    // A capped box ends exactly on a line boundary: with bottom padding the top of the next line would show in it.
    if (capped) el.dataset.capped = 'true'
    el.style.height = `${capped ? max - paddingBottom : full}px`
    el.style.overflowY = capped ? 'auto' : 'hidden'
  }

  const value = rest.value
  useLayoutEffect(() => {
    if (!autosize) return
    measure()
    const el = innerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return
      lastWidth = el.clientWidth
      measure()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [autosize, maxRows, value])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (autosize) measure()
    onChange?.(event)
  }

  return (
    <textarea
      {...rest}
      ref={mergedRef}
      id={field.id}
      rows={rows ?? (autosize ? 2 : 3)}
      className={cn('kit-textarea', className)}
      data-autosize={autosize || undefined}
      data-prose={prose || undefined}
      data-invalid={field.invalid || undefined}
      data-disabled={field.disabled || undefined}
      data-readonly={readOnly || undefined}
      aria-describedby={field.describedBy}
      aria-invalid={field.invalid || undefined}
      required={field.required || undefined}
      disabled={field.disabled}
      readOnly={readOnly}
      onChange={handleChange}
    />
  )
})
