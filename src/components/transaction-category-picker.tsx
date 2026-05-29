"use client"

import React, { useState, useCallback } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Tag } from "lucide-react"

export interface CategoryOption {
  name: string
  farbe: string
}

interface Props {
  txId: number
  beschreibung: string
  haendlerName: string | null
  empfaengerName: string | null
  kategorie: string | null
  kategorieFarbe: string | null
  categories: CategoryOption[]
  onChanged: () => void
}

export function TransactionCategoryPicker({
  beschreibung, haendlerName, empfaengerName,
  kategorie, kategorieFarbe, categories, onChanged,
}: Props) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [saving, setSaving] = useState(false)

  // Use the most general stable identifier as the match pattern
  const muster = haendlerName ?? empfaengerName ?? beschreibung

  const filtered = inputValue.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(inputValue.toLowerCase()))
    : categories
  const showCreate = inputValue.trim() &&
    !categories.some((c) => c.name.toLowerCase() === inputValue.toLowerCase().trim())

  const assign = useCallback(async (newKategorie: string, farbe?: string) => {
    setSaving(true)
    try {
      const body: Record<string, string> = { muster, kategorie: newKategorie }
      if (farbe) body.farbe = farbe
      const res = await fetch("/api/konto/transactions/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        const listRes = await fetch("/api/konto/transactions/categories")
        if (!listRes.ok) return
        const { categories: rules } = await listRes.json() as { categories: { id: number; muster: string; kategorie: string }[] }
        const existing = rules.find((r) => r.muster === muster)
        if (existing) {
          await fetch(`/api/konto/transactions/categories/${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ muster, kategorie: newKategorie, ...(farbe ? { farbe } : {}) }),
          })
        }
      }
      setOpen(false)
      setInputValue("")
      onChanged()
    } finally {
      setSaving(false)
    }
  }, [muster, onChanged])

  const handleSelect = (cat: CategoryOption) => {
    if (!saving) assign(cat.name, cat.farbe)
  }

  const handleCreate = () => {
    const name = inputValue.trim()
    if (name && !saving) assign(name)
  }

  const farbe = kategorieFarbe ?? '#6366f1'

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setInputValue("") }}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {kategorie ? (
          <button
            className="inline-flex self-start items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5 cursor-pointer transition-opacity hover:opacity-80 w-fit"
            style={{
              backgroundColor: `${farbe}20`,
              borderColor: `${farbe}60`,
              color: farbe,
            }}
          >
            {kategorie}
          </button>
        ) : (
          <button
            className="flex items-center gap-1 text-xs text-gray-300 hover:text-indigo-500 mt-0.5 transition-colors"
            title="Kategorie zuweisen"
          >
            <Tag className="h-3 w-3" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Kategorie suchen oder anlegen …"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <div className="py-6 text-center text-sm text-gray-500">Keine Kategorien gefunden</div>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((cat) => (
                  <CommandItem
                    key={cat.name}
                    value={cat.name}
                    onSelect={() => handleSelect(cat)}
                    className="cursor-pointer gap-2"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.farbe }}
                    />
                    <span className="truncate">{cat.name}</span>
                    {cat.name === kategorie && <span className="ml-auto text-xs opacity-60">✓</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${inputValue}`}
                  onSelect={handleCreate}
                  className="cursor-pointer text-indigo-700"
                >
                  <span>+ &bdquo;{inputValue.trim()}&ldquo; anlegen</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
