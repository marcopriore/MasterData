import { Suspense } from 'react'
import { SupportPage } from '@/components/support/support-page'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportPage />
    </Suspense>
  )
}
