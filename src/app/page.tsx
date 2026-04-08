import { BonList } from "@/components/bon-list"

export default function BonsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bon-Übersicht</h1>
        <p className="text-gray-500 mt-1">Alle importierten REWE eBons</p>
      </div>

      <BonList />
    </div>
  )
}
