import { TransactionList } from "@/components/transaction-list"

export default function TransaktionenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Transaktionen</h1>
        <p className="text-sm text-gray-500 mt-1">
          Alle importierten Kontobewegungen mit Abgleich-Status
        </p>
      </div>
      <TransactionList />
    </div>
  )
}
