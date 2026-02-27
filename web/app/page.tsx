'use client'

import Link from 'next/link'
import { Database, FilePlus, GitBranch, ShieldCheck } from 'lucide-react'

export default function Dashboard() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-foreground">MDM Platform</h1>
        <p className="mt-2 text-muted-foreground">Master Data Management</p>
      </div>

      <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin-pdm" className="group">
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-[#B4B9BE] bg-white px-8 py-12 shadow-[var(--shadow-card-float)] transition-colors hover:border-[#C69A46]/50 hover:bg-primary/5 dark:border-zinc-700/50 dark:bg-card dark:hover:border-[#C69A46]/50">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#0F1C38] text-white transition-transform group-hover:scale-105">
              <Database className="size-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Gestão de PDMs</h2>
            <p className="text-center text-sm text-muted-foreground">
              Configure padrões de descrição de material
            </p>
          </div>
        </Link>

        <Link href="/governance" className="group">
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-[#B4B9BE] bg-white px-8 py-12 shadow-[var(--shadow-card-float)] transition-colors hover:border-[#C69A46]/50 hover:bg-primary/5 dark:border-zinc-700/50 dark:bg-card dark:hover:border-[#C69A46]/50">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#0F1C38] text-white transition-transform group-hover:scale-105">
              <ShieldCheck className="size-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Governança de Dados</h2>
            <p className="text-center text-sm text-muted-foreground">
              Políticas e controle de qualidade dos dados
            </p>
          </div>
        </Link>

        <Link href="/settings/workflow" className="group">
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-[#B4B9BE] bg-white px-8 py-12 shadow-[var(--shadow-card-float)] transition-colors hover:border-[#C69A46]/50 hover:bg-primary/5 dark:border-zinc-700/50 dark:bg-card dark:hover:border-[#C69A46]/50">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#0F1C38] text-white transition-transform group-hover:scale-105">
              <GitBranch className="size-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Fluxos de Trabalho</h2>
            <p className="text-center text-sm text-muted-foreground">
              Gerencie as etapas de aprovação e governança de dados.
            </p>
          </div>
        </Link>

        <Link href="/request" className="group">
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-[#C69A46] bg-white px-8 py-12 shadow-[var(--shadow-card-float)] transition-colors hover:border-[#C69A46] hover:bg-[#C69A46]/5 dark:bg-card dark:hover:bg-[#C69A46]/10">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#C69A46] text-white transition-transform group-hover:scale-105">
              <FilePlus className="size-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Nova Requisição</h2>
            <p className="text-center text-sm text-muted-foreground">
              Criar nova requisição de descrição de material
            </p>
          </div>
        </Link>
      </div>
    </main>
  )
}
