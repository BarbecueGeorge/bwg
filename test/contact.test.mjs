import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, it } from "node:test";
import {
  ERROR_PATH,
  FORMSUBMIT_ENDPOINT,
  SUCCESS_PATH,
  handleContact,
} from "../src/contact.js";
import worker from "../src/worker.js";

const ORIGIN = "https://www.builtwithgrok.co.uk";

function formPost(fields, headers = {}) {
  const body = new URLSearchParams(fields).toString();
  return new Request(`${ORIGIN}/api/contact`, {
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

function mockFetch(status, body, captured) {
  return async (url, init) => {
    captured.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("handleContact", () => {
  it("forwards valid fields to FormSubmit and returns the user to /contact.html?sent=1", async () => {
    const captured = [];
    const res = await handleContact(
      formPost({
        name: "Alex Founder",
        email: "alex@acme.com",
        company: "Acme",
        interest: "Grok Product Sprint",
        message: "Ship a Grok agent in two weeks.",
      }),
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
      { fetchImpl }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(res.headers.get("Location")?.includes("formsubmit.co"), false);
  });

  it("silently succeeds on honeypot without calling FormSubmit", async () => {
    const captured = [];
    const res = await handleContact(
      formPost({
        name: "Bot",
        email: "bot@spam.test",
        message: "spam",
        honeypot: "filled",
      }),
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(captured.length, 0);
  });

  it("rejects missing required fields without calling FormSubmit", async () => {
    const captured = [];
    const res = await handleContact(
      formPost({ name: "Alex", email: "not-an-email", message: "Hi" }),
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(captured.length, 0);
  });

  it("rejects cross-origin posts", async () => {
    const captured = [];
    const res = await handleContact(
      formPost(
        { name: "Alex", email: "alex@acme.com", message: "Hi" },
        { Origin: "https://evil.example" }
      ),
      { fetchImpl: mockFetch(200, { success: true }, captured) }
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(captured.length, 0);
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

  it("states sole-trader privacy facts without a company number", () => {
    const html = readFileSync("website/privacy.html", "utf8");
    assert.match(html, /sole trader/i);
    assert.match(html, /no Companies House number/);
    assert.doesNotMatch(html, /Company number\s+\d/);
    assert.doesNotMatch(html, /ICO registration/i);
  });
});
