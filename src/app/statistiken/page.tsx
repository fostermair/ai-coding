import { BarChart3 } from "lucide-react"

export default function StatistikenPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Statistiken</h1>
        <p className="text-gray-500 mt-1">
          Monatliche Ausgaben · Häufigste Produkte · Rabatt-Tracking
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <BarChart3 className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Wird in PROJ-5 implementiert
        </h2>
        <p className="text-sm text-gray-400 max-w-sm">
          Charts und Statistiken werden nach dem Daten-Import verfügbar.
        </p>
      </div>
    </div>
  )
}
