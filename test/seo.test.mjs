import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import worker from "../src/worker.js";

const ORIGIN = "https://www.builtwithgrok.co.uk";
const STUDIO =
  "Built with Grok is the UK’s first exclusively Grok AI studio that ships software and hardware experiences with Grok as the intelligence layer.";
const OG_IMAGE = `${ORIGIN}/assets/brand/logo-icon-1024.png`;

const PAGES = [
  {
    file: "website/index.html",
    path: "/",
    title: "Built With Grok — Products, not pilots",
    description:
      "Built With Grok designs and ships AI-powered software and physical products using Grok as the intelligence layer. From sprint to production.",
  },
  {
    file: "website/about.html",
    path: "/about",
    title: "About — Built With Grok",
    description: STUDIO,
  },
  {
    file: "website/services.html",
    path: "/services",
    title: "Services — Built With Grok",
    description:
      "Grok Product Sprint, Production AI Systems, and Physical × AI Lab. Scope, outcomes, and pricing bands from Built With Grok.",
  },
  {
    file: "website/contact.html",
    path: "/contact",
    title: "Contact — Built With Grok",
    description:
      "Start a project with Built With Grok. Tell us what you want to ship—sprint, production AI, or Physical × AI.",
  },
  {
    file: "website/privacy.html",
    path: "/privacy",
    title: "Privacy — Built With Grok",
    description:
      "How Built With Grok collects, uses, and looks after personal data from the website and project enquiries.",
  },
];

function decodeEntities(value) {
  return value
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&times;/g, "×")
    .replace(/&amp;/g, "&");
}

function attr(html, name) {
  const match = html.match(new RegExp(`${name}="([^"]*)"`));
  assert.ok(match, `missing ${name}`);
  return decodeEntities(match[1]);
}

function jsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing JSON-LD");
  return JSON.parse(match[1]);
}

describe("sitemap and robots", () => {
  it("lists the five public www URLs without .html", () => {
    const xml = readFileSync("website/sitemap.xml", "utf8");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, [
      `${ORIGIN}/`,
      `${ORIGIN}/about`,
      `${ORIGIN}/services`,
      `${ORIGIN}/contact`,
      `${ORIGIN}/privacy`,
    ]);
    assert.doesNotMatch(xml, /\.html/);
  });

  it("allows crawlers and points at the www sitemap", () => {
    const robots = readFileSync("website/robots.txt", "utf8");
    assert.match(robots, /User-agent:\s*\*/);
    assert.match(robots, /Allow:\s*\//);
    assert.match(robots, new RegExp(`Sitemap:\\s*${ORIGIN}/sitemap\\.xml`));
    assert.doesNotMatch(robots, /content-signal/i);
    assert.doesNotMatch(robots, /ai-train/i);
  });
});

describe("per-page technical SEO", () => {
  it("gives each page a unique title and description", () => {
    const titles = new Set();
    const descriptions = new Set();
    for (const page of PAGES) {
      const html = readFileSync(page.file, "utf8");
      const title = decodeEntities(html.match(/<title>([^<]+)<\/title>/)[1]);
      const description = attr(html, "name=\"description\" content");
      assert.equal(title, page.title);
      assert.equal(description, page.description);
      titles.add(title);
      descriptions.add(description);
    }
    assert.equal(titles.size, PAGES.length);
    assert.equal(descriptions.size, PAGES.length);
  });

  it("sets www HTTPS canonical, Open Graph, Twitter cards, and JSON-LD", () => {
    for (const page of PAGES) {
      const html = readFileSync(page.file, "utf8");
      const canonical = `${ORIGIN}${page.path}`;
      assert.equal(attr(html, 'rel="canonical" href'), canonical);
      assert.equal(attr(html, 'property="og:url" content'), canonical);
      assert.equal(attr(html, 'property="og:title" content'), page.title);
      assert.equal(attr(html, 'property="og:description" content'), page.description);
      assert.equal(attr(html, 'property="og:image" content'), OG_IMAGE);
      assert.equal(attr(html, 'property="og:site_name" content'), "Built With Grok");
      assert.equal(attr(html, 'name="twitter:card" content'), "summary_large_image");
      assert.equal(attr(html, 'name="twitter:title" content'), page.title);
      assert.equal(attr(html, 'name="twitter:description" content'), page.description);
      assert.equal(attr(html, 'name="twitter:image" content'), OG_IMAGE);
      assert.equal(attr(html, 'name="twitter:site" content'), "@BuiltWithGrok");

      const data = jsonLd(html);
      const types = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
      assert.ok(types.includes("ProfessionalService"));
      assert.ok(types.includes("Organization"));
      assert.equal(data.name, "Built With Grok");
      assert.equal(data.url, `${ORIGIN}/`);
      assert.deepEqual(data.sameAs, ["https://x.com/BuiltWithGrok"]);
      assert.equal(data.description, STUDIO);
      assert.equal(data.areaServed?.name, "United Kingdom");
      assert.equal("taxID" in data, false);
      assert.equal("vatID" in data, false);
      assert.equal("leiCode" in data, false);
      assert.doesNotMatch(JSON.stringify(data), /VAT/i);
      assert.doesNotMatch(JSON.stringify(data), /Companies House/i);
      assert.doesNotMatch(JSON.stringify(data), /company number/i);
    }
  });

  it("keeps the About studio sentence and footer X profile link", () => {
    const about = readFileSync("website/about.html", "utf8");
    assert.match(about, /exclusively Grok AI studio/);
    assert.doesNotMatch(about, /exclusively Grok AI consultancy/);
    for (const page of PAGES) {
      const html = readFileSync(page.file, "utf8");
      assert.match(html, /href="https:\/\/x\.com\/BuiltWithGrok"/);
    }
  });

  it("does not change the contact form", () => {
    const html = readFileSync("website/contact.html", "utf8");
    assert.match(html, /id="contact-form"/);
    assert.match(html, /action="\/api\/contact"/);
    assert.match(html, /method="POST"/);
    assert.match(html, /name="honeypot"/);
  });
});

describe("Worker still serves SEO files as assets", () => {
  it("leaves run_worker_first as /api/* only", () => {
    const config = readFileSync("wrangler.jsonc", "utf8");
    assert.match(config, /"run_worker_first":\s*\[\s*"\/api\/\*"\s*\]/);
  });

  it("forwards /sitemap.xml and /robots.txt to ASSETS", async () => {
    const forwarded = [];
    const env = {
      ASSETS: {
        fetch(request) {
          forwarded.push(new URL(request.url).pathname);
          return new Response("asset");
        },
      },
    };
    const sitemap = await worker.fetch(new Request(`${ORIGIN}/sitemap.xml`), env);
    const robots = await worker.fetch(new Request(`${ORIGIN}/robots.txt`), env);
    assert.equal(await sitemap.text(), "asset");
    assert.equal(await robots.text(), "asset");
    assert.deepEqual(forwarded, ["/sitemap.xml", "/robots.txt"]);
  });

  it("uses the existing brand OG image file", () => {
    assert.equal(existsSync("website/assets/brand/logo-icon-1024.png"), true);
  });
});
