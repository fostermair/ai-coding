import { StatistikDashboard } from "@/components/statistik-dashboard"

export default function StatistikenPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Statistiken</h1>
        <p className="text-gray-500 mt-1">
          Monatliche Ausgaben &middot; H&auml;ufigste Produkte &middot; Rabatt-Tracking &middot; MwSt-Aufteilung
        </p>
      </div>

      <StatistikDashboard />
    </div>
  )
}
