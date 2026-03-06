"use client"

import type { MeasurementUnit } from "@/hooks/useMeasurementUnits"

interface NumericUnitInputProps {
  value: string
  unit: string
  units: MeasurementUnit[]
  onChange: (value: string, unit: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

export function NumericUnitInput({
  value,
  unit,
  units,
  onChange,
  placeholder = "Valor...",
  required,
  disabled,
}: NumericUnitInputProps) {
  const grouped = units.reduce(
    (acc, u) => {
      const cat = u.category || "Geral"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(u)
      return acc
    },
    {} as Record<string, MeasurementUnit[]>
  )

  return (
    <div className="flex gap-2">
      <input
        type="number"
        className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-zinc-600 px-3 py-2 text-sm
          bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100
          placeholder:text-slate-400 dark:placeholder:text-zinc-500
          focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
          disabled:opacity-50 disabled:cursor-not-allowed"
        value={value}
        onChange={(e) => onChange(e.target.value, unit)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={0}
      />
      <select
        className="w-28 shrink-0 rounded-lg border border-slate-200 dark:border-zinc-600 px-2 py-2 text-sm
          bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100
          focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
          disabled:opacity-50 disabled:cursor-not-allowed"
        value={unit}
        onChange={(e) => onChange(value, e.target.value)}
        disabled={disabled}
      >
        <option value="">Unidade</option>
        {Object.entries(grouped).map(([category, unitList]) => (
          <optgroup key={category} label={category}>
            {unitList.map((u) => (
              <option key={u.id} value={u.abbreviation}>
                {u.abbreviation} — {u.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
