import { NextResponse } from "next/server"
import { getAllCategories } from "@/lib/categorization/engine"

export async function GET() {
  try {
    const categories = getAllCategories()
    return NextResponse.json({ categories })
  } catch (e) {
    console.error("[/api/produkte/categories GET]", e)
    return NextResponse.json({ message: "Interner Fehler" }, { status: 500 })
  }
}
