'use client'

import { useRouter } from 'next/navigation'
import { ClipboardList, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecentActivitiesList } from '@/components/recent-activities-list'

export default function ActivityPage() {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#0F1C38]/8 dark:bg-[#C69A46]/10">
            <ClipboardList className="size-5 text-[#0F1C38] dark:text-[#C69A46]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Todas as Atividades</h1>
            <p className="text-sm text-muted-foreground">Histórico das suas solicitações.</p>
          </div>
        </div>
      </div>

      <RecentActivitiesList fullPage={true} />
    </div>
  )
}
