import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

type PageLoadingProps = {
  label?: string
  className?: string
  /** Cobre a tela e bloqueia cliques (navegação ou envio). */
  overlay?: boolean
  minHeight?: string
}

function LoadingContent({ label }: { label: string }) {
  return (
    <>
      <Spinner className="size-8 text-primary" aria-hidden="true" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </>
  )
}

export function PageLoading({
  label = 'Carregando...',
  className,
  overlay = false,
  minHeight = 'min-h-[40vh]',
}: PageLoadingProps) {
  if (overlay) {
    return (
      <div
        className="fixed inset-0 z-[95] flex cursor-wait items-center justify-center bg-background/50 backdrop-blur-[1px]"
        role="status"
        aria-live="polite"
        aria-busy="true"
        onClick={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-8 py-6 text-center shadow-lg">
          <LoadingContent label={label} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 text-center', minHeight, className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingContent label={label} />
    </div>
  )
}
