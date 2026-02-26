'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'

type Health = { status: string }

export default function Home() {
  const [data, setData] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
  apiGet<Health>('/health')
    .then(setData)
    .catch((e: any) => setError(e?.message ?? 'erro desconhecido'))
}, [])

  return (
    <main className="min-h-screen p-10">
      <h1 className="text-3xl font-semibold">MasterData</h1>

      <div className="mt-6 rounded-xl border p-4">
        <div className="text-sm text-gray-500">Backend health</div>

        {error ? (
          <div className="mt-2 text-red-600">{error}</div>
        ) : data ? (
          <div className="mt-2">
            Status: <span className="font-medium">{data.status}</span>
          </div>
        ) : (
          <div className="mt-2">Carregando...</div>
        )}
      </div>
    </main>
  )
}