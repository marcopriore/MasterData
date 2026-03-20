'use client'

import { useState, useEffect } from 'react'
import { getMeasurementUnits } from '@/lib/supabase-api'
import type { MeasurementUnit } from '@/lib/supabase-api'

export type { MeasurementUnit }

export function useMeasurementUnits(): MeasurementUnit[] {
  const [units, setUnits] = useState<MeasurementUnit[]>([])

  useEffect(() => {
    getMeasurementUnits()
      .then(setUnits)
      .catch(() => {})
  }, [])

  return units
}
