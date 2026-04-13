import { ProductList } from "@/components/product-list"

export default function ProduktePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Produktdatenbank</h1>
        <p className="text-gray-500 mt-1">Alle Produkte aus deinen Bons · Alias-Verwaltung</p>
      </div>

      <ProductList />
    </div>
  )
}
