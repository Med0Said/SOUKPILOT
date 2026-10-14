# SoukPilot — Integrations (modernization phase 4)

Free services with no account, no API key and no domain required. Every
integration is **off by default** and switched on per organization by its
**owner** (Paramètres → Intégrations; audited). Selling, stock and purchasing
never depend on them: when a provider is down, the app says so and the user
types the information.

| Integration | Provider | Licence / terms | Data sent | Limits |
| --- | --- | --- | --- | --- |
| Barcode pre-fill (new article) | Open Food Facts, then Open Beauty Facts | Data ODbL — attribution shown with every suggestion; identifying User-Agent as requested | The barcode only | 10 lookups / minute / shop, 12 / minute for the whole server (OFF allows 15 / minute / IP); results cached 24 h (not found: 1 h) |
| Indicative exchange rates (purchases) | fawazahmed0/exchange-api (jsDelivr, mirror on Cloudflare Pages) | CC0; no stated source, no guarantee | Nothing (downloads the TND rate list) | 30 / minute / shop; cached 6 h |

## Rules

- **Suggestions only.** A barcode result fills the article name only when the
  user clicks "Utiliser ce nom". A converted amount is displayed, never stored
  nor applied to a cost; the official rate is the Banque Centrale de Tunisie's.
- **Server-side only.** The browser never calls a provider (the CSP still
  limits `connect-src` to our own origins); no cookie, session or user data is
  forwarded.
- **Enforced in the database.** `consume_integration_call(org, integration)`
  refuses a call when the integration is off, the caller is not a member, or a
  quota is exceeded. `set_integration_enabled` is owner-only and audited.
- **Robust adapters** (`src/lib/integrations/`): 4–5 s timeout, one retry on
  network errors and 5xx, response size cap, JSON validated with Zod,
  plausibility check on rates, a fallback mirror for rates, in-memory caches,
  last success / failure shown on the Intégrations page.
- **Tests never touch the network**: end-to-end tests run with
  `SP_FAKE_INTEGRATIONS=1` (offline fixtures, refused unless the site runs on
  localhost); unit tests use a fake `fetch`.

## Not added (and why)

- **Transactional e-mail** (Brevo, Mailtrap, SendGrid…): reliable delivery
  needs a domain you own (SPF/DKIM/DMARC); sending "from" a Gmail address
  through a third party is rejected or lands in spam. Until then, Supabase
  sends the authentication e-mails and invitations are shared as a link. With a
  domain, plug it into Supabase Auth's SMTP settings (no code change) and add
  invitation e-mails behind a new switch.
- **Public holidays (Nager.Date)**: verified to return only the fixed-date
  Tunisian holidays — the Eids and Mawlid (the biggest retail peaks) are
  missing, so it would mislead more than help.
