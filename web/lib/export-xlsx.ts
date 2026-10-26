/** Planilha gerada no navegador a partir de linhas já prontas (cabeçalhos em português). */
export async function exportRowsToXlsx(rows: Record<string, unknown>[], sheetName: string, filePrefix: string): Promise<void> {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31))
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  XLSX.writeFile(book, `${filePrefix}_${stamp}.xlsx`)
}
