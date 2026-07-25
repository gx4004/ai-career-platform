import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  listSubmissionAuthorizations,
  revokeSubmissionAuthorization,
  submissionAuthorizationQueryKey,
} from '#/lib/api/submissionAuthorizations'
import type { SubmissionAuthorization } from '#/lib/api/submissionAuthorizationSchemas'

const MECHANISM_LABELS: Record<SubmissionAuthorization['mechanism'], string> = {
  oauth2_authorization_code: 'OAuth 2 authorization code',
  oauth2_device_authorization: 'OAuth 2 device authorization',
}

const FAMILY_LABELS: Record<SubmissionAuthorization['source_family'], string> = {
  licensed: 'Licensed source',
  employer_ats: 'Employer ATS',
  public_career_page: 'Public career page',
  user_provided: 'User-provided source',
}

export function SubmissionAuthorizationsCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const queryKey = submissionAuthorizationQueryKey(userId)
  const query = useQuery({
    queryKey,
    queryFn: listSubmissionAuthorizations,
    staleTime: 30_000,
  })
  const revoke = useMutation({
    mutationFn: (grantId: string) => revokeSubmissionAuthorization(grantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <div className="account-card">
      <div className="account-card-header">
        <div className="account-card-icon">
          <KeyRound size={18} />
        </div>
        <div>
          <h2 className="account-card-title">Submission authorizations</h2>
          <p className="account-card-description">
            Each active authorization applies to one supported source. Revoking it
            stops work pinned to that grant immediately.
          </p>
        </div>
      </div>

      {query.isLoading && (
        <p className="small-copy muted-copy" role="status" aria-live="polite">
          Loading active authorizations…
        </p>
      )}
      {query.isError && (
        <p className="small-copy text-destructive" role="alert">
          Active submission authorizations could not be loaded.
        </p>
      )}
      {revoke.isError && (
        <p className="small-copy text-destructive" role="alert">
          Authorization could not be revoked. Try again.
        </p>
      )}
      {query.data?.items.length === 0 && (
        <p className="small-copy muted-copy" role="status" aria-live="polite">
          You have not authorized submission for any source.
        </p>
      )}
      {query.data && query.data.items.length > 0 && (
        <div className="grid gap-3">
          {query.data.items.map((grant) => (
            <div key={grant.id} className="account-provider-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong className="text-[var(--text-strong)]">
                    {grant.source_display_name}
                  </strong>
                  <p className="small-copy muted-copy">
                    <span>{FAMILY_LABELS[grant.source_family]}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{MECHANISM_LABELS[grant.mechanism]}</span>
                  </p>
                  <p className="small-copy muted-copy">
                    <span>Submit applications</span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      Authorized {new Date(grant.granted_at).toLocaleDateString()}
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  loading={revoke.isPending && revoke.variables === grant.id}
                  disabled={revoke.isPending}
                  aria-label={`Revoke ${grant.source_display_name}`}
                  onClick={() => revoke.mutate(grant.id)}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
