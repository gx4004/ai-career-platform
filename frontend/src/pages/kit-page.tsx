import { ToastProvider, TooltipProvider } from '#/components/kit'
import { KIT_SECTIONS } from './kit/sections'

/** Hidden component gallery at /_kit: every kit component in every variant, size and state. */
export function KitPage() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="kit-gallery">
          <aside className="kit-gallery__nav">
            <p className="kit-gallery__brand">Kit</p>
            <nav aria-label="Kit sections">
              <ul className="kit-gallery__index">
                {KIT_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
          <main className="kit-gallery__main">
            <header className="kit-gallery__head">
              <h1 className="kit-gallery__title">Component kit</h1>
              <p className="kit-gallery__lede">
                One component per job, in every variant, size and state. Hover, press and Tab through anything here.
                Internal reference page: not linked from the app.
              </p>
            </header>
            {KIT_SECTIONS.map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </main>
        </div>
      </ToastProvider>
    </TooltipProvider>
  )
}
