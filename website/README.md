# Built With Grok — Marketing Website

Static customer-facing site for **Built With Grok** (AI product consultancy).

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Home — positioning, offers, CTA |
| `services.html` | Three products/services + supporting offers |
| `about.html` | Mission, ICP, how we work |
| `contact.html` | Project inquiry form + email |

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
# Python
python -m http.server 8080 --directory website

# Node (if npx available)
npx --yes serve website
```

Then visit `http://localhost:8080`.

## Deploy

Any static host works: Cloudflare Pages, Netlify, GitHub Pages, S3 + CDN.

- **Root:** point publish directory at `website/`
- **Contact form:** wire `#contact-form` to Formspree, Netlify Forms, Cloudflare Workers, or your API (currently client-side demo + `mailto:`)

## Brand notes

- Tagline: *Products, not pilots. Built with Grok.*
- Stack affinity: Grok / xAI first, integration-ready
- Tone: direct, builder-culture
