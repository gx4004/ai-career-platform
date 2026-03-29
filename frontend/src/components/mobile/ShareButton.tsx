import { Share2 } from 'lucide-react'
import { Button } from '#/components/ui/button'

interface ShareButtonProps {
  title?: string
  text?: string
  url?: string
}

export function ShareButton({ title, text, url }: ShareButtonProps) {
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const handleShare = async () => {
    const shareUrl = url || window.location.href
    const shareData = {
      title: title || 'Career Workbench Result',
      text: text || 'Check out my career analysis results',
      url: shareUrl,
    }

    if (canShare) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled or share failed — silent
      }
    } else {
      // Fallback: copy URL to clipboard
      await navigator.clipboard.writeText(shareUrl)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="mobile-share-btn"
    >
      <Share2 size={16} />
      <span>Share</span>
    </Button>
  )
}
