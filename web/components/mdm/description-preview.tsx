"use client"

import { Eye } from "lucide-react"
import type { Attribute } from "./attributes-table"

interface DescriptionPreviewProps {
  pdmName: string
  attributes: Attribute[]
}

export function DescriptionPreview({ pdmName, attributes }: DescriptionPreviewProps) {
  const includedAttrs = attributes.filter((a) => a.includeInDescription)

  const generatePreview = () => {
    const parts: string[] = []

    if (pdmName) {
      parts.push(pdmName.toUpperCase().replace(/\s+/g, " "))
    } else {
      parts.push("MATERIAL")
    }

    includedAttrs.forEach((attr) => {
      if (attr.abbreviation) {
        parts.push(`[${attr.abbreviation.toUpperCase()}]`)
      } else if (attr.name) {
        parts.push(
          `[${attr.name
            .toUpperCase()
            .replace(/\s+/g, "_")}]`
        )
      }
    })

    return parts.join(" ")
  }

  return (
    <div className="border-t border-slate-200/60 bg-white px-6 py-3.5 shadow-[0_-2px_10px_-2px_rgba(0,0,0,0.05)] dark:border-zinc-700/50 dark:bg-preview-bg">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <Eye className="size-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </span>
        </div>
        <div className="h-5 w-px bg-sidebar-border shrink-0" />
        <div className="overflow-x-auto">
          <code className="font-mono text-sm font-bold text-preview-foreground whitespace-nowrap">
            {generatePreview()}
          </code>
        </div>
        <div className="ml-auto shrink-0">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
            {includedAttrs.length} {includedAttrs.length === 1 ? "campo" : "campos"}
          </span>
        </div>
      </div>
    </div>
  )
}
