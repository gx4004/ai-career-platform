import { Link } from '@tanstack/react-router'
import { useSession } from '#/hooks/useSession'
import { getNavDestination } from '#/lib/navigation/navGroups'
import { tools, type ToolId } from '#/lib/tools/registry'

const TOOL_ORDER: ToolId[] = ['resume', 'job-match', 'career', 'cover-letter', 'interview', 'portfolio']

type Row = { key: string; label: string; copy: string; route: string; Icon: React.ComponentType<{ size?: number }> }

/**
 * Compact list of the six tools, plus CV Studio and (signed in only) Discover
 * and Applications, which redirect guests to login.
 */
export function DashboardTools() {
  const { status } = useSession()
  const isAuthenticated = status === 'authenticated'

  const rows: Row[] = TOOL_ORDER.map((id) => ({
    key: id,
    label: tools[id].label,
    copy: tools[id].summary,
    route: tools[id].route,
    Icon: tools[id].icon,
  }))
  const more: Row[] = [
    {
      key: 'cv-studio',
      label: 'CV Studio',
      copy: 'Build and tailor CV versions from your evidence.',
      route: '/cv-studio',
      Icon: getNavDestination('/cv-studio').icon,
    },
  ]
  if (isAuthenticated) {
    more.push(
      {
        key: 'discovery',
        label: 'Discover jobs',
        copy: 'Browse live roles ranked against your profile.',
        route: '/discovery',
        Icon: getNavDestination('/discovery').icon,
      },
      {
        key: 'campaigns',
        label: 'Your applications',
        copy: 'Track every application you have saved.',
        route: '/campaigns',
        Icon: getNavDestination('/campaigns').icon,
      },
    )
  }

  return (
    <section className="dash-section" aria-labelledby="dash-tools" data-tour="quick-start">
      <div className="dash-section__head">
        <h2 className="dash-section__title" id="dash-tools">Tools</h2>
      </div>
      <ul className="dash-tools">
        {[...rows, ...more].map(({ key, label, copy, route, Icon }) => (
          <li key={key}>
            <Link to={route} className="dash-tool">
              <Icon size={15} aria-hidden="true" />
              <span className="dash-tool__name">{label}</span>
              <span className="dash-tool__copy">{copy}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
