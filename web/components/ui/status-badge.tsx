import { cn } from '@/lib/utils'

export type StatusBadgeVariant = 'success' | 'warning' | 'destructive' | 'info' | 'muted'

const VARIANT_CLASS: Record<StatusBadgeVariant, string> = {
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
  destructive: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  muted: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

export function StatusBadge({ variant = 'muted', className, children }: { variant?: StatusBadgeVariant; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', VARIANT_CLASS[variant], className)}>
      {children}
    </span>
  )
}
