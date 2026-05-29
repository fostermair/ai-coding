import { redirect } from "next/navigation"

export default function TransaktionenPage() {
  redirect("/einstellungen?tab=konto")
}
