import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Textarea } from '#/components/ui/textarea'
import { createEvidenceItem, requestEvidenceImportProposals } from '#/lib/api/client'
import type { EvidenceProposal } from '#/lib/api/schemas'
import {
  KIND_LABELS,
  contentEntries,
  contentToEditableText,
  parseEditableText,
} from '#/lib/profile/evidence'

type ProposalStatus = 'pending' | 'accepted' | 'discarded'

// A proposal plus its (client-only) review state. Edits live here until the user
// accepts — the server never sees a discarded or edited-but-unaccepted proposal,
// so nothing about it is persisted (D-062).
type ReviewProposal = EvidenceProposal & {
  content: Record<string, unknown>
  status: ProposalStatus
}

export function ResumeImportDialog({
  open,
  resumeText,
  onOpenChange,
  onImported,
}: {
  open: boolean
  resumeText: string
  onOpenChange: (open: boolean) => void
  // Called after at least one proposal was accepted so the profile list can refresh.
  onImported: () => void
}) {
  const [reviews, setReviews] = useState<ReviewProposal[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const proposalsQuery = useQuery({
    queryKey: ['evidence-import', 'proposals'],
    queryFn: () => requestEvidenceImportProposals(resumeText),
    enabled: open && resumeText.length >= 50,
    // Proposals are ephemeral and model-generated — never cache or refetch them
    // silently; each review session asks for a fresh, explicit proposal set.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  // Seed local review state once the server proposals arrive.
  useEffect(() => {
    if (proposalsQuery.data) {
      setReviews(
        proposalsQuery.data.proposals.map((p) => ({ ...p, status: 'pending' as const })),
      )
    }
  }, [proposalsQuery.data])

  const acceptMutation = useMutation({
    mutationFn: (proposal: ReviewProposal) =>
      createEvidenceItem({
        kind: proposal.kind,
        content: proposal.content,
        provenance: 'imported',
      }),
    onSuccess: (_data, proposal) => {
      setReviews((prev) =>
        prev.map((r) => (r.proposal_id === proposal.proposal_id ? { ...r, status: 'accepted' } : r)),
      )
      onImported()
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not import this proposal.')
      window.setTimeout(() => setActionError(null), 4000)
    },
  })

  function discard(id: string) {
    // Discarding is purely local: the proposal was never persisted, so nothing
    // leaves a server-side trace of its content.
    setReviews((prev) => prev.map((r) => (r.proposal_id === id ? { ...r, status: 'discarded' } : r)))
    if (editingId === id) setEditingId(null)
  }

  function startEdit(proposal: ReviewProposal) {
    setEditingId(proposal.proposal_id)
    setEditText(contentToEditableText(proposal.content))
    setEditError(null)
  }

  function saveEdit(id: string) {
    const parsed = parseEditableText(editText)
    if (!parsed.ok) {
      setEditError(parsed.error)
      return
    }
    setReviews((prev) => prev.map((r) => (r.proposal_id === id ? { ...r, content: parsed.value } : r)))
    setEditingId(null)
    setEditError(null)
  }

  const pending = useMemo(() => reviews.filter((r) => r.status === 'pending'), [reviews])
  const acceptedCount = useMemo(
    () => reviews.filter((r) => r.status === 'accepted').length,
    [reviews],
  )

  const isLoading = proposalsQuery.isLoading || proposalsQuery.isFetching
  const isError = proposalsQuery.isError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="evidence-import__dialog">
        <DialogHeader>
          <DialogTitle>Review evidence from your resume</DialogTitle>
          <DialogDescription>
            These are suggestions extracted from your uploaded resume. Nothing is saved until you
            accept it — accepted items arrive as <strong>unconfirmed</strong> and stay that way
            until you confirm them. You can skip this entirely.
          </DialogDescription>
        </DialogHeader>

        {actionError ? (
          <p role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="muted-copy small-copy">Reading your resume…</p>
        ) : isError ? (
          <div className="evidence-import__empty">
            <p className="muted-copy small-copy">We could not read proposals from your resume.</p>
            <Button variant="outline" onClick={() => proposalsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : reviews.length === 0 ? (
          <p className="muted-copy small-copy">
            No reusable evidence was found in this resume. You can add items to your profile
            manually instead.
          </p>
        ) : pending.length === 0 ? (
          <p className="muted-copy small-copy">
            You have reviewed every proposal
            {acceptedCount > 0
              ? ` and imported ${acceptedCount} ${acceptedCount === 1 ? 'item' : 'items'}.`
              : '.'}
          </p>
        ) : (
          <ul className="evidence-import__list">
            {pending.map((proposal) => (
              <li key={proposal.proposal_id} className="evidence-import__item">
                <div className="evidence-import__item-head">
                  <span className="evidence-import__kind">{KIND_LABELS[proposal.kind]}</span>
                </div>
                {editingId === proposal.proposal_id ? (
                  <div className="evidence-import__edit">
                    <Textarea
                      aria-label="Proposal content (JSON fields)"
                      value={editText}
                      spellCheck={false}
                      rows={6}
                      onChange={(event) => setEditText(event.target.value)}
                    />
                    {editError ? (
                      <p role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>
                        {editError}
                      </p>
                    ) : null}
                    <div className="evidence-import__actions">
                      <Button size="sm" onClick={() => saveEdit(proposal.proposal_id)}>
                        Save edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <dl className="evidence-import__content">
                      {contentEntries(proposal.content).map((entry) => (
                        <div key={entry.key} className="evidence-import__field">
                          <dt>{entry.key}</dt>
                          <dd>{entry.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="evidence-import__actions">
                      <Button
                        size="sm"
                        loading={
                          acceptMutation.isPending &&
                          acceptMutation.variables?.proposal_id === proposal.proposal_id
                        }
                        onClick={() => acceptMutation.mutate(proposal)}
                      >
                        <Check size={14} className="mr-1.5" />
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(proposal)}>
                        <Pencil size={14} className="mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => discard(proposal.proposal_id)}
                      >
                        <X size={14} className="mr-1.5" />
                        Discard
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {pending.length === 0 ? 'Done' : 'Skip for now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
