import { BonDetailView } from "@/components/bon-detail"

export default async function BonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <BonDetailView bonId={id} />
    </div>
  )
}
