import { clsx, type ClassValue } from 'clsx'

// Plain clsx: no Tailwind utility classes remain in the app, so tailwind-merge had nothing to resolve.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
