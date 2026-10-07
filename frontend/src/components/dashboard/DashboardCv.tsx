import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { Button, ErrorState, List, Row, RowActions, RowBody, RowSubtitle, RowTitle, Section, Skeleton } from '#/components/kit'
import { useDashboardCv } from '#/components/dashboard/useDashboardCv'
import { formatRunDate } from '#/components/dashboard/RunRow'

/** Once there is a CV, one row that opens CV Studio. Without one, the page leads with the upload instead. */
export function DashboardCv() {
  const { latest, pending, isError, fetching, retry } = useDashboardCv()

  if (pending) {
    return (
      <Section title="Your CV">
        <List aria-busy aria-label="Your CV">
          <Skeleton variant="row" as="li" />
        </List>
      </Section>
    )
  }

  if (!latest) {
    return isError ? (
      <Section title="Your CV">
        <ErrorState icon={<AlertTriangle aria-hidden />} title="Your CV couldn't be loaded" onRetry={retry} retrying={fetching} />
      </Section>
    ) : null
  }

  return (
    <Section title="Your CV">
      <List>
        <Row>
          <RowBody>
            <RowTitle>{latest.name}</RowTitle>
            <RowSubtitle>Edited {formatRunDate(latest.updated_at)}</RowSubtitle>
          </RowBody>
          <RowActions reveal={false}>
            <Button asChild variant="secondary" size="sm">
              {/* Under 360px only "Open" shows (dashboard.css), so the CV name keeps the row; the name stays whole. */}
              <Link to="/cv-studio">
                {/* One flex item: the button's gap would otherwise open between "Open" and the rest. */}
                <span>
                  Open <span className="dash-cv__more">CV Studio</span>
                </span>
              </Link>
            </Button>
          </RowActions>
        </Row>
      </List>
    </Section>
  )
}
