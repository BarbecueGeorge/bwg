# Built With Grok — Marketing Website

Static customer-facing site for **Built With Grok** (AI product consultancy).

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Home — positioning, offers, CTA |
| `services.html` | Three products/services + supporting offers |
| `about.html` | Mission, ICP, how we work |
| `contact.html` | Project inquiry form + email |
| `privacy.html` | Sole-trader privacy notice |

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
# Python (static pages only — form POST needs the Worker)
python -m http.server 8080 --directory website

# Worker + static site (preferred)
npm install
npm run dev
```

Then visit `http://localhost:8080` (Python) or the Wrangler URL (form works).

## Deploy

Cloudflare Worker `built-with-grok` serves `website/` and handles `POST /api/contact`.

- **Root:** `wrangler.jsonc` assets directory is `./website`
- **Contact form:** native POST to `/api/contact`; the Worker forwards to FormSubmit and redirects to `/contact.html?sent=1`

## Brand notes

- Tagline: *Products, not pilots. Built with Grok.*
- Stack affinity: Grok / xAI first, integration-ready
- Tone: direct, builder-culture
