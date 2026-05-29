"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatistikenHeader } from "@/components/statistiken-header"
import { StatistikDashboard } from "@/components/statistik-dashboard"
import { ProductList } from "@/components/product-list"

export default function AnalysePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get("tab") ?? "statistiken"

  const handleTabChange = (newTab: string) => {
    router.replace(`/analyse?tab=${newTab}`)
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
      </Tabs>
    </div>
  )
}
