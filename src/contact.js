const CONTACT_EMAIL = "hello@builtwithgrok.co.uk";
const FROM_NAME = "Built With Grok";
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

function oneLine(value) {
  return String(value ?? "")
    .replace(/[\r\n\u0000]+/g, " ")
    .trim();
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

/**
 * Build the structured Email Service payload for env.EMAIL.send().
 * Wrangler 4 / Email Service Workers API (not the legacy EmailMessage MIME path).
 */
function buildEnquiryEmail({ name, email, company, interest, message, at }) {
  const safeName = oneLine(name);
  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "(not provided)"}`,
    `Interest: ${interest || "(not provided)"}`,
    `Sent: ${at}`,
    "",
    "Message:",
    message,
  ];
  return {
    to: CONTACT_EMAIL,
    from: { name: FROM_NAME, email: CONTACT_EMAIL },
    replyTo: email,
    subject: `Built With Grok enquiry from ${safeName}`,
    text: lines.join("\n"),
  };
}

/**
 * Send via the Cloudflare Email Service Workers binding (env.EMAIL.send).
 * Structured EmailMessageBuilder is the API this wrangler stack supports.
 */
async function sendEnquiryEmail(env, lead) {
  const binding = env && env.EMAIL;
  if (!binding || typeof binding.send !== "function") return false;
  try {
    await binding.send(buildEnquiryEmail(lead));
    return true;
  } catch {
    return false;
  }
}

/**
 * Same-origin contact POST. Persists every valid enquiry to KV and emails
 * hello@builtwithgrok.co.uk from the Worker. Success if either path works.
 */
export async function handleContact(request, env = {}) {
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

  const lead = {
    at: new Date().toISOString(),
    name,
    email,
    company,
    interest,
    message,
  };

  const stored = await persistLead(env, lead);
  const emailed = await sendEnquiryEmail(env, lead);

  if (stored || emailed) {
    return redirect(SUCCESS_PATH);
  }
  return redirect(ERROR_PATH);
}

export {
  CONTACT_EMAIL,
  FROM_NAME,
  SUCCESS_PATH,
  ERROR_PATH,
  LEAD_KEY_PREFIX,
  LEAD_TTL_SECONDS,
  buildEnquiryEmail,
};
