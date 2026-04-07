import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"

export default function BonsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bon-Übersicht</h1>
        <p className="text-gray-500 mt-1">Alle importierten REWE eBons</p>
      </div>

      {/* Empty state – will be replaced by PROJ-2 */}
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <Upload className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Noch keine Bons importiert
        </h2>
        <p className="text-sm text-gray-400 mb-6 max-w-sm">
          Importiere deine ersten REWE eBon PDFs um die Auswertung zu starten.
        </p>
        <Button asChild>
          <Link href="/import">Ersten eBon importieren</Link>
        </Button>
      </div>
    </div>
  )
}
