import { Button } from '#/components/kit'

/** The provider button of the sign-in and sign-up forms: secondary, so the form's own submit stays the one primary. */
export function GoogleButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="lg" className="auth-wide" onClick={onClick}>
      <img src="/google-g.svg" alt="" width={16} height={16} className="auth-google-mark" />
      {children}
    </Button>
  )
}
