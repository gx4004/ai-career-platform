import { Fragment } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  MetaRow,
  Notice,
  Page,
  PageHeader,
  Stack,
  Table,
  useToast,
} from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import {
  getAdminDiscoverySources,
  setDiscoverySourceKillSwitch,
} from '#/lib/api/admin'
import type { DiscoverySource } from '#/lib/api/discoverySchemas'
import { describeFailure } from './source-failure'
import { adminDate, adminDateTime } from './toolLabel'

/** A URL breaks after its slashes, never in the middle of a word. */
function BreakableUrl({ value }: { value: string }) {
  return (
    <>
      {value.split(/(?<=\/)/).map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </>
  )
}

/** The one value every source shares, or null when they differ or there is only one source. */
function sharedValue(sources: DiscoverySource[], pick: (source: DiscoverySource) => string) {
  if (sources.length < 2) return null
  const first = pick(sources[0])
  return sources.every((source) => pick(source) === first) ? first : null
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export function AdminDiscoverySourcesPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['admin-discovery-sources'],
    queryFn: getAdminDiscoverySources,
    staleTime: 30_000,
  })

  const killSwitch = useMutation({
    mutationFn: ({ sourceId, tripped }: { sourceId: string; tripped: boolean }) =>
      setDiscoverySourceKillSwitch(sourceId, tripped),
    onSuccess: (source, { tripped }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-discovery-sources'] })
      toast({
        tone: 'success',
        title: tripped ? `Kill switch tripped for ${source.display_name}` : `Kill switch cleared for ${source.display_name}`,
      })
    },
  })

  const pendingId =
    killSwitch.isPending && killSwitch.variables ? killSwitch.variables.sourceId : null
  // One change at a time, and a new one starts from a clean slate: no stale failure notice from the last click.
  const change = (sourceId: string, tripped: boolean) => {
    killSwitch.reset()
    killSwitch.mutate({ sourceId, tripped })
  }

  const sources = data?.items ?? []
  const sharedOwner = sharedValue(sources, (source) => source.owner)
  const sharedFamily = sharedValue(sources, (source) => source.source_family)
  const failing = sources.filter((source) => source.last_fetched_at && source.last_outcome !== 'ok').length

  const columns: TableColumn<DiscoverySource>[] = [
    {
      id: 'source',
      header: 'Source',
      primary: true,
      cell: (source) => (
        <>
          {source.display_name}
          <MetaRow>
            <span className="admin-mono">{source.source_key}</span>
            {sharedFamily ? null : source.source_family}
            {sharedOwner ? null : source.owner}
          </MetaRow>
          <span className="admin-subline admin-wrap">
            {source.endpoint_url ? <BreakableUrl value={source.endpoint_url} /> : 'Endpoint not configured'}
          </span>
          <Disclosure variant="inline" title="Policy">
            <p className="admin-subline">{source.allowed_behavior}</p>
            <p className="admin-subline">{source.attribution_rule}</p>
          </Disclosure>
        </>
      ),
    },
    {
      id: 'terms',
      header: 'Terms review',
      cell: (source) => (
        <div>
          {source.terms_status === 'accepted' ? (
            capitalize(source.terms_status)
          ) : (
            <Badge tone="warning">{capitalize(source.terms_status)}</Badge>
          )}
          <MetaRow>
            {source.terms_reviewed_at ? adminDate(source.terms_reviewed_at) : 'Not reviewed'}
            {source.terms_reviewed_by ? `by ${source.terms_reviewed_by}` : null}
          </MetaRow>
        </div>
      ),
    },
    {
      id: 'bounds',
      header: 'Bounds',
      nowrap: true,
      cell: (source) => (
        <MetaRow>
          {`${source.rate_limit_per_minute}/minute`}
          {`Retain ${source.retention_days} days`}
        </MetaRow>
      ),
    },
    {
      id: 'ingestion',
      header: 'Ingestion',
      nowrap: true,
      cell: (source) => (
        <div>
          {source.ingestion_allowed ? 'Allowed' : 'Refused'}
          {source.kill_switch ? <span className="admin-subline">Kill switch on</span> : null}
        </div>
      ),
    },
    { id: 'fetch', header: 'Last fetch', cell: (source) => <LastFetch source={source} /> },
    {
      id: 'kill-switch',
      header: 'Kill switch',
      hideHeader: true,
      align: 'end',
      stackLabel: false,
      cell: (source) => (
        <KillSwitchControl
          source={source}
          busy={pendingId === source.id}
          locked={killSwitch.isPending}
          onTrip={() => change(source.id, true)}
          onClear={() => change(source.id, false)}
        />
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Discovery sources"
        lead="A source can ingest only after an accepted terms review and while its kill switch is off. Tripping the kill switch halts it immediately, with no deploy or restart."
        meta={
          data
            ? [
                `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`,
                failing > 0 ? `${failing} failed their last fetch` : null,
                sharedFamily ? `Family: ${sharedFamily}` : null,
                sharedOwner ? `Owner: ${sharedOwner}` : null,
              ]
            : undefined
        }
      />

      <Stack gap={3}>
        {killSwitch.isError ? (
          <Notice tone="danger" onDismiss={() => killSwitch.reset()}>
            Kill-switch change failed. A source cannot be cleared before its terms review is accepted.
          </Notice>
        ) : null}

        {isError ? (
          <ErrorState
            title="Couldn't load discovery sources"
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : (
          <Table
            caption="Discovery sources"
            density="compact"
            columns={columns}
            rows={sources}
            getRowId={(source) => source.id}
            loading={isLoading}
            empty={
              <EmptyState
                title="No discovery sources are registered."
                description="Ingestion remains disabled."
              />
            }
          />
        )}
      </Stack>
    </Page>
  )
}

function LastFetch({ source }: { source: DiscoverySource }) {
  if (!source.last_fetched_at) {
    return <Badge tone="neutral">Never fetched</Badge>
  }
  const reason = describeFailure(source.last_outcome)
  const count = source.listing_count
  return (
    <div>
      {reason ? <Badge tone="danger">Failed</Badge> : <Badge tone="success">OK</Badge>}
      {reason ? (
        <>
          <span className="admin-reason">{reason}</span>
        </>
      ) : null}
      <MetaRow>
        {adminDateTime(source.last_fetched_at)}
        {count === null || count === undefined ? 'No listing count yet' : `${count} ${count === 1 ? 'listing' : 'listings'}`}
      </MetaRow>
      {reason ? (
        <Disclosure variant="inline" title="Error detail">
          <p className="admin-subline admin-mono admin-wrap">{source.last_outcome}</p>
        </Disclosure>
      ) : null}
    </div>
  )
}

function KillSwitchControl({
  source,
  busy,
  locked,
  onTrip,
  onClear,
}: {
  source: DiscoverySource
  busy: boolean
  locked: boolean
  onTrip: () => void
  onClear: () => void
}) {
  if (source.kill_switch) {
    const canClear = source.terms_status === 'accepted'
    return (
      <div className="admin-action">
        <Button size="sm" variant="secondary" disabled={!canClear || locked} loading={busy} onClick={onClear}>
          Clear kill switch
        </Button>
        {!canClear ? <span className="admin-subline">Accept terms review to clear.</span> : null}
      </div>
    )
  }
  return (
    <Button size="sm" variant="secondary" loading={busy} disabled={locked} onClick={onTrip}>
      Trip kill switch
    </Button>
  )
}
