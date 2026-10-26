'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MultiSelectOption = { value: string; label: string }

/** Lista suspensa de seleção múltipla para filtros; vazio significa "Todos". */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  width = 'w-40',
}: {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const triggerText = useMemo(() => {
    if (selected.length === 0) return `${label}: Todos`
    if (selected.length === 1) return options.find((o) => o.value === selected[0])?.label ?? `${label}: 1 selecionado`
    return `${label}: ${selected.length} selecionados`
  }, [label, selected, options])

  const optionClass = (active: boolean) =>
    cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60', active && 'bg-primary/5')
  const boxClass = (active: boolean) =>
    cn('flex size-4 shrink-0 items-center justify-center rounded border border-border', active && 'bg-primary')

  return (
    <div ref={containerRef} className={cn('relative', width)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm',
          selected.length === 0 && 'text-muted-foreground'
        )}
      >
        <span className="truncate text-left">{triggerText}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="listbox" aria-multiselectable className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-border bg-card py-1 shadow-lg">
          <div role="option" aria-selected={selected.length === 0} onClick={() => onChange([])} className={optionClass(selected.length === 0)}>
            <span className={boxClass(selected.length === 0)}>
              {selected.length === 0 && <Check className="size-3 text-primary-foreground" />}
            </span>
            <span>Todos</span>
          </div>
          {options.map((opt) => {
            const active = selected.includes(opt.value)
            return (
              <div key={opt.value} role="option" aria-selected={active} onClick={() => toggle(opt.value)} className={optionClass(active)}>
                <span className={boxClass(active)}>{active && <Check className="size-3 text-primary-foreground" />}</span>
                <span>{opt.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
