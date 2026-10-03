import type { ComponentPropsWithoutRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input } from '#/components/kit'

type PasswordInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, 'type' | 'trailing' | 'clearable'> & {
  shown: boolean
  onShownChange: (shown: boolean) => void
}

/** A password field with the show/hide control inside its frame. Put it in a Field for the label and errors. */
export function PasswordInput({ shown, onShownChange, ...props }: PasswordInputProps) {
  return (
    <Input
      {...props}
      type={shown ? 'text' : 'password'}
      trailing={
        <Button
          type="button"
          iconOnly
          size="sm"
          variant="ghost"
          aria-label={shown ? 'Hide password' : 'Show password'}
          onClick={() => onShownChange(!shown)}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      }
    />
  )
}
