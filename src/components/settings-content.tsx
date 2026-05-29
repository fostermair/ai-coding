"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TransactionList } from "@/components/transaction-list"
import { ImportHistoryTable } from "@/components/import-history-table"
import { HelloFreshTransactionList } from "@/components/hellofresh-transaction-list"
import { ImportTabs } from "@/components/import-tabs"
import { BackupSection } from "@/components/backup-section"

export function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") ?? "konto"

  const handleTabChange = (newTab: string) => {
    router.replace(`/einstellungen?tab=${newTab}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Einstellungen</h1>
        <p className="text-gray-500 mt-1">Daten-Management, Konfiguration und Imports</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 lg:w-auto">
          <TabsTrigger value="konto">Kontoauszüge</TabsTrigger>
          <TabsTrigger value="bestellungen">Bestellungen</TabsTrigger>
          <TabsTrigger value="hellofresh">HelloFresh</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        <TabsContent value="konto" className="mt-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaktionen</h2>
              <p className="text-sm text-gray-600 mb-4">
                Alle importierten Kontobewegungen mit Abgleich-Status
              </p>
            </div>
            <TransactionList />
          </div>
        </TabsContent>

        <TabsContent value="bestellungen" className="mt-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Online-Bestellungen</h2>
              <p className="text-sm text-gray-600 mb-4">
                Bestellbestätigungen und AVIS-Dokumente mit Abgleich zu Bons
              </p>
            </div>
            <ImportHistoryTable type="bestellung" />
          </div>
        </TabsContent>

        <TabsContent value="hellofresh" className="mt-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">HelloFresh Zahlungen</h2>
              <p className="text-sm text-gray-600 mb-4">
                HelloFresh-Transaktionen separat von Lebensmittel-Einkäufen
              </p>
            </div>
            <HelloFreshTransactionList />
          </div>
        </TabsContent>

        <TabsContent value="backup" className="mt-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Backup & Restore</h2>
              <p className="text-sm text-gray-600 mb-4">
                Exportiere und importiere deine komplette Datenbank
              </p>
            </div>
            <BackupSection />
          </div>
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Import-Verwaltung</h2>
              <p className="text-sm text-gray-600 mb-4">
                Übersicht aller importierten Dateien und deren Status
              </p>
            </div>
            <ImportTabs />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
