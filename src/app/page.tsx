import { Suspense } from "react"
import { BonList } from "@/components/bon-list"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export default function BonsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Übersicht</h1>
        <p className="text-gray-500 mt-1">Deine importierten Bons und Ausgabenanalyse</p>
      </div>

      {/* Placeholder for future "Achtung & Tipps" card (PROJ-42) */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <CardTitle className="text-base">Achtung & Tipps</CardTitle>
              <CardDescription>Personalisierte Sparvorschläge kommen in Kürze</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Automatische Alerts für Preissteigerungen, Substitutionsvorschläge und Multi-Store-Vergleiche werden in PROJ-42 implementiert.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alle Bons</h2>
        <Suspense>
          <BonList />
        </Suspense>
      </div>
    </div>
  )
}
