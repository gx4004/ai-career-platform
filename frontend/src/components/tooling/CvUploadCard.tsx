import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { parseCv } from '#/lib/api/client'

export function CvUploadCard({
  onParsed,
}: {
  onParsed: (text: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const mutation = useMutation({
    mutationFn: parseCv,
    onSuccess: (data) => {
      onParsed(data.extracted_text)
    },
  })

  const handleFile = (file: File | null) => {
    if (!file) return
    mutation.mutate(file)
  }

  return (
    <div className="import-card p-4">
      <div
        className="tool-upload-dropzone"
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          handleFile(event.dataTransfer.files[0] || null)
        }}
        style={{
          borderColor: dragActive ? 'var(--accent)' : undefined,
        }}
      >
        <FileUp size={20} style={{ color: 'var(--text-muted)' }} />
        <div className="grid gap-1">
          <p className="section-title">Drop your PDF or DOCX here</p>
          <p className="small-copy muted-copy">
            Or click below to browse and auto-fill the resume field.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Parsing CV…' : 'Choose file'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0] || null)}
        />
        {mutation.data?.warnings.length ? (
          <p className="small-copy muted-copy">
            {mutation.data.warnings.join(' ')}
          </p>
        ) : null}
        {mutation.error ? (
          <p className="small-copy" style={{ color: 'var(--destructive)' }}>
            {mutation.error instanceof Error ? mutation.error.message : 'CV parsing failed.'}
          </p>
        ) : null}
      </div>
    </div>
  )
}
