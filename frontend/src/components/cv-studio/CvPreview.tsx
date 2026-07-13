import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { fetchCvArtifactBlob } from '#/lib/api/client'
import type { CvTemplateId } from '#/lib/api/schemas'

const names: Record<CvTemplateId, string> = { 'ats-essential': 'ATS Essential', 'professional-editorial': 'Professional Editorial', 'technical-portfolio': 'Technical / Portfolio' }

function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const next = URL.createObjectURL(blob); setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

export function CvPreview({ documentId, revision, dirty, template, onTemplateChange }: {
  documentId: string; revision: string; dirty: boolean; template: CvTemplateId; onTemplateChange: (value: CvTemplateId) => void
}) {
  const pdf = useQuery({ queryKey: ['cv-artifact', documentId, revision, template, 'pdf'], queryFn: () => fetchCvArtifactBlob(documentId, template, 'pdf'), enabled: !dirty })
  const docx = useQuery({ queryKey: ['cv-artifact', documentId, revision, template, 'docx'], queryFn: () => fetchCvArtifactBlob(documentId, template, 'docx'), enabled: !dirty })
  const pdfUrl = useObjectUrl(pdf.data); const docxUrl = useObjectUrl(docx.data)
  return <section className="studio-preview" aria-label="Document preview">
    <header><div><p className="eyebrow">Rendered PDF preview</p><h2>Export layout</h2></div><label>Template<select value={template} disabled={dirty} onChange={(event) => onTemplateChange(event.target.value as CvTemplateId)}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></header>
    {dirty ? <p>Preview and exports refresh after autosave.</p> : pdf.isError || docx.isError ? <p role="alert">Preview or export validation failed.</p> : !pdfUrl || !docxUrl ? <div className="studio-preview-skeleton" aria-label="Rendering preview" /> : <>
      <iframe className="studio-paper" title={`${names[template]} PDF preview`} src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`} />
      <div className="studio-preview-actions"><Button asChild variant="outline"><a href={docxUrl} download={`${documentId}-${template}.docx`}><Download size={16} /> DOCX</a></Button><Button asChild><a href={pdfUrl} download={`${documentId}-${template}.pdf`}><Download size={16} /> PDF</a></Button></div>
    </>}
  </section>
}
