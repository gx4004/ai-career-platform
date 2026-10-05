import { Sticker, ToolTile } from '#/components/kit'
import { toolList } from '#/lib/tools/registry'

/**
 * Wide-screen decoration beside the form: the same stickers the product is made of, saying only what is true
 * (guests can try every tool, an account keeps the work). The six tool tiles come from the registry.
 */
export function AuthAside() {
  return (
    <>
      <Sticker as="div" tone="white" size="sm" tilt={-2} className="auth-aside__tag">
        <strong>Free account</strong>
      </Sticker>
      <Sticker tone="lemon" tilt={-1.6}>
        <p className="auth-aside__title">Keep your work</p>
        <p>Runs, favorites and CV drafts stay with your account, across every tool.</p>
      </Sticker>
      <Sticker tone="mint" tilt={1.2}>
        <p className="auth-aside__title">Try first</p>
        <p>Every tool works as a guest. Guest results are just not saved.</p>
      </Sticker>
      <div className="auth-aside__tools">
        {toolList.map((tool) => (
          <ToolTile key={tool.id} tone={tool.tone} icon={tool.icon} size="md" />
        ))}
      </div>
    </>
  )
}
