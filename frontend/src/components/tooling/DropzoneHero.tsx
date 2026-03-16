import { useRef, useState, useCallback, type CSSProperties } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileUp, CheckCircle2, FileText, Upload } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '#/components/ui/button'
import { parseCv } from '#/lib/api/client'

type DropzoneState = 'idle' | 'drag-over' | 'uploading' | 'success'

export function DropzoneHero({
  onParsed,
  onPasteText,
  accent,
  compact = false,
  collapseOnSuccess = false,
}: {
  onParsed: (text: string) => void
  onPasteText?: () => void
  accent?: string
  compact?: boolean
  collapseOnSuccess?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dropState, setDropState] = useState<DropzoneState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: parseCv,
    onMutate: () => setDropState('uploading'),
    onSuccess: (data) => {
      setDropState('success')
      onParsed(data.extracted_text)
    },
    onError: () => setDropState('idle'),
  })

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return
      setFileName(file.name)
      mutation.mutate(file)
    },
    [mutation],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropState('drag-over')
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropState('idle')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDropState('idle')
      handleFile(e.dataTransfer.files[0] || null)
    },
    [handleFile],
  )

  if (collapseOnSuccess && dropState === 'success') {
    return (
      <motion.div
        className="dropzone-compact-strip"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{ '--tool-accent': accent } as CSSProperties}
      >
        <div className="dropzone-compact-inner">
          <CheckCircle2 size={18} style={{ color: accent }} />
          <span className="dropzone-compact-file">{fileName || 'Resume uploaded'}</span>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setDropState('idle')
              setFileName(null)
            }}
          >
            Change
          </Button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`dropzone-hero ${compact ? 'dropzone-hero--compact' : ''}`}
      data-state={dropState}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ '--tool-accent': accent } as CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="dropzone-hero-inner">
        <AnimatePresence mode="wait">
          {dropState === 'uploading' ? (
            <motion.div
              key="uploading"
              className="dropzone-hero-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="dropzone-upload-spinner" />
              <p className="dropzone-hero-title">Parsing your resume…</p>
              <p className="dropzone-hero-subtitle">{fileName}</p>
            </motion.div>
          ) : dropState === 'success' ? (
            <motion.div
              key="success"
              className="dropzone-hero-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <CheckCircle2 size={48} style={{ color: accent }} />
              <p className="dropzone-hero-title">Resume parsed successfully</p>
              <p className="dropzone-hero-subtitle">{fileName}</p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setDropState('idle')
                  setFileName(null)
                }}
              >
                Upload a different file
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              className="dropzone-hero-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="dropzone-hero-icon-ring">
                {dropState === 'drag-over' ? (
                  <Upload size={36} />
                ) : (
                  <FileText size={36} />
                )}
              </div>
              <p className="dropzone-hero-title">
                {dropState === 'drag-over'
                  ? 'Drop your resume here'
                  : 'Drop your resume to get started'}
              </p>
              <p className="dropzone-hero-subtitle">
                Supports PDF, DOC, and DOCX files
              </p>
              <div className="dropzone-hero-actions">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: accent, color: '#ffffff' }}
                >
                  <FileUp size={16} />
                  Choose file
                </Button>
                {onPasteText && (
                  <Button variant="outline" type="button" onClick={onPasteText}>
                    Paste text instead
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {mutation.error && (
          <p className="dropzone-hero-error">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Failed to parse resume. Please try again.'}
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
    </motion.div>
  )
}
