import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice, Skeleton,
} from '#/components/kit'
import { fetchCvArtifactBlob } from '#/lib/api/client'
import type { CvStyle } from '#/lib/api/schemas'

function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/** The server-rendered PDF: exactly what "Export PDF" downloads. */
export function ExactPdfDialog({ open, onOpenChange, documentId, documentName, revision, style, templateName }: {
  open: boolean; onOpenChange: (open: boolean) => void; documentId: string; documentName: string; revision: string
  style: CvStyle; templateName: string
}) {
  const pdf = useQuery({
    queryKey: ['cv-artifact', documentId, revision, JSON.stringify(style), 'pdf'],
    queryFn: () => fetchCvArtifactBlob(documentId, 'pdf'),
    enabled: open,
    staleTime: Infinity,
  })
  const url = useObjectUrl(pdf.data)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Exact PDF</DialogTitle>
          <DialogDescription>This is the file you download with Export PDF, rendered on our server.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {pdf.isError ? (
            <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={() => void pdf.refetch()}>Try again</Button>}>
              We couldn’t build the PDF just now. Your CV is safe.
            </Notice>
          ) : !url ? (
            <div role="status">
              <Skeleton variant="block" width="100%" height="min(60dvh, 44rem)" />
              <span className="kit-sr-only">Building your PDF…</span>
            </div>
          ) : (
            <iframe className="cvs-pdf-frame" title={`${templateName} PDF preview`} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
          )}
        </DialogBody>
        {pdf.isError ? null : (
          <DialogFooter>
            <Button asChild disabled={!url}>
              <a href={url || undefined} download={`${documentName.trim() || 'cv'}.pdf`}><Download aria-hidden="true" /> Download PDF</a>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
