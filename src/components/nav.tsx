"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Receipt } from "lucide-react"

const navLinks = [
  { href: "/", label: "Bons" },
  { href: "/import", label: "Import" },
  { href: "/produkte", label: "Produkte" },
  { href: "/statistiken", label: "Statistiken" },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-6 h-14">
          <Link href="/" className="flex items-center gap-2 text-gray-900 font-semibold">
            <Receipt className="h-5 w-5" />
            eBon Analyzer
          </Link>
          <div className="flex gap-1">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
