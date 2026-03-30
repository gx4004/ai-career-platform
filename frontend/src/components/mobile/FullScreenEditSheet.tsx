import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'

interface FullScreenEditSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onSave: (value: string) => void
}

export function FullScreenEditSheet({
  open,
  onOpenChange,
  title,
  value,
  onSave,
}: FullScreenEditSheetProps) {
  const [text, setText] = useState(value)

  const handleSave = () => {
    onSave(text)
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) setText(value) // Reset on dismiss
        onOpenChange(isOpen)
      }}
    >
      <SheetContent side="bottom" className="edit-sheet">
        <SheetHeader className="edit-sheet-header">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="edit-sheet-cancel"
          >
            Cancel
          </Button>
          <SheetTitle className="edit-sheet-title">{title}</SheetTitle>
          <Button
            size="sm"
            onClick={handleSave}
            className="edit-sheet-done"
          >
            Done
          </Button>
        </SheetHeader>
        <div className="edit-sheet-body">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="edit-sheet-textarea"
            autoFocus
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
