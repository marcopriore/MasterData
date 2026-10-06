import { cn } from '@/lib/utils'

export function CharacterCounter({ current, max, className }: { current: number; max: number; className?: string }) {
  const near = current > max * 0.9
  const over = current > max
  return (
    <p className={cn('text-right text-xs', over ? 'text-destructive' : near ? 'text-amber-700' : 'text-muted-foreground', className)}>
      {current}/{max}
    </p>
  )
}
