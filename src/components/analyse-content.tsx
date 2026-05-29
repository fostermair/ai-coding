"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatistikenHeader } from "@/components/statistiken-header"
import { StatistikDashboard } from "@/components/statistik-dashboard"
import { ProductList } from "@/components/product-list"
import { MultiStoreTab } from "@/components/multi-store-tab"
import { PriceChartSheet } from "@/components/price-chart-sheet"
import { WarbenkorbHeatmap } from "@/components/warenkorb-heatmap"

export function AnalyseContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") ?? "statistiken"

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetProduct, setSheetProduct] = useState<string | null>(null)

  const handleTabChange = (newTab: string) => {
    router.replace(`/analyse?tab=${newTab}`)
  }

  const handleProductClick = (alias: string) => {
    setSheetProduct(alias)
    setSheetOpen(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Analyse</h1>
        <p className="text-gray-500 mt-1">Statistiken, Preisbewegungen und Produktdatenbank</p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="statistiken">Statistiken</TabsTrigger>
          <TabsTrigger value="produkte">Produkte</TabsTrigger>
          <TabsTrigger value="multi-store">Multi-Store</TabsTrigger>
          <TabsTrigger value="warenkorb">Warenkorb</TabsTrigger>
        </TabsList>

        <TabsContent value="statistiken" className="mt-6">
          <div className="space-y-6">
            <StatistikenHeader />
            <StatistikDashboard />
          </div>
        </TabsContent>

        <TabsContent value="produkte" className="mt-6">
          <ProductList />
        </TabsContent>

        <TabsContent value="multi-store" className="mt-6">
          <MultiStoreTab onProductClick={handleProductClick} />
        </TabsContent>

        <TabsContent value="warenkorb" className="mt-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Warenkorb-Heatmap</h2>
              <p className="text-sm text-gray-500 mt-0.5">Ausgabenanteil (Fläche) und Preisentwicklung (Farbe) der letzten 12 Monate</p>
            </div>
            <WarbenkorbHeatmap />
          </div>
        </TabsContent>
      </Tabs>

      <PriceChartSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialProduct={sheetProduct}
      />
    </div>
  )
}
