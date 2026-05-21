# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e4]:
      - link "eBon Analyzer" [ref=e5]:
        - /url: /
        - img [ref=e6]
        - text: eBon Analyzer
      - generic [ref=e9]:
        - link "Bons" [ref=e10]:
          - /url: /
        - link "Import" [ref=e11]:
          - /url: /import
        - link "Produkte" [ref=e12]:
          - /url: /produkte
        - link "Statistiken" [ref=e13]:
          - /url: /statistiken
      - button "Konfiguration" [ref=e15] [cursor=pointer]:
        - img
  - main [ref=e16]:
    - generic [ref=e18]:
      - heading "404" [level=1] [ref=e19]
      - heading "This page could not be found." [level=2] [ref=e21]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e27] [cursor=pointer]:
    - img [ref=e28]
  - alert [ref=e33]
```