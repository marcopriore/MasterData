import { queryOptions } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVER_FRESH_MS } from '@/lib/query/client'
import { listCenters, listMeasurementUnits } from '@/lib/data/reference'

/** Unidades de medida só mudam por migration: o cache vale por 5 minutos em todas as telas. */
const UNITS_STALE_MS = 5 * 60 * 1000

export const referenceKeys = {
  centers: ['centers'] as const,
  measurementUnits: ['measurement-units'] as const,
}

export const centersQuery = (db: SupabaseClient) => queryOptions({
  queryKey: referenceKeys.centers,
  queryFn: () => listCenters(db),
  staleTime: SERVER_FRESH_MS,
})

export const measurementUnitsQuery = (db: SupabaseClient) => queryOptions({
  queryKey: referenceKeys.measurementUnits,
  queryFn: () => listMeasurementUnits(db),
  staleTime: UNITS_STALE_MS,
})
