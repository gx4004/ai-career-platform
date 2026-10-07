import { useEffect, useState } from 'react'
import { EmptyState, Table } from '#/components/kit'
import type { TableColumn } from '#/components/kit'
import { readStorageInventory, type StorageEntry } from '#/components/legal/storageCatalogue'
import { subscribeConsent } from '#/lib/consent'

const COLUMNS: TableColumn<StorageEntry>[] = [
  { id: 'name', header: 'Name', primary: true, nowrap: true, cell: (entry) => <code>{entry.name}</code> },
  { id: 'kind', header: 'Where', nowrap: true, cell: (entry) => entry.kind },
  { id: 'purpose', header: 'What it is for', cell: (entry) => entry.purpose },
  { id: 'lifetime', header: 'Lifetime', cell: (entry) => entry.lifetime },
]

/**
 * "What we store on your device", read live from this browser: the real keys, with what each one is for.
 * Values are never shown. It re-reads when the cookie choice changes (here or in another tab) and when `version` changes.
 */
export function StorageInventory({ version = 0 }: { version?: number }) {
  const [entries, setEntries] = useState<StorageEntry[] | null>(null)
  useEffect(() => {
    const read = () => setEntries(readStorageInventory())
    read()
    const unsubscribe = subscribeConsent(read)
    window.addEventListener('storage', read)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', read)
    }
  }, [version])

  if (entries === null) return null
  return (
    <Table
      caption="What this browser stores for Career Workbench right now"
      columns={COLUMNS}
      rows={entries}
      getRowId={(entry) => `${entry.kind}:${entry.name}`}
      density="compact"
      empty={<EmptyState size="inline" title="Nothing is stored in this browser right now." />}
    />
  )
}
