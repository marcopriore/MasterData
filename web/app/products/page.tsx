'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { apiGet } from '@/lib/api'

type Product = {
  id: string
  name: string
  description?: string | null
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setError(null)
    try {
      const data = await apiGet<Product[]>('/products')
      setItems(data)
    } catch (e: any) {
      setError(e?.message ?? 'erro ao carregar')
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const base = process.env.NEXT_PUBLIC_API_URL
      if (!base) throw new Error('NEXT_PUBLIC_API_URL não definido em .env.local')

      const res = await fetch(`${base}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setName('')
      setDescription('')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'erro ao criar')
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
  setError(null)
  try {
    const base = process.env.NEXT_PUBLIC_API_URL
    if (!base) throw new Error('NEXT_PUBLIC_API_URL não definido')

    const res = await fetch(`${base}/products/${id}`, {
      method: 'DELETE',
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    await load()
  } catch (e: any) {
    setError(e?.message ?? 'erro ao excluir')
  }
}

  useEffect(() => {
    load()
  }, [])

  return (
    <main className="min-h-screen p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Produtos</h1>
        <a className="text-sm underline" href="/">Voltar</a>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="text-lg font-medium">Novo produto</h2>

          <form onSubmit={create} className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm text-gray-600">Nome</label>
              <input
                className="rounded-lg border px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm text-gray-600">Descrição</label>
              <textarea
                className="rounded-lg border px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <button
              className="rounded-lg border px-3 py-2 disabled:opacity-50"
              disabled={loading || !name.trim()}
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>

            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </form>
        </section>

        <section className="rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Lista</h2>
            <button className="text-sm underline" onClick={load}>Recarregar</button>
          </div>

          <div className="mt-4 grid gap-3">
            {items.length === 0 ? (
              <div className="text-sm text-gray-500">Nenhum produto cadastrado.</div>
            ) : (
              items.map((p) => (
                <div key={p.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.description ? (
                        <div className="text-sm text-gray-600">{p.description}</div>
                      ) : null}
                      <div className="mt-2 text-xs text-gray-500">{p.id}</div>
                    </div>

                    <button
                      className="text-sm underline text-red-500"
                      onClick={() => remove(p.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}