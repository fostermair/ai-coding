import { Package } from "lucide-react"

export default function ProduktePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Produktdatenbank</h1>
        <p className="text-gray-500 mt-1">Alle Produkte aus deinen Bons · Alias-Verwaltung</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <Package className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Wird in PROJ-3 implementiert
        </h2>
        <p className="text-sm text-gray-400 max-w-sm">
          Produktliste, Alias-Verwaltung und Preisentwicklung folgen nach dem Backend-Setup.
        </p>
      </div>
    </div>
  )
}
