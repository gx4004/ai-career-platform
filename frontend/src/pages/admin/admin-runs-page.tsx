import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  KeyValue,
  Notice,
  Page,
  PageHeader,
  Pagination,
  Section,
  Select,
  Skeleton,
  Stack,
  StretchedLink,
  Table,
  ToolTile,
} from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import { getAdminRuns, getAdminRun } from '#/lib/api/admin'
import type { AdminRunItem, AdminRunListResponse, AdminRunDetail } from '#/lib/api/admin'
import { ADMIN_TOOL_IDS, adminDateTime, labelNamesTool, toolLabel, toolVisual } from './toolLabel'
import { countMeta } from './count-meta'

export function AdminRunsPage() {
  const [page, setPage] = useState(1)
  const [toolFilter, setToolFilter] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedRunId(null)
  }, [toolFilter])

  const { data, isLoading, isError, isFetching, refetch } = useQuery<AdminRunListResponse>({
    queryKey: ['admin-runs', page, toolFilter],
    queryFn: () => getAdminRuns({ page, page_size: 20, tool: toolFilter || undefined }),
    staleTime: 30_000,
  })

  const runDetail = useQuery<AdminRunDetail>({
    queryKey: ['admin-run', selectedRunId],
    queryFn: () => getAdminRun(selectedRunId!),
    enabled: !!selectedRunId,
  })

  const rangeStart = data ? (data.page - 1) * data.page_size + 1 : 0
  const rangeEnd = data ? Math.min(data.page * data.page_size, data.total) : 0
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  const columns: TableColumn<AdminRunItem>[] = [
    {
      id: 'run',
      header: 'Run',
      primary: true,
      cell: (run) => {
        const title = run.label || toolLabel(run.tool_name)
        const visual = toolVisual(run.tool_name)
        return (
          <span className="admin-run">
            <ToolTile size="sm" tone={visual.tone} icon={visual.icon} />
            <span>
              <StretchedLink asChild>
                <button type="button" onClick={() => setSelectedRunId(run.id)}>
                  {title}
                </button>
              </StretchedLink>
              {run.label && !labelNamesTool(run.label, run.tool_name) ? (
                <span className="admin-subline">{toolLabel(run.tool_name)}</span>
              ) : null}
            </span>
          </span>
        )
      },
    },
    // Stacked on a phone the address gets the full line, unlabelled, instead of wrapping inside a narrow value column.
    {
      id: 'user',
      header: 'User',
      width: '20rem',
      stackLabel: false,
      cell: (run) => <span className="admin-wrap">{run.user_email || run.user_id.slice(0, 8)}</span>,
    },
    { id: 'created', header: 'Created', width: '11rem', nowrap: true, cell: (run) => adminDateTime(run.created_at) || '—' },
  ]

  const detail = runDetail.data

  return (
    <Page>
      <PageHeader
        title="Runs"
        meta={countMeta(data ? `${data.total} ${data.total === 1 ? 'run' : 'runs'}` : null, isLoading)}
      />

      <Stack gap={3}>
        <Select
          leading="Tool"
          aria-label="Tool"
          className="admin-filter"
          value={toolFilter}
          onChange={(e) => {
            setToolFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All tools</option>
          {ADMIN_TOOL_IDS.map((t) => (
            <option key={t} value={t}>
              {toolLabel(t)}
            </option>
          ))}
        </Select>

        {isError ? (
          <ErrorState title="Couldn't load runs" onRetry={() => void refetch()} retrying={isFetching} />
        ) : (
          <Table
            caption="Runs"
            density="compact"
            columns={columns}
            rows={data?.items ?? []}
            getRowId={(run) => run.id}
            loading={isLoading}
            selectedRowId={selectedRunId}
            empty={<EmptyState icon={<Search />} title="No runs found" />}
          />
        )}

        <Pagination
          variant="simple"
          aria-label="Runs pages"
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={data ? `Showing ${rangeStart}–${rangeEnd} of ${data.total}` : undefined}
        />
      </Stack>

      <Dialog open={selectedRunId !== null} onOpenChange={(open) => !open && setSelectedRunId(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Run detail</DialogTitle>
            <DialogDescription visuallyHidden>The saved result of one run.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {runDetail.isLoading ? <Skeleton lines={4} label="Loading run detail" /> : null}
            {runDetail.isError ? <Notice tone="danger">Failed to load run detail.</Notice> : null}
            {detail ? (
              <Stack gap={6}>
                <KeyValue
                  items={[
                    { label: 'Tool', value: toolLabel(detail.tool_name) },
                    { label: 'User', value: detail.user_email || detail.user_id },
                    { label: 'Label', value: detail.label },
                    { label: 'Created', value: adminDateTime(detail.created_at) },
                    ...(detail.feedback_text ? [{ label: 'Feedback', value: detail.feedback_text }] : []),
                  ]}
                />
                <Section title="Result payload" headingLevel={3} size="sm">
                  <pre className="admin-json-viewer">{JSON.stringify(detail.result_payload, null, 2)}</pre>
                </Section>
              </Stack>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
