import { AlertTriangle } from 'lucide-react'

interface Props {
  description: string
  maxLength: number
  showCounter?: boolean
}

export function DescriptionLengthIndicator({
  description,
  maxLength,
  showCounter = true,
}: Props) {
  const length = description?.length ?? 0
  const isOver = length > maxLength
  const isWarning = length > maxLength * 0.9

  if (!description) return null

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium ${
        isOver
          ? 'text-red-500 dark:text-red-400'
          : isWarning
            ? 'text-amber-500 dark:text-amber-400'
            : 'text-slate-400 dark:text-muted-foreground'
      }`}
    >
      {isOver && (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      )}
      {showCounter && (
        <span>{length}/{maxLength}</span>
      )}
      {isOver && (
        <span>Descrição acima do limite</span>
      )}
    </div>
  )
}
