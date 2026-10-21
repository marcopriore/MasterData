"use client"

import { Suspense } from "react"
import { Toaster } from "sonner"
import { PdmList } from "@/components/mdm/pdm-list"

export default function PdmListPage() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Suspense fallback={null}>
        <PdmList />
      </Suspense>
    </>
  )
}
