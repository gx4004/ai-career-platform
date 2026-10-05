import { Undo2 } from 'lucide-react'
import {
  Button,
  EmptyState,
  ErrorState,
  List,
  MetaRow,
  Row,
  RowActions,
  RowBody,
  RowSubtitle,
  RowTitle,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '#/components/kit'
import { formatDate } from '#/components/applications/stages'
import type { HiddenListing } from '#/lib/api/schemas'

/**
 * The jobs the owner hid, each restorable. Hiding is the owner's data (D-090): it must not be
 * a one-way door that only a toast could undo.
 */
export function HiddenJobsSheet({
  open,
  onOpenChange,
  items,
  loading,
  failed,
  onRetry,
  onRestore,
  restoringId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: HiddenListing[]
  loading: boolean
  failed: boolean
  onRetry: () => void
  onRestore: (listing: HiddenListing) => void
  restoringId?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>Hidden jobs</SheetTitle>
          <SheetDescription>
            Jobs you hid stay out of Discover and your best matches. Restore one to see it again.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {loading ? (
            <List aria-label="Hidden jobs" aria-busy="true" framed={false}>
              <Skeleton variant="row" as="li" count={3} />
            </List>
          ) : failed ? (
            <ErrorState
              headingLevel={3}
              title="Hidden jobs could not be loaded"
              description="Something went wrong on our side."
              onRetry={onRetry}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Undo2 aria-hidden="true" />}
              headingLevel={3}
              title="Nothing is hidden"
              description="Jobs you hide from Discover show up here."
            />
          ) : (
            <List aria-label="Hidden jobs" framed={false}>
              {items.map((job) => (
                <Row key={job.listing_id}>
                  <RowBody>
                    <RowTitle>{job.title}</RowTitle>
                    <RowSubtitle>
                      <MetaRow>
                        <strong>{job.company}</strong>
                        {job.location}
                        {`Hidden ${formatDate(job.hidden_at)}`}
                      </MetaRow>
                    </RowSubtitle>
                  </RowBody>
                  <RowActions reveal={false}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      aria-label={`Restore ${job.title}`}
                      loading={restoringId === job.listing_id}
                      onClick={() => onRestore(job)}
                    >
                      Restore
                    </Button>
                  </RowActions>
                </Row>
              ))}
            </List>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
