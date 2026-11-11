/** Descrição curta do material a partir do PDM e dos atributos (nome + atributos marcados, com abreviação). Sem banco. */
import { toErpText } from '@/lib/erp-text'

export type PdmDescAttribute = {
  id: string
  name?: string
  order?: number
  dataType?: string
  includeInDescription?: boolean
  abbreviation?: string
  allowedValues?: Array<{ value: string; abbreviation?: string } | string>
}

export type PdmDescTemplate = { name: string; attributes?: PdmDescAttribute[] }

export function pdmShortDescription(template: PdmDescTemplate | null, attrs: Record<string, unknown>): string {
  if (!template) return ''
  const parts = [template.name.toUpperCase()]
  const sorted = [...(template.attributes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  for (const attr of sorted) {
    if (!attr.includeInDescription) continue
    const val = attrs[attr.id]
    if (val == null || val === '') continue
    if (typeof val === 'object' && 'value' in (val as object)) {
      const v = val as { value?: string; unit?: string }
      const text = `${v.value ?? ''}${v.unit ?? ''}`.toUpperCase().trim()
      if (text) parts.push(text)
      continue
    }
    const strVal = String(val)
    const lov = (attr.allowedValues ?? []).find((av) =>
      typeof av === 'object' && av !== null ? av.value === strVal : String(av) === strVal
    )
    const abbr = typeof lov === 'object' && lov !== null ? lov.abbreviation : null
    parts.push((abbr || strVal).toUpperCase())
  }
  return toErpText(parts.join(' '))
}
