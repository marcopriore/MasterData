'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { measurementUnitsQuery } from '@/lib/queries/reference'
import type { MeasurementUnit } from '@/lib/supabase-api'

export type { MeasurementUnit }

const NO_UNITS: MeasurementUnit[] = []

export function useMeasurementUnits(): MeasurementUnit[] {
  const db = useMemo(() => createClient(), [])
  return useQuery(measurementUnitsQuery(db)).data ?? NO_UNITS
}
