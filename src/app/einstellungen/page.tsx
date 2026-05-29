import { Suspense } from "react"
import { SettingsContent } from "@/components/settings-content"

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Lädt...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
