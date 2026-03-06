/**
 * Formata valor de atributo técnico para exibição.
 * Suporta string simples ou objeto {value, unit}.
 */
export function formatAttrValue(val: unknown): string {
  if (val === null || val === undefined) return "—"
  if (typeof val === "object" && val !== null && "value" in val) {
    const obj = val as { value?: string; unit?: string }
    const v = obj.value ?? ""
    const u = obj.unit ?? ""
    return `${v}${u}`.trim() || "—"
  }
  return String(val).trim() || "—"
}
