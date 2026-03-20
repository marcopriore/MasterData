import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') !== 'false'

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  return NextResponse.json({
    error: 'Importação de usuários em desenvolvimento. Use a criação manual.',
  }, { status: 501 })
}
