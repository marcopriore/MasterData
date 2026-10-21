"use client"

import { useParams } from "next/navigation"
import { Toaster } from "sonner"
import { PdmEditor } from "@/components/mdm/pdm-editor"

/** /admin-pdm/novo cria; /admin-pdm/{id} abre o PDM. */
export default function PdmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const pdmId = id === "novo" ? null : Number(id)

  return (
    <>
      <Toaster position="top-right" richColors />
      {pdmId === null || Number.isInteger(pdmId) ? (
        <PdmEditor key={id} pdmId={pdmId} />
      ) : (
        <p className="text-muted-foreground">PDM não encontrado.</p>
      )}
    </>
  )
}
