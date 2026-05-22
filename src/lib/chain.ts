const CHAIN_KEYWORDS: Record<string, string> = {
  REWE: "rewe",
  LIDL: "lidl",
  KAUFLAND: "kaufland",
  EDEKA: "edeka",
  ALDI: "aldi",
  PENNY: "penny",
  NETTO: "netto",
}

export function detectChain(text: string | null | undefined): string | null {
  if (!text) return null
  const upper = text.toUpperCase()
  for (const [keyword, chain] of Object.entries(CHAIN_KEYWORDS)) {
    if (upper.includes(keyword)) return chain
  }
  return null
}

export const CHAIN_BADGES: Record<string, { src: string; label: string }> = {
  rewe:     { src: "/badges/rewe.png",     label: "REWE" },
  lidl:     { src: "/badges/lidl.jpg",     label: "Lidl" },
  kaufland: { src: "/badges/kaufland.jpg", label: "Kaufland" },
  edeka:    { src: "/badges/edeka.png",    label: "EDEKA" },
}
