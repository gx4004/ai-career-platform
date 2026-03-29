import { useState } from 'react'
import { Briefcase, Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useWorkspaces } from '#/hooks/useWorkspaces'
import { useSession } from '#/hooks/useSession'

export function WorkspacePicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const { status } = useSession()
  const { data: workspaces = [] } = useWorkspaces()
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  if (status !== 'authenticated') return null

  return (
    <div className="workspace-picker">
      <label className="workspace-picker-label">
        <Briefcase size={14} />
        <span>Workspace</span>
        <span className="workspace-picker-optional">(optional)</span>
      </label>
      <select
        className="workspace-picker-select"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__new__') {
            setCreating(true)
          } else {
            onChange(v || null)
          }
        }}
      >
        <option value="">Unassigned</option>
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.label || 'Untitled workspace'}
          </option>
        ))}
        <option value="__new__">+ New workspace...</option>
      </select>
      {creating && (
        <div className="workspace-picker-create">
          <input
            type="text"
            placeholder="e.g., Google - Backend Developer"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="workspace-picker-input"
            autoFocus
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // For now, just close — workspace will be created on run
              setCreating(false)
              setNewLabel('')
            }}
          >
            <Plus size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}
