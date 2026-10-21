"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, X, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { downloadPdmImportTemplate, logAction, uploadPdmsImport } from "@/lib/supabase-api"

type ImportRow = {
  row_number: number
  operacao: string
  pdm_code: string | null
  status: string
  errors: string[]
  warnings: string[]
}

type ImportResult = {
  pdm: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: Array<ImportRow & { nome: string | null }> }
  attributes: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: Array<ImportRow & { atributo_key: string | null }> }
}

const byStatus = (a: { status: string }, b: { status: string }) =>
  (a.status === "error" ? 0 : a.status === "warning" ? 1 : 2) - (b.status === "error" ? 0 : b.status === "warning" ? 1 : 2)

function rowTone(status: string) {
  if (status === "error") return "bg-red-50 dark:bg-red-900/20"
  if (status === "warning") return "bg-yellow-50 dark:bg-yellow-900/20"
  return "bg-white dark:bg-zinc-900"
}

function OperationBadge({ op }: { op: string }) {
  if (op === "C") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Criação</span>
  if (op === "E") return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Edição</span>
  if (op === "D") return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Exclusão</span>
  return <span className="text-zinc-600 dark:text-zinc-400">{op}</span>
}

function StatusCell({ status }: { status: string }) {
  if (status === "ok") return <span className="text-green-600 dark:text-green-400"><CheckCircle2 className="size-3.5 inline" /> ok</span>
  if (status === "warning") return <span className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3.5 inline" /> aviso</span>
  if (status === "error") return <span className="text-red-600 dark:text-red-400"><XCircle className="size-3.5 inline" /> erro</span>
  return null
}

function MessagesCell({ errors, warnings }: { errors?: string[]; warnings?: string[] }) {
  return (
    <td className="px-3 py-2 text-xs">
      {errors?.map((e, i) => <p key={i} className="text-red-600 dark:text-red-400"><XCircle className="size-3 inline" /> {e}</p>)}
      {warnings?.map((w, i) => <p key={i} className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3 inline" /> {w}</p>)}
      {!errors?.length && !warnings?.length && "—"}
    </td>
  )
}

function Counters({ part }: { part: { total_rows: number; valid_rows: number; warning_rows: number; error_rows: number } | undefined }) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Total: {part?.total_rows ?? 0}</span>
      <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Válidas: {part?.valid_rows ?? 0}</span>
      <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Avisos: {part?.warning_rows ?? 0}</span>
      <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Erros: {part?.error_rows ?? 0}</span>
    </div>
  )
}

const th = "px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300"
const td = "px-3 py-2 text-zinc-700 dark:text-zinc-300"

/** Importação em massa de PDM e atributos em 3 etapas: template, upload e validação, confirmação. */
export function PdmImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errorCount = (result?.pdm?.error_rows ?? 0) + (result?.attributes?.error_rows ?? 0)

  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      await downloadPdmImportTemplate()
      toast.success("Template baixado com sucesso!")
    } catch (err) {
      toast.error((err as Error)?.message ?? "Falha ao baixar template")
    } finally {
      setDownloading(false)
    }
  }

  const handleValidate = async () => {
    if (!file) return
    setValidating(true)
    setError(null)
    try {
      const res = await uploadPdmsImport(file, true)
      if ("pdm" in res) setResult(res as ImportResult)
      setStep(3)
    } catch (err) {
      setError((err as Error)?.message ?? "Falha ao validar planilha")
    } finally {
      setValidating(false)
    }
  }

  const handleConfirm = async () => {
    if (!file || !result || errorCount > 0) return
    setConfirming(true)
    setError(null)
    try {
      const res = await uploadPdmsImport(file, false)
      if (!("pdm_created" in res)) throw new Error("Resposta inesperada")
      void logAction({
        category: "pdm",
        action: "pdm_imported",
        description: "Importação em massa de PDMs concluída",
        event_data: {
          pdm_created: res.pdm_created,
          pdm_updated: res.pdm_updated,
          attr_created: res.attr_created,
          attr_updated: res.attr_updated,
        },
      })
      toast.success(
        `Importação concluída: ${res.pdm_created + res.pdm_updated} PDM(s), ${res.attr_created + res.attr_updated} atributo(s) criados/atualizados, ${res.attr_deleted} deletados`
      )
      onImported()
      onClose()
    } catch (err) {
      setError((err as Error)?.message ?? "Falha ao importar")
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 shrink-0 dark:border-zinc-700">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Importação em Massa de PDM</h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Etapa {step} de 3</p>
          </div>
          <button
            onClick={onClose}
            disabled={validating || confirming}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-3">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Regras principais:</p>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                  <li>A planilha tem duas abas: <strong>PDM</strong> e <strong>Atributos</strong></li>
                  <li>PDM: operacao C (Criar) ou E (Editar)</li>
                  <li>Atributos: operacao C, E ou D (Deletar — apenas para atributos)</li>
                  <li>Não alterar os nomes das colunas do cabeçalho</li>
                </ul>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Aba PDM:</p>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                  <li><strong>operacao=E</strong>: pdm_code identifica o PDM e não pode ser alterado. Apenas nome, descrição e ativo serão atualizados.</li>
                </ul>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Aba Atributos:</p>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                  <li><strong>operacao=E</strong>: o par pdm_code + atributo_key identifica o atributo e nenhum dos dois pode ser alterado. Use D + C para renomear.</li>
                  <li><strong>operacao=D</strong>: remove o atributo. Requer pdm_code e atributo_key.</li>
                </ul>
              </div>
              <Button onClick={handleDownloadTemplate} disabled={downloading} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Baixar Planilha Template
              </Button>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault() }}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) setFile(f)
                  else toast.error("Apenas arquivos .xlsx ou .xls são aceitos")
                }}
                onClick={() => document.getElementById("pdm-import-file")?.click()}
                className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
              >
                <input
                  id="pdm-import-file"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setFile(f)
                    e.target.value = ""
                  }}
                />
                <FileSpreadsheet className="size-10 text-zinc-400 dark:text-zinc-500" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Arraste a planilha aqui ou clique para selecionar</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Formatos aceitos: .xlsx, .xls</p>
                {file && <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">✓ {file.name}</p>}
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              {file && (
                <Button onClick={handleValidate} disabled={validating} className="gap-2">
                  {validating ? <Loader2 className="size-4 animate-spin" /> : null}
                  Validar Planilha
                </Button>
              )}
            </div>
          )}
          {step === 3 && result && (
            <div className="space-y-6">
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Aba PDM</h3>
                <Counters part={result.pdm} />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                      <tr>
                        <th className={th}>Linha</th>
                        <th className={th}>Op.</th>
                        <th className={th}>Código</th>
                        <th className={th}>Nome</th>
                        <th className={th}>Status</th>
                        <th className={th}>Erros/Avisos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(result.pdm?.rows ?? [])].sort(byStatus).map((r) => (
                        <tr key={`pdm-${r.row_number}`} className={rowTone(r.status)}>
                          <td className={td}>{r.row_number}</td>
                          <td className="px-3 py-2"><OperationBadge op={r.operacao} /></td>
                          <td className={td}>{r.pdm_code ?? "—"}</td>
                          <td className={`${td} max-w-[140px] truncate`}>{r.nome ?? "—"}</td>
                          <td className="px-3 py-2"><StatusCell status={r.status} /></td>
                          <MessagesCell errors={r.errors} warnings={r.warnings} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Aba Atributos</h3>
                <Counters part={result.attributes} />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                      <tr>
                        <th className={th}>Linha</th>
                        <th className={th}>Op.</th>
                        <th className={th}>PDM</th>
                        <th className={th}>Key</th>
                        <th className={th}>Label</th>
                        <th className={th}>Status</th>
                        <th className={th}>Erros/Avisos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(result.attributes?.rows ?? [])].sort(byStatus).map((r) => (
                        <tr key={`attr-${r.row_number}`} className={rowTone(r.status)}>
                          <td className={td}>{r.row_number}</td>
                          <td className="px-3 py-2"><OperationBadge op={r.operacao} /></td>
                          <td className={td}>{r.pdm_code ?? "—"}</td>
                          <td className={td}>{r.atributo_key ?? "—"}</td>
                          <td className={`${td} max-w-[120px] truncate`}>{(r as { data?: { label?: string } }).data?.label ?? "—"}</td>
                          <td className="px-3 py-2"><StatusCell status={r.status} /></td>
                          <MessagesCell errors={r.errors} warnings={r.warnings} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {errorCount > 0 ? "Corrija os erros antes de confirmar a importação" : "Pronto para confirmar a importação"}
              </p>
            </div>
          )}
        </div>
        <div className="border-t border-zinc-200 px-6 py-4 flex justify-between shrink-0 dark:border-zinc-700">
          <div>
            {step === 1 && <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>}
            {step === 2 && <Button variant="outline" size="sm" onClick={() => setStep(1)}>← Voltar</Button>}
            {step === 3 && <Button variant="outline" size="sm" onClick={() => setStep(2)} disabled={confirming}>← Voltar</Button>}
          </div>
          <div className="flex gap-2">
            {step === 1 && <Button size="sm" onClick={() => setStep(2)}>Próximo →</Button>}
            {step === 2 && (
              <Button size="sm" onClick={handleValidate} disabled={!file || validating}>
                {validating ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Validar Planilha
              </Button>
            )}
            {step === 3 && (
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={errorCount > 0 || confirming}
                className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {confirming ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Confirmar Importação
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
