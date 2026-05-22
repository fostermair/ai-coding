"use client"

import { useEffect, useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Trash2, Upload } from "lucide-react"

interface MarketAliasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeName: string
  currentAlias?: string | null
  currentLogoPath?: string | null
  onSaved: () => void
}

export function MarketAliasDialog({
  open,
  onOpenChange,
  storeName,
  currentAlias,
  currentLogoPath,
  onSaved,
}: MarketAliasDialogProps) {
  const [alias, setAlias] = useState(currentAlias ?? "")
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [blobPreview, setBlobPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!logoFile) {
      setBlobPreview(null)
      return
    }
    const url = URL.createObjectURL(logoFile)
    setBlobPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  useEffect(() => {
    if (open) {
      setAlias(currentAlias ?? "")
      setLogoFile(null)
      setError(null)
    }
  }, [open, currentAlias])

  const logoPreview = blobPreview ?? currentLogoPath ?? null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      setError("Logo zu groß (max. 500 KB)")
      return
    }
    setLogoFile(file)
    setError(null)
  }

  const handleSave = async () => {
    if (!alias.trim()) {
      setError("Alias darf nicht leer sein")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("store_name", storeName)
      formData.append("alias", alias.trim())
      if (logoFile) formData.append("logo", logoFile)

      const res = await fetch("/api/bons/market-alias", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? "Speichern fehlgeschlagen")
      }
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Speichern")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch("/api/bons/market-alias", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_name: storeName }),
      })
      if (!res.ok) throw new Error("Löschen fehlgeschlagen")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Löschen")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Markt-Alias</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Marktname</Label>
            <p className="text-sm font-mono text-gray-700 bg-gray-50 rounded px-3 py-2 break-all">
              {storeName}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="alias">Alias (lesbarer Name)</Label>
            <Input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="z.B. Mein REWE"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label>Logo (optional, PNG/JPG, max. 500 KB)</Label>
            <div className="flex items-center gap-3">
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Logo-Vorschau"
                  className="h-8 w-auto object-contain rounded border border-gray-200"
                />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {logoPreview ? "Logo ändern" : "Logo hochladen"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {currentAlias && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-2"
                onClick={handleDelete}
                disabled={deleting || saving}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Alias löschen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
