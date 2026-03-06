"use client"

import { useState, useEffect } from "react"
import { apiGet } from "@/lib/api"

export interface MeasurementUnit {
  id: number
  name: string
  abbreviation: string
  category: string
}

export function useMeasurementUnits(): MeasurementUnit[] {
  const [units, setUnits] = useState<MeasurementUnit[]>([])

  useEffect(() => {
    apiGet<MeasurementUnit[]>("/api/measurement-units")
      .then(setUnits)
      .catch(() => {})
  }, [])

  return units
}
