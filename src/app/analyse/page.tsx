import { Suspense } from "react"
import { AnalyseContent } from "@/components/analyse-content"

export default function AnalysePage() {
  return (
    <Suspense fallback={<div>Lädt...</div>}>
      <AnalyseContent />
    </Suspense>
  )
}
