import { cn } from '@/lib/utils'

export type StatusBadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'muted'

const VARIANT_CLASS: Record<StatusBadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning-foreground',
  destructive: 'bg-destructive/15 text-destructive',
  info: 'bg-primary/15 text-primary',
  muted: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ variant = 'muted', className, children }: { variant?: StatusBadgeVariant; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', VARIANT_CLASS[variant], className)}>
      {children}
    </span>
  )
}
