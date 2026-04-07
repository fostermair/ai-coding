import { ImportZone } from "@/components/import-zone"
import { FolderOpen } from "lucide-react"

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">eBon importieren</h1>
        <p className="text-gray-500 mt-1">
          REWE eBon PDFs hochladen – einzeln oder als Batch
        </p>
      </div>

      <ImportZone />

      <div className="mt-8 rounded-lg border border-gray-100 bg-white p-4">
        <div className="flex items-start gap-3">
          <FolderOpen className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">Watch-Folder</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Automatischer Import aus einem Ordner wird in{" "}
              <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                PROJ-6
              </span>{" "}
              implementiert. Bis dahin PDFs oben manuell hochladen.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
