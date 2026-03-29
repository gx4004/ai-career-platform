import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { Label } from '#/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'

interface FeedbackSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (feedback: string) => void
  loading?: boolean
}

export function FeedbackSheet({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: FeedbackSheetProps) {
  const [feedback, setFeedback] = useState('')

  const handleSubmit = () => {
    onSubmit(feedback)
    setFeedback('')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="feedback-sheet">
        <SheetHeader>
          <SheetTitle className="feedback-sheet-title">Re-generate with feedback</SheetTitle>
        </SheetHeader>
        <div className="feedback-sheet-body">
          <div className="grid gap-2">
            <Label htmlFor="feedback-text" className="feedback-sheet-label">
              What would you like different? (optional)
            </Label>
            <Textarea
              id="feedback-text"
              rows={3}
              placeholder="e.g., Make it more specific, focus on leadership experience..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="feedback-sheet-textarea"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="feedback-sheet-submit"
          >
            <RefreshCw size={16} />
            Re-generate
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
