"use client"

import { useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Paperclip, X, FileText, ImageIcon, Upload, MessageSquare, Asterisk } from "lucide-react"
import type { UploadedFile } from "@/app/request/page"

interface PhaseDocsProps {
  files: UploadedFile[]
  onFilesChange: (files: UploadedFile[]) => void
  justificativa: string
  onJustificativaChange: (v: string) => void
}

const ACCEPTED = "image/png,image/jpeg,image/webp,image/gif,application/pdf"
const MAX_SIZE_MB = 10

function fileIcon(file: File) {
  if (file.type === "application/pdf") return <FileText className="size-4 text-red-500 shrink-0" />
  return <ImageIcon className="size-4 text-blue-500 shrink-0" />
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PhaseDocs({
  files,
  onFilesChange,
  justificativa,
  onJustificativaChange,
}: PhaseDocsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return
    const valid: UploadedFile[] = []
    Array.from(incoming).forEach((file) => {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) return // silently skip oversized
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
      valid.push({ id, file, preview })
    })
    onFilesChange([...files, ...valid])
  }, [files, onFilesChange])

  const removeFile = useCallback((id: string) => {
    const f = files.find((f) => f.id === id)
    if (f?.preview) URL.revokeObjectURL(f.preview)
    onFilesChange(files.filter((f) => f.id !== id))
  }, [files, onFilesChange])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Documentação e Justificativa</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Anexe documentos de apoio e informe a justificativa da solicitação.
        </p>
      </div>

      {/* File upload */}
      <Card className="border-[#B4B9BE]/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Paperclip className="size-4 text-[#0F1C38]" />
            Documentação de Apoio
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              Imagens e PDFs · máx. {MAX_SIZE_MB} MB cada
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#B4B9BE] bg-slate-50 px-6 py-10 text-center transition-colors",
              "hover:border-[#0F1C38]/40 hover:bg-slate-100"
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-[#0F1C38]/8 border border-[#B4B9BE]">
              <Upload className="size-5 text-[#0F1C38]/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Arraste arquivos aqui ou <span className="text-[#0F1C38] underline underline-offset-2">clique para selecionar</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP, GIF, PDF</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-[#B4B9BE]/60 bg-white px-3 py-2.5"
                >
                  {f.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt={f.file.name} className="size-8 rounded object-cover shrink-0 border border-[#B4B9BE]/40" />
                  ) : (
                    fileIcon(f.file)
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeFile(f.id)}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Justificativa */}
      <Card className="border-[#B4B9BE]/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4 text-[#0F1C38]" />
            Justificativa da Solicitação
            <Asterisk className="size-2.5 text-destructive ml-0.5" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="justificativa" className="text-sm text-muted-foreground">
            Descreva o motivo da solicitação, aplicação do material e qualquer informação relevante para aprovação.
          </Label>
          <Textarea
            id="justificativa"
            value={justificativa}
            onChange={(e) => onJustificativaChange(e.target.value)}
            placeholder="Ex: Material necessário para manutenção preventiva da linha de produção X. Estoque atual zerado, previsão de parada em 15 dias..."
            rows={5}
            className="resize-none border-[#B4B9BE] focus-visible:ring-[#C69A46]/50 text-sm leading-relaxed"
          />
          <p className="text-right text-xs text-muted-foreground">
            {justificativa.length} caracteres
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
