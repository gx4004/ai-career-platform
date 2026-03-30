import { Link } from '@tanstack/react-router'
import { tools } from '#/lib/tools/registry'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'

interface ToolGridSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ToolGridSheet({ open, onOpenChange }: ToolGridSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mobile-tool-grid-sheet">
        <SheetHeader>
          <SheetTitle className="mobile-tool-grid-title">Tools</SheetTitle>
        </SheetHeader>
        <div className="mobile-tool-grid">
          {Object.values(tools).map((tool) => (
            <Link
              key={tool.id}
              to={tool.route}
              className="mobile-tool-grid-item"
              onClick={() => onOpenChange(false)}
            >
              <span className="mobile-tool-grid-icon">
                <tool.icon size={22} />
              </span>
              <span className="mobile-tool-grid-label">{tool.label}</span>
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
