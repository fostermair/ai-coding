"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface AvisDuplicateDialogProps {
  open: boolean
  orderNumber: string
  onConfirm: (shouldReImport: boolean) => void
}

export function AvisDuplicateDialog({ open, orderNumber, onConfirm }: AvisDuplicateDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onConfirm(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>AVIS bereits importiert</AlertDialogTitle>
          <AlertDialogDescription>
            Die AVIS mit Bestellnummer <strong>{orderNumber}</strong> wurde bereits importiert.
            <br />
            <br />
            Möchtest du diese AVIS erneut importieren? Dies kann nützlich sein, wenn du die Matching-Ergebnisse überprüfen oder aktualisieren möchtest.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3 justify-end">
          <AlertDialogCancel onClick={() => onConfirm(false)}>Nein, abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(true)} className="bg-blue-600 hover:bg-blue-700">
            Ja, erneut importieren
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
