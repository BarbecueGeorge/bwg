const CONTACT_EMAIL = "hello@builtwithgrok.co.uk";
const FORMSUBMIT_ENDPOINT = `https://formsubmit.co/ajax/${CONTACT_EMAIL}`;
const SUCCESS_PATH = "/contact.html?sent=1";
const ERROR_PATH = "/contact.html?error=1";
const LEAD_KEY_PREFIX = "lead:";
const LEAD_TTL_SECONDS = 180 * 24 * 60 * 60;

const MAX = {
  name: 200,
  email: 254,
  company: 200,
  interest: 200,
  message: 10000,
};

function redirect(path) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "no-store",
    },
  });
}

function field(source, key) {
  const value = source[key];
  if (value == null) return "";
  return String(value).trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function canonicalHost(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

function sameSite(request, headerValue) {
  if (!headerValue) return true;
  try {
    const src = new URL(headerValue);
    const dest = new URL(request.url);
    return canonicalHost(src.host) === canonicalHost(dest.host);
  } catch {
    return false;
  }
}

async function readFields(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const data = await request.json();
    if (!data || typeof data !== "object") {
      throw new Error("invalid json");
    }
    return data;
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

/**
 * FormSubmit is best-effort only. Require an explicit success flag and a 2xx
 * status. A message string alone is never treated as success (FormSubmit can
 * return a message with success: false, including activation and 429 cases).
 */
function formsubmitSucceeded(status, body) {
  if (status < 200 || status >= 300) return false;
  if (!body || typeof body !== "object") return false;
  if (body.success === false || body.success === "false") return false;
  return body.success === true || body.success === "true";
}

function leadKey() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${LEAD_KEY_PREFIX}${id}`;
}

async function persistLead(env, lead) {
  const kv = env && env.CONTACT_LEADS;
  if (!kv || typeof kv.put !== "function") return false;
  try {
    await kv.put(leadKey(), JSON.stringify(lead), { expirationTtl: LEAD_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
}

async function notifyFormSubmit(fetchImpl, request, fields) {
  const originUrl = new URL(request.url);
  const upstream = await fetchImpl(FORMSUBMIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: originUrl.origin,
      Referer: `${originUrl.origin}/contact.html`,
    },
    body: JSON.stringify({
      ...fields,
      _subject: "Built With Grok — project enquiry",
      _template: "table",
      _captcha: "false",
    }),
    redirect: "manual",
  });

  let body = {};
  const text = await upstream.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  return formsubmitSucceeded(upstream.status, body);
}

/**
 * Same-origin contact POST. Persists every valid enquiry to KV, then tries
 * FormSubmit as a best-effort copy so the visitor's browser never has to
 * resolve formsubmit.co.
 */
export async function handleContact(request, env = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;

  if (request.method === "GET" || request.method === "HEAD") {
    return redirect("/contact.html");
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD, POST" },
    });
  }

  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  if (!sameSite(request, origin) || !sameSite(request, referer)) {
    return redirect(ERROR_PATH);
  }

  let fields;
  try {
    fields = await readFields(request);
  } catch {
    return redirect(ERROR_PATH);
  }

  const honeypot = field(fields, "honeypot") || field(fields, "_honey");
  if (honeypot) {
    return redirect(SUCCESS_PATH);
  }

  const name = field(fields, "name");
  const email = field(fields, "email");
  const company = field(fields, "company");
  const interest = field(fields, "interest");
  const message = field(fields, "message");

  if (!name || !email || !message || !isEmail(email)) {
    return redirect(ERROR_PATH);
  }
  if (
    name.length > MAX.name ||
    email.length > MAX.email ||
    company.length > MAX.company ||
    interest.length > MAX.interest ||
    message.length > MAX.message
  ) {
    return redirect(ERROR_PATH);
  }

  const stored = await persistLead(env, {
    at: new Date().toISOString(),
    name,
    email,
    company,
    interest,
    message,
  });

  let emailed = false;
  try {
    emailed = await notifyFormSubmit(fetchImpl, request, {
      name,
      email,
      company,
      interest,
      message,
    });
  } catch {
    emailed = false;
  }

  if (stored || emailed) {
    return redirect(SUCCESS_PATH);
  }
  return redirect(ERROR_PATH);
}

export {
  CONTACT_EMAIL,
  FORMSUBMIT_ENDPOINT,
  SUCCESS_PATH,
  ERROR_PATH,
  LEAD_KEY_PREFIX,
  LEAD_TTL_SECONDS,
};
