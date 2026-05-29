"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Pencil, Trash2, Plus, Check, X, Loader2 } from "lucide-react"

const PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899',
  '#14b8a6', '#a855f7',
]

interface TransactionCategory {
  id: number
  muster: string
  kategorie: string
  farbe: string
  created_at: string
}

interface Props {
  onCategoriesChanged?: () => void
}

function ColorSwatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none"
      style={{
        backgroundColor: color,
        borderColor: selected ? '#1f2937' : 'transparent',
        boxShadow: selected ? `0 0 0 2px white, 0 0 0 4px ${color}` : undefined,
      }}
      title={color}
    />
  )
}

function CategoryBadge({ name, farbe }: { name: string; farbe: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{
        backgroundColor: `${farbe}20`,
        borderColor: `${farbe}60`,
        color: farbe,
      }}
    >
      {name}
    </span>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-6 h-6 rounded-full border-2 border-gray-300 hover:scale-110 transition-transform focus:outline-none"
          style={{ backgroundColor: value }}
          title="Farbe ändern"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {PALETTE.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              selected={c === value}
              onClick={() => { onChange(c); setOpen(false) }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TransactionCategoryManager({ onCategoriesChanged }: Props) {
  const [categories, setCategories] = useState<TransactionCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newMuster, setNewMuster] = useState("")
  const [newKategorie, setNewKategorie] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [editId, setEditId] = useState<number | null>(null)
  const [editMuster, setEditMuster] = useState("")
  const [editKategorie, setEditKategorie] = useState("")
  const [editFarbe, setEditFarbe] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/konto/transactions/categories")
      if (!res.ok) throw new Error("Fehler beim Laden")
      const data = await res.json()
      setCategories(data.categories ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleCreate = async () => {
    if (!newMuster.trim()) { setCreateError("Muster darf nicht leer sein"); return }
    if (!newKategorie.trim()) { setCreateError("Kategorie darf nicht leer sein"); return }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/konto/transactions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: newMuster.trim(), kategorie: newKategorie.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message ?? "Anlegen fehlgeschlagen")
      }
      setNewMuster("")
      setNewKategorie("")
      await fetchCategories()
      onCategoriesChanged?.()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Fehler")
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (cat: TransactionCategory) => {
    setEditId(cat.id)
    setEditMuster(cat.muster)
    setEditKategorie(cat.kategorie)
    setEditFarbe(cat.farbe)
  }

  const cancelEdit = () => setEditId(null)

  const handleSave = async (id: number) => {
    if (!editMuster.trim() || !editKategorie.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/konto/transactions/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muster: editMuster.trim(), kategorie: editKategorie.trim(), farbe: editFarbe }),
      })
      if (!res.ok) throw new Error("Speichern fehlgeschlagen")
      setEditId(null)
      await fetchCategories()
      onCategoriesChanged?.()
    } catch {
      // keep edit open on error
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/konto/transactions/categories/${deleteId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Löschen fehlgeschlagen")
      setDeleteId(null)
      await fetchCategories()
      onCategoriesChanged?.()
    } catch {
      // swallow
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchCategories}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* New rule form */}
      <div className="rounded-lg border border-gray-100 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Neue Regel anlegen</h3>
        <div className="flex gap-2 items-start flex-wrap sm:flex-nowrap">
          <Input
            value={newMuster}
            onChange={(e) => { setNewMuster(e.target.value); setCreateError(null) }}
            placeholder="Muster (z.B. HelloFresh)"
            className="flex-1 min-w-[140px]"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Input
            value={newKategorie}
            onChange={(e) => { setNewKategorie(e.target.value); setCreateError(null) }}
            placeholder="Kategorie (z.B. Kochbox)"
            className="flex-1 min-w-[140px]"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={creating} className="gap-2 shrink-0">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Anlegen
          </Button>
        </div>
        {createError && <p className="text-sm text-red-600 mt-2">{createError}</p>}
      </div>

      {/* Rules table */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-gray-500 font-medium">Noch keine Kategorieregeln</p>
          <p className="text-sm text-gray-400 mt-1">Lege oben eine neue Regel an.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">Farbe</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead>Muster</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editId === cat.id ? (
                      <ColorPicker value={editFarbe} onChange={setEditFarbe} />
                    ) : (
                      <div
                        className="w-5 h-5 rounded-full"
                        style={{ backgroundColor: cat.farbe }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {editId === cat.id ? (
                      <Input
                        value={editKategorie}
                        onChange={(e) => setEditKategorie(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(cat.id)
                          if (e.key === "Escape") cancelEdit()
                        }}
                      />
                    ) : (
                      <CategoryBadge name={cat.kategorie} farbe={cat.farbe} />
                    )}
                  </TableCell>
                  <TableCell>
                    {editId === cat.id ? (
                      <Input
                        value={editMuster}
                        onChange={(e) => setEditMuster(e.target.value)}
                        className="h-8 text-sm"
                      />
                    ) : (
                      <code className="text-sm bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                        {cat.muster}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {editId === cat.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                            onClick={() => handleSave(cat.id)}
                            disabled={saving}
                          >
                            {saving
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Check className="h-3.5 w-3.5" />
                            }
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                            title="Bearbeiten"
                            onClick={() => startEdit(cat)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                            title="Löschen"
                            onClick={() => setDeleteId(cat.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regel löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Kategorie-Zuordnung für alle Transaktionen mit diesem Muster wird entfernt. Dies kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
