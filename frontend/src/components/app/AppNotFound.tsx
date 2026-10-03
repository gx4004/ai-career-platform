import { Link } from '@tanstack/react-router'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { useSession } from '#/hooks/useSession'
import { toolList } from '#/lib/tools/registry'

export function AppNotFound() {
  const { status } = useSession()
  const signedIn = status === 'authenticated'
  return (
    <AppStatePanel
      title="Page not found"
      description="Error 404. This page does not exist, or the link is out of date."
      actions={
        signedIn
          ? [
              { label: 'Go to dashboard', to: '/dashboard' },
              { label: 'Back to home', to: '/', variant: 'outline' },
            ]
          : [{ label: 'Back to home', to: '/' }]
      }
    >
      <nav className="state-page__tools" aria-label="Tools">
        <p className="state-page__code">Or open a tool</p>
        <ul>
          {toolList.map((tool) => (
            <li key={tool.id}>
              <Link to={tool.route}>{tool.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </AppStatePanel>
  )
}
