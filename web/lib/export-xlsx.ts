/** Planilha gerada no navegador a partir de linhas já prontas (cabeçalhos em português). */
export async function exportRowsToXlsx(rows: Record<string, unknown>[], sheetName: string, filePrefix: string): Promise<void> {
  await exportSheetsToXlsx([{ name: sheetName, rows }], filePrefix)
}

/** Várias abas no mesmo arquivo, na ordem dada. */
export async function exportSheetsToXlsx(sheets: { name: string; rows: Record<string, unknown>[] }[], filePrefix: string): Promise<void> {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  for (const s of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(s.rows), s.name.slice(0, 31))
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  XLSX.writeFile(book, `${filePrefix}_${stamp}.xlsx`)
}

/** Linhas de cada aba de uma planilha enviada pelo usuário (primeira linha = cabeçalho). */
export async function readXlsxSheets(file: File): Promise<Record<string, Record<string, unknown>[]>> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return Object.fromEntries(
    book.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[name], { defval: '' })])
  )
}
