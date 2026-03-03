'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiGet, apiPatch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Toaster, toast } from 'sonner'
import { ChevronLeft, Check, X, PlayCircle } from 'lucide-react'

export default function GovernanceRequestPage() {
  const params = useParams()
  const id = params?.id as string
  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [atendimentoIniciado, setAtendimentoIniciado] = useState(false)

  const fetchRequest = useCallback(async () => {
    if (!id) return
    try {
      const list = await apiGet<any[]>('/api/requests')
      const found = list.find((r) => String(r.id) === id)
      setRequest(found ?? null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchRequest() }, [fetchRequest])

  if (loading) return <div className="p-8 bg-white min-h-screen">Carregando...</div>
  if (!request) return <div className="p-8 bg-white min-h-screen">Solicitação não encontrada. <Link href="/governance" className="text-blue-600">Voltar</Link></div>

  return (
    <div className="min-h-screen bg-white text-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/governance" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <ChevronLeft className="size-4" /> Voltar para Governança
        </Link>
        
        <h1 className="text-2xl font-bold mb-6">REQ-{String(request.id).padStart(4, '0')}</h1>
        
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Descrição Gerada</p>
          <p className="text-lg font-mono font-bold text-slate-800">{request.generated_description || 'Nenhuma descrição'}</p>
        </div>

        {!atendimentoIniciado ? (
          <Button onClick={() => setAtendimentoIniciado(true)} className="bg-green-600 hover:bg-green-700 text-white gap-2">
            <PlayCircle className="size-4" /> Iniciar Atendimento
          </Button>
        ) : (
          <div className="flex gap-4">
            <Button className="bg-green-600 hover:bg-green-700 text-white gap-2"><Check className="size-4" /> Aprovar</Button>
            <Button variant="destructive" className="gap-2"><X className="size-4" /> Rejeitar</Button>
          </div>
        )}
      </div>
      <Toaster richColors />
    </div>
  )
}