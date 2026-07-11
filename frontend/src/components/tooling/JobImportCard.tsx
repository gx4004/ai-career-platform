import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { SampleQuickfill } from '#/components/tooling/SampleQuickfill'
import { importJobUrl } from '#/lib/api/client'
import { SAMPLE_JOB_DESCRIPTION } from '#/lib/tools/sampleContent'

export function JobImportCard({
  onImported,
}: {
  onImported: (description: string) => void
}) {
  const [url, setUrl] = useState('')
  const mutation = useMutation({
    mutationFn: importJobUrl,
    onSuccess: (data) => {
      onImported(data.job_description)
    },
  })

  return (
    <div className="import-card p-4">
      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Link2 size={16} style={{ color: 'var(--text-muted)' }} />
          <p className="section-title">Import from job URL</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste the job posting URL"
          />
          <Button
            type="button"
            onClick={() => mutation.mutate({ url })}
            disabled={mutation.isPending || !url.trim()}
          >
            {mutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        </div>
        {mutation.error ? (
          <p className="small-copy" style={{ color: 'var(--destructive)' }}>
            {mutation.error instanceof Error ? mutation.error.message : 'Job import failed.'}
          </p>
        ) : null}
        {/* R7 #111 sample quick-fill ships dark: renders nothing unless VITE_R7_SAMPLE_QUICKFILL=true. */}
        <SampleQuickfill
          label="Try a sample job description"
          onUse={() => onImported(SAMPLE_JOB_DESCRIPTION)}
        />
      </div>
    </div>
  )
}
