import { getCvDocument } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import { cvDocumentSchema, cvDocumentUpdateSchema } from '#/lib/api/schemas'
import type { CvDocumentUpdate } from '#/lib/api/schemas'

/** Same base the shared API client uses (client.ts keeps it private). */
export function apiBase() {
  const configured = import.meta.env.VITE_API_URL?.trim()
  return configured ? configured.replace(/\/+$/, '') : '/api/v1'
}

/** The save that survives a closing tab: `keepalive` lets the request finish after the page is gone. */
export async function keepalivePatch(documentId: string, payload: CvDocumentUpdate) {
  const response = await fetch(`${apiBase()}/cv-documents/${encodeURIComponent(documentId)}`, {
    method: 'PATCH', keepalive: true, credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cvDocumentUpdateSchema.parse(payload)),
  })
  if (!response.ok) throw new ApiError('Save failed', response.status)
  return cvDocumentSchema.parse(await response.json())
}

/** Thrown when the server has no file route for a saved version (an older backend). */
export class VersionExportUnavailable extends Error {
  constructor() { super('Exporting a saved version is not available on this server yet.') }
}

/**
 * A saved version rendered as PDF or DOCX, in the CV's current style, without touching the working CV.
 * The route is `GET /cv-documents/{id}/variants/{variantId}/artifacts/{format}`.
 */
export async function fetchVariantArtifactBlob(documentId: string, variantId: string, format: 'pdf' | 'docx'): Promise<Blob> {
  // A plain request first: the shared client refreshes an expired session on its own, a bare fetch cannot.
  await getCvDocument(documentId)
  const response = await fetch(
    `${apiBase()}/cv-documents/${encodeURIComponent(documentId)}/variants/${encodeURIComponent(variantId)}/artifacts/${format}`,
    { credentials: 'include', signal: AbortSignal.timeout(180_000) },
  )
  if (response.status === 404 || response.status === 405 || response.status === 501) throw new VersionExportUnavailable()
  if (!response.ok) throw new ApiError('Artifact export failed', response.status)
  return response.blob()
}
