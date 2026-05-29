"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ImportZone } from "@/components/import-zone"
import { ImportHistoryTable } from "@/components/import-history-table"
import { HelloFreshImportPanel } from "@/components/hellofresh-import-panel"

export function ImportTabs() {
  return (
    <Tabs defaultValue="import">
      <TabsList className="mb-6">
        <TabsTrigger value="import">Import</TabsTrigger>
        <TabsTrigger value="bestellung">Bestellungen</TabsTrigger>
        <TabsTrigger value="avis">AVIS</TabsTrigger>
        <TabsTrigger value="ebon">eBons</TabsTrigger>
        <TabsTrigger value="kontoauszug">Kontoauszüge</TabsTrigger>
        <TabsTrigger value="hellofresh">HelloFresh</TabsTrigger>
      </TabsList>

      <TabsContent value="import">
        <ImportZone />
      </TabsContent>

      <TabsContent value="bestellung">
        <ImportHistoryTable type="bestellung" />
      </TabsContent>

      <TabsContent value="avis">
        <ImportHistoryTable type="avis" />
      </TabsContent>

      <TabsContent value="ebon">
        <ImportHistoryTable type="ebon" />
      </TabsContent>

      <TabsContent value="kontoauszug">
        <ImportHistoryTable type="kontoauszug" />
      </TabsContent>

      <TabsContent value="hellofresh">
        <HelloFreshImportPanel />
      </TabsContent>
    </Tabs>
  )
}
