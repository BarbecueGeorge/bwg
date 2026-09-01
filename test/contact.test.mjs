import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, it } from "node:test";
import {
  ERROR_PATH,
  FORMSUBMIT_ENDPOINT,
  LEAD_KEY_PREFIX,
  LEAD_TTL_SECONDS,
  SUCCESS_PATH,
  handleContact,
} from "../src/contact.js";
import worker from "../src/worker.js";

const ORIGIN = "https://www.builtwithgrok.co.uk";
const APEX = "https://builtwithgrok.co.uk";

function formPost(fields, headers = {}, url = `${ORIGIN}/api/contact`) {
  const body = new URLSearchParams(fields).toString();
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN,
      Referer: `${ORIGIN}/contact.html`,
      ...headers,
    },
    body,
  });
}

function validFields(overrides = {}) {
  return {
    name: "Alex Founder",
    email: "alex@acme.com",
    company: "Acme",
    interest: "Grok Product Sprint",
    message: "Ship a Grok agent in two weeks.",
    ...overrides,
  };
}

function mockFetch(status, body, captured) {
  return async (url, init) => {
    captured.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function mockKv() {
  const store = new Map();
  return {
    store,
    async put(key, value, options) {
      store.set(key, { value, options });
    },
  };
}

describe("handleContact", () => {
  it("forwards valid fields to FormSubmit and returns the user to /contact.html?sent=1", async () => {
    const captured = [];
    const kv = mockKv();
    const res = await handleContact(
      formPost(validFields()),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(200, { success: "true", message: "Form submitted" }, captured) }
    );

    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, FORMSUBMIT_ENDPOINT);
    const payload = JSON.parse(captured[0].init.body);
    assert.equal(payload.name, "Alex Founder");
    assert.equal(payload.email, "alex@acme.com");
    assert.equal(payload.company, "Acme");
    assert.equal(payload.interest, "Grok Product Sprint");
    assert.match(payload.message, /Grok agent/);
    assert.equal(captured[0].init.redirect, "manual");
    assert.equal(kv.store.size, 1);
    const [key, record] = [...kv.store.entries()][0];
    assert.equal(key.startsWith(LEAD_KEY_PREFIX), true);
    const lead = JSON.parse(record.value);
    assert.equal(lead.name, "Alex Founder");
    assert.equal(lead.email, "alex@acme.com");
    assert.equal(lead.company, "Acme");
    assert.equal(lead.interest, "Grok Product Sprint");
    assert.match(lead.message, /Grok agent/);
    assert.equal(typeof lead.at, "string");
    assert.ok(Date.parse(lead.at));
    assert.equal(record.options.expirationTtl, LEAD_TTL_SECONDS);
    assert.ok(LEAD_TTL_SECONDS >= 180 * 24 * 60 * 60 - 60);
    assert.ok(LEAD_TTL_SECONDS <= 180 * 24 * 60 * 60 + 60);
  });

  it("returns sent=1 when KV stores the lead even if FormSubmit returns 429", async () => {
    const captured = [];
    const kv = mockKv();
    const res = await handleContact(
      formPost(validFields()),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(429, { success: false, message: "Too many requests" }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(captured.length, 1);
    assert.equal(kv.store.size, 1);
  });

  it("does not treat a FormSubmit message string as success", async () => {
    const captured = [];
    const res = await handleContact(
      formPost(validFields()),
      {},
      { fetchImpl: mockFetch(200, { success: false, message: "Please activate your form" }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(captured.length, 1);
  });

  it("does not treat a message-only FormSubmit body as success", async () => {
    const captured = [];
    const res = await handleContact(
      formPost(validFields()),
      {},
      { fetchImpl: mockFetch(200, { message: "Form submitted" }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
  });

  it("returns error=1 when KV is missing and FormSubmit fails", async () => {
    const captured = [];
    const res = await handleContact(
      formPost(validFields()),
      {},
      { fetchImpl: mockFetch(429, { message: "rate limited" }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
  });

  it("still succeeds when KV is missing but FormSubmit reports success", async () => {
    const captured = [];
    const res = await handleContact(
      formPost(validFields()),
      {},
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
  });

  it("does not follow an upstream FormSubmit Location header", async () => {
    const captured = [];
    const fetchImpl = async (url, init) => {
      captured.push({ url, init });
      return new Response("", {
        status: 302,
        headers: { Location: "https://formsubmit.co/thanks" },
      });
    };
    const res = await handleContact(
      formPost({
        name: "Alex",
        email: "alex@acme.com",
        message: "Hello",
      }),
      {},
      { fetchImpl }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(res.headers.get("Location")?.includes("formsubmit.co"), false);
  });

  it("accepts www Origin on an apex POST and apex Origin on a www POST", async () => {
    const captured = [];
    const kv = mockKv();
    const apexToWww = await handleContact(
      formPost(validFields(), { Origin: APEX, Referer: `${APEX}/contact.html` }),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(429, { success: "false" }, captured) }
    );
    assert.equal(apexToWww.status, 303);
    assert.equal(apexToWww.headers.get("Location"), SUCCESS_PATH);

    const wwwToApex = await handleContact(
      formPost(
        validFields({ email: "pat@acme.com" }),
        { Origin: ORIGIN, Referer: `${ORIGIN}/contact.html` },
        `${APEX}/api/contact`
      ),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(429, { success: "false" }, captured) }
    );
    assert.equal(wwwToApex.status, 303);
    assert.equal(wwwToApex.headers.get("Location"), SUCCESS_PATH);
    assert.equal(kv.store.size, 2);
  });

  it("silently succeeds on honeypot without calling FormSubmit or writing KV", async () => {
    const captured = [];
    const kv = mockKv();
    const res = await handleContact(
      formPost({
        name: "Bot",
        email: "bot@spam.test",
        message: "spam",
        honeypot: "filled",
      }),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(captured.length, 0);
    assert.equal(kv.store.size, 0);
  });

  it("rejects missing required fields without calling FormSubmit", async () => {
    const captured = [];
    const kv = mockKv();
    const res = await handleContact(
      formPost({ name: "Alex", email: "not-an-email", message: "Hi" }),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(captured.length, 0);
    assert.equal(kv.store.size, 0);
  });

  it("rejects cross-origin posts", async () => {
    const captured = [];
    const kv = mockKv();
    const res = await handleContact(
      formPost(
        { name: "Alex", email: "alex@acme.com", message: "Hi" },
        { Origin: "https://evil.example" }
      ),
      { CONTACT_LEADS: kv },
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(captured.length, 0);
    assert.equal(kv.store.size, 0);
  });

  it("redirects GET /api/contact back to the contact page", async () => {
    const res = await handleContact(new Request(`${ORIGIN}/api/contact`));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), "/contact.html");
  });
});

describe("worker routing", () => {
  it("handles POST /api/contact", async () => {
    const res = await worker.fetch(
      formPost({
        name: "Alex",
        email: "alex@acme.com",
        message: "Hi",
        honeypot: "bot",
      }),
      {}
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
  });

  it("passes CONTACT_LEADS through and succeeds when FormSubmit returns 429", async () => {
    const kv = mockKv();
    const captured = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(429, { success: false, message: "rate limited" }, captured);
    try {
      const res = await worker.fetch(formPost(validFields()), { CONTACT_LEADS: kv });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get("Location"), SUCCESS_PATH);
      assert.equal(kv.store.size, 1);
      const [key, record] = [...kv.store.entries()][0];
      assert.equal(key.startsWith(LEAD_KEY_PREFIX), true);
      const lead = JSON.parse(record.value);
      assert.equal(lead.email, "alex@acme.com");
      assert.equal(captured.length, 1);
      assert.equal(captured[0].url, FORMSUBMIT_ENDPOINT);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("404s unknown /api paths", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/unknown`), {});
    assert.equal(res.status, 404);
  });

  it("passes non-API requests to static assets", async () => {
    let forwarded = null;
    const env = {
      ASSETS: {
        fetch(request) {
          forwarded = request;
          return new Response("ok");
        },
      },
    };
    const req = new Request(`${ORIGIN}/contact.html`);
    const res = await worker.fetch(req, env);
    assert.equal(await res.text(), "ok");
    assert.equal(new URL(forwarded.url).pathname, "/contact.html");
  });
});

describe("browser assets", () => {
  function walk(dir, files = []) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, files);
      else files.push(path);
    }
    return files;
  }

  it("never point the browser at formsubmit.co", () => {
    const files = walk("website").filter((path) =>
      [".html", ".js", ".css"].includes(extname(path))
    );
    const hits = [];
    for (const path of files) {
      if (path.includes("/rive/")) continue;
      const text = readFileSync(path, "utf8");
      if (text.includes("formsubmit.co") || text.includes("formsubmit.co/")) {
        hits.push(path);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("posts the contact form same-origin to /api/contact", () => {
    const html = readFileSync("website/contact.html", "utf8");
    assert.match(html, /action="\/api\/contact"/);
    assert.match(html, /method="POST"/);
    assert.match(html, /name="honeypot"/);
    assert.doesNotMatch(html, /formsubmit\.co/);
  });

  it("wires CONTACT_LEADS to the existing KV namespace in wrangler.jsonc", () => {
    const config = readFileSync("wrangler.jsonc", "utf8");
    assert.match(config, /"binding":\s*"CONTACT_LEADS"/);
    assert.match(config, /"id":\s*"be9028b297a44aa0bda686d09e3d7f6f"/);
  });

  it("states sole-trader privacy facts without a company or VAT number", () => {
    const html = readFileSync("website/privacy.html", "utf8");
    assert.match(html, /sole trader/i);
    assert.match(html, /no Companies House number/);
    assert.doesNotMatch(html, /Company number\s+\d/);
    assert.doesNotMatch(html, /VAT\s*(number|reg)/i);
    assert.doesNotMatch(html, /ICO registration/i);
    assert.match(html, /Cloudflare Worker/i);
    assert.match(html, /hello@builtwithgrok\.co\.uk/);
    assert.match(html, /best-effort/i);
    assert.match(html, /FormSubmit/);
    assert.match(html, /browser does not visit FormSubmit/i);
    assert.doesNotMatch(html, /formsubmit\.co/);
  });
});
