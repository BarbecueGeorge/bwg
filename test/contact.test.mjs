import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, it } from "node:test";
import {
  CONTACT_EMAIL,
  ERROR_PATH,
  FROM_ADDRESS,
  FROM_NAME,
  LEAD_KEY_PREFIX,
  LEAD_TTL_SECONDS,
  SUCCESS_PATH,
  buildRawEnquiryEmail,
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

class FakeEmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}

function mockKv(options = {}) {
  const store = new Map();
  return {
    store,
    async put(key, value, putOptions) {
      if (options.fail) throw new Error("kv put failed");
      store.set(key, { value, options: putOptions });
    },
  };
}

function mockEmail(behavior = "ok") {
  const sent = [];
  return {
    sent,
    EMAIL: {
      async send(message) {
        sent.push(message);
        if (behavior === "throw") {
          const err = new Error("send failed");
          err.code = "E_DELIVERY_FAILED";
          throw err;
        }
        return { messageId: "msg-test-1" };
      },
    },
  };
}

function contactEnv(kv, email) {
  return {
    env: {
      CONTACT_LEADS: kv,
      EMAIL: email.EMAIL,
    },
    options: { EmailMessage: FakeEmailMessage },
  };
}

function assertLead(kv, fields) {
  assert.equal(kv.store.size, 1);
  const [key, record] = [...kv.store.entries()][0];
  assert.equal(key.startsWith(LEAD_KEY_PREFIX), true);
  const lead = JSON.parse(record.value);
  assert.equal(lead.name, fields.name);
  assert.equal(lead.email, fields.email);
  assert.equal(lead.company, fields.company);
  assert.equal(lead.interest, fields.interest);
  assert.equal(lead.message, fields.message);
  assert.equal(typeof lead.at, "string");
  assert.ok(Date.parse(lead.at));
  assert.equal(record.options.expirationTtl, LEAD_TTL_SECONDS);
  return lead;
}

function assertEnquiryMessage(message, fields, at) {
  assert.equal(message instanceof FakeEmailMessage, true);
  assert.equal(message.from, FROM_ADDRESS);
  assert.equal(message.to, CONTACT_EMAIL);
  assert.equal(typeof message.raw, "string");
  assert.equal(message.html, undefined);
  assert.equal(message.replyTo, undefined);
  assert.equal(message.text, undefined);
  assert.match(message.raw, new RegExp(`From: ${FROM_NAME} <${FROM_ADDRESS}>`));
  assert.match(message.raw, new RegExp(`To: ${CONTACT_EMAIL}`));
  assert.match(message.raw, new RegExp(`Reply-To: ${fields.email}`));
  assert.match(message.raw, new RegExp(`Subject: Built With Grok enquiry from ${fields.name}`));
  assert.match(message.raw, new RegExp(`Name: ${fields.name}`));
  assert.match(message.raw, new RegExp(`Email: ${fields.email}`));
  assert.match(message.raw, new RegExp(`Company: ${fields.company}`));
  assert.match(message.raw, new RegExp(`Interest: ${fields.interest}`));
  assert.match(message.raw, /Message:/);
  assert.match(message.raw, new RegExp(fields.message));
  assert.match(message.raw, /Sent: /);
  if (at) assert.match(message.raw, new RegExp(`Sent: ${at}`));
}

async function withCapturedErrors(fn) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => {
    errors.push(args);
  };
  try {
    return { result: await fn(), errors };
  } finally {
    console.error = original;
  }
}

describe("handleContact", () => {
  it("emails hello@ via EmailMessage, persists KV, and returns /contact.html?sent=1", async () => {
    const kv = mockKv();
    const email = mockEmail();
    const fields = validFields();
    const { env, options } = contactEnv(kv, email);
    const res = await handleContact(formPost(fields), env, options);

    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    const lead = assertLead(kv, fields);
    assert.equal(email.sent.length, 1);
    assertEnquiryMessage(email.sent[0], fields, lead.at);
    assert.ok(LEAD_TTL_SECONDS >= 180 * 24 * 60 * 60 - 60);
    assert.ok(LEAD_TTL_SECONDS <= 180 * 24 * 60 * 60 + 60);
  });

  it("returns sent=1 when KV stores the lead even if email send throws, and logs the error", async () => {
    const kv = mockKv();
    const email = mockEmail("throw");
    const fields = validFields();
    const { env, options } = contactEnv(kv, email);
    const { result: res, errors } = await withCapturedErrors(() =>
      handleContact(formPost(fields), env, options)
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(email.sent.length, 1);
    const lead = assertLead(kv, fields);
    assert.equal(lead.emailed, false);
    assert.equal(lead.sendError, "send failed");
    assert.equal(lead.sendErrorCode, "E_DELIVERY_FAILED");
    assert.ok(errors.some((args) => String(args[0]).includes("contact_email_send_failed")));
    assert.ok(errors.some((args) => String(args[0]).includes("E_DELIVERY_FAILED")));
  });

  it("returns sent=1 when KV is missing but EmailMessage send succeeds", async () => {
    const email = mockEmail();
    const fields = validFields();
    const res = await handleContact(formPost(fields), { EMAIL: email.EMAIL }, { EmailMessage: FakeEmailMessage });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(email.sent.length, 1);
    assertEnquiryMessage(email.sent[0], fields);
  });

  it("returns error=1 when KV is missing and email send throws, and logs the error", async () => {
    const email = mockEmail("throw");
    const { result: res, errors } = await withCapturedErrors(() =>
      handleContact(formPost(validFields()), { EMAIL: email.EMAIL }, { EmailMessage: FakeEmailMessage })
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(email.sent.length, 1);
    assert.ok(errors.some((args) => String(args[0]).includes("contact_email_send_failed")));
  });

  it("returns error=1 when KV is missing and the EMAIL binding is absent, and logs the error", async () => {
    const { result: res, errors } = await withCapturedErrors(() =>
      handleContact(formPost(validFields()), {}, { EmailMessage: FakeEmailMessage })
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.ok(errors.some((args) => String(args[0]).includes("contact_email_send_failed")));
    assert.ok(errors.some((args) => String(args[0]).includes("E_BINDING_MISSING")));
  });

  it("returns sent=1 when email send succeeds even if KV put throws", async () => {
    const kv = mockKv({ fail: true });
    const email = mockEmail();
    const { env, options } = contactEnv(kv, email);
    const res = await handleContact(formPost(validFields()), env, options);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(kv.store.size, 0);
    assert.equal(email.sent.length, 1);
  });

  it("accepts www Origin on an apex POST and apex Origin on a www POST", async () => {
    const kv = mockKv();
    const email = mockEmail();
    const { env, options } = contactEnv(kv, email);
    const apexToWww = await handleContact(
      formPost(validFields(), { Origin: APEX, Referer: `${APEX}/contact.html` }),
      env,
      options
    );
    assert.equal(apexToWww.status, 303);
    assert.equal(apexToWww.headers.get("Location"), SUCCESS_PATH);

    const wwwToApex = await handleContact(
      formPost(
        validFields({ email: "pat@acme.com" }),
        { Origin: ORIGIN, Referer: `${ORIGIN}/contact.html` },
        `${APEX}/api/contact`
      ),
      env,
      options
    );
    assert.equal(wwwToApex.status, 303);
    assert.equal(wwwToApex.headers.get("Location"), SUCCESS_PATH);
    assert.equal(kv.store.size, 2);
    assert.equal(email.sent.length, 2);
    assert.match(email.sent[1].raw, /Reply-To: pat@acme.com/);
  });

  it("silently succeeds on honeypot without sending email or writing KV", async () => {
    const kv = mockKv();
    const email = mockEmail();
    const { env, options } = contactEnv(kv, email);
    const res = await handleContact(
      formPost({
        name: "Bot",
        email: "bot@spam.test",
        message: "spam",
        honeypot: "filled",
      }),
      env,
      options
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(email.sent.length, 0);
    assert.equal(kv.store.size, 0);
  });

  it("rejects missing required fields without sending email or writing KV", async () => {
    const kv = mockKv();
    const email = mockEmail();
    const { env, options } = contactEnv(kv, email);
    const res = await handleContact(
      formPost({ name: "Alex", email: "not-an-email", message: "Hi" }),
      env,
      options
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(email.sent.length, 0);
    assert.equal(kv.store.size, 0);
  });

  it("rejects cross-origin posts", async () => {
    const kv = mockKv();
    const email = mockEmail();
    const { env, options } = contactEnv(kv, email);
    const res = await handleContact(
      formPost(
        { name: "Alex", email: "alex@acme.com", message: "Hi" },
        { Origin: "https://evil.example" }
      ),
      env,
      options
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), ERROR_PATH);
    assert.equal(email.sent.length, 0);
    assert.equal(kv.store.size, 0);
  });

  it("redirects GET /api/contact back to the contact page", async () => {
    const res = await handleContact(new Request(`${ORIGIN}/api/contact`));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), "/contact.html");
  });
});

describe("buildRawEnquiryEmail", () => {
  it("strips newlines from the subject name and sets notify From / hello To / Reply-To", () => {
    const raw = buildRawEnquiryEmail({
      name: "Alex\r\nBcc: evil@example.com",
      email: "alex@acme.com",
      company: "",
      interest: "",
      message: "Hello",
      at: "2026-09-02T12:00:00.000Z",
    });
    const subjectLine = raw.split("\r\n").find((line) => line.startsWith("Subject:"));
    assert.ok(subjectLine);
    assert.equal(subjectLine.includes("\n"), false);
    assert.equal(subjectLine.includes("\r"), false);
    assert.doesNotMatch(raw, /\r\nBcc:/i);
    assert.match(raw, new RegExp(`From: ${FROM_NAME} <${FROM_ADDRESS}>`));
    assert.match(raw, new RegExp(`To: ${CONTACT_EMAIL}`));
    assert.match(raw, /Reply-To: alex@acme.com/);
    assert.match(raw, /Company: \(not provided\)/);
    assert.match(raw, /Interest: \(not provided\)/);
    assert.match(raw, /Sent: 2026-09-02T12:00:00.000Z/);
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

  it("passes CONTACT_LEADS through and succeeds when EmailMessage cannot load in Node", async () => {
    const kv = mockKv();
    const email = mockEmail();
    const { result: res, errors } = await withCapturedErrors(() =>
      worker.fetch(formPost(validFields()), {
        CONTACT_LEADS: kv,
        EMAIL: email.EMAIL,
      })
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("Location"), SUCCESS_PATH);
    assert.equal(kv.store.size, 1);
    const [key, record] = [...kv.store.entries()][0];
    assert.equal(key.startsWith(LEAD_KEY_PREFIX), true);
    const lead = JSON.parse(record.value);
    assert.equal(lead.email, "alex@acme.com");
    assert.equal(lead.emailed, false);
    assert.ok(lead.sendError);
    assert.equal(email.sent.length, 0);
    assert.ok(errors.some((args) => String(args[0]).includes("contact_email_send_failed")));
  });

  it("does not call outbound fetch for a valid contact POST", async () => {
    const captured = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      captured.push(args);
      return new Response("no", { status: 500 });
    };
    try {
      const kv = mockKv();
      const email = mockEmail();
      const res = await handleContact(formPost(validFields()), {
        CONTACT_LEADS: kv,
        EMAIL: email.EMAIL,
      }, { EmailMessage: FakeEmailMessage });
      assert.equal(res.status, 303);
      assert.equal(res.headers.get("Location"), SUCCESS_PATH);
      assert.equal(captured.length, 0);
      assert.equal(email.sent.length, 1);
      assert.equal(kv.store.size, 1);
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

  it("wires CONTACT_LEADS and a hello@-only send_email binding in wrangler.jsonc", () => {
    const config = readFileSync("wrangler.jsonc", "utf8");
    assert.match(config, /"binding":\s*"CONTACT_LEADS"/);
    assert.match(config, /"id":\s*"be9028b297a44aa0bda686d09e3d7f6f"/);
    assert.match(config, /"send_email"/);
    assert.match(config, /"name":\s*"EMAIL"/);
    assert.match(config, /"destination_address":\s*"hello@builtwithgrok\.co\.uk"/);
  });

  it("uses legacy EmailMessage send_email and drops FormSubmit and structured Email Sending", () => {
    for (const path of ["src/contact.js", "src/worker.js"]) {
      const text = readFileSync(path, "utf8");
      assert.doesNotMatch(text, /formsubmit/i);
      assert.doesNotMatch(text, /formsubmit\.co/);
    }
    const contact = readFileSync("src/contact.js", "utf8");
    assert.match(contact, /cloudflare:email/);
    assert.match(contact, /EmailMessage/);
    assert.match(contact, /forms@notify\.builtwithgrok\.co\.uk/);
    assert.doesNotMatch(contact, /html:\s*["'`<]/);
    assert.doesNotMatch(contact, /replyTo:/);
  });

  it("states sole-trader privacy facts without a company or VAT number", () => {
    const html = readFileSync("website/privacy.html", "utf8");
    assert.match(html, /sole trader/i);
    assert.match(html, /no Companies House number/);
    assert.doesNotMatch(html, /Company number\s+\d/);
    assert.doesNotMatch(html, /VAT\s*(number|reg)/i);
    assert.doesNotMatch(html, /ICO registration/i);
    assert.match(html, /Cloudflare Worker/i);
    assert.match(html, /Email Routing/);
    assert.match(html, /hello@builtwithgrok\.co\.uk/);
    assert.doesNotMatch(html, /FormSubmit/);
    assert.doesNotMatch(html, /formsubmit\.co/);
    assert.doesNotMatch(html, /Email Sending/);
  });
});
