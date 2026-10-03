import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'

/** Gap scale in 4px steps: 1 = 4px, 2 = 8, 3 = 12, 4 = 16, 6 = 24, 8 = 32. */
export type Gap = 1 | 2 | 3 | 4 | 6 | 8

export type StackProps = ComponentPropsWithoutRef<'div'> & {
  /** Space between children. Default 4 (16px). */
  gap?: Gap
}

/** Children in a column with one consistent gap. Replaces per-page `display: grid; gap` wrappers. */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack({ gap = 4, className, ...rest }, ref) {
  return <div ref={ref} className={cn('kit-stack', className)} data-gap={gap} {...rest} />
})

export type ClusterProps = ComponentPropsWithoutRef<'div'> & {
  /** Space between children. Default 2 (8px). */
  gap?: Gap
  align?: 'start' | 'center' | 'end' | 'baseline'
  justify?: 'start' | 'end' | 'between'
  /** Keep children on one line instead of wrapping. */
  nowrap?: boolean
}

/** Children in a row that wraps: button groups, filter rows, badge lines. Centred vertically by default. */
export const Cluster = forwardRef<HTMLDivElement, ClusterProps>(function Cluster(
  { gap = 2, align = 'center', justify = 'start', nowrap = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('kit-cluster', className)}
      data-gap={gap}
      data-align={align}
      data-justify={justify}
      data-nowrap={nowrap ? 'true' : undefined}
      {...rest}
    />
  )
})
