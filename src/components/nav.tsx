"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Receipt, Settings, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfigDialog } from "@/components/config-dialog"
import { ImportModal } from "@/components/import-modal"

const navLinks = [
  { href: "/", label: "Übersicht" },
  { href: "/analyse", label: "Analyse" },
  { href: "/einstellungen", label: "Einstellungen" },
]

export function Nav() {
  const pathname = usePathname()
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)

  // Check if current page is a child of /analyse or /einstellungen (for active styling)
  const isAnalysisActive = pathname === "/analyse" || pathname.startsWith("/analyse?")
  const isSettingsActive = pathname === "/einstellungen" || pathname.startsWith("/einstellungen?")
  const isHomeActive = pathname === "/"

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-6 h-14">
            <Link href="/" className="flex items-center gap-2 text-gray-900 font-semibold">
              <Receipt className="h-5 w-5" />
              eBon Analyzer
            </Link>
            <div className="flex gap-1">
              {navLinks.map(({ href, label }) => {
                let isActive = false
                if (href === "/" && isHomeActive) isActive = true
                if (href === "/analyse" && isAnalysisActive) isActive = true
                if (href === "/einstellungen" && isSettingsActive) isActive = true

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    )}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImportModalOpen(true)}
                title="eBon importieren"
                className="text-gray-600 hover:text-gray-900 gap-2"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Import</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfigDialogOpen(true)}
                title="Konfiguration"
                className="text-gray-600 hover:text-gray-900"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>
      <ConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
      <ImportModal open={importModalOpen} onOpenChange={setImportModalOpen} />
    </>
  )
}
