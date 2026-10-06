import { createFileRoute } from '@tanstack/react-router'
import { KitPage } from '#/pages/kit-page'

// Hidden component gallery: public, unlinked, noindex. The leading underscore
// would make this a pathless layout, so it is escaped as [_] in the file name.
export const Route = createFileRoute('/_kit')({
  head: () => ({
    meta: [{ title: 'Kit | Career Workbench' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: KitPage,
})
