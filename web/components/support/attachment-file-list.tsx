import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatLocalFileSize } from '@/lib/axisdesk/support-form'

export function AttachmentFileList({
  files,
  onRemove,
  disabled = false,
}: {
  files: File[]
  onRemove: (index: number) => void
  disabled?: boolean
}) {
  if (files.length === 0) return null
  return (
    <ul className="space-y-2">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.size}-${file.lastModified}`}
          className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatLocalFileSize(file.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remover ${file.name}`}
          >
            <X className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
