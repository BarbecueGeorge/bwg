const CONTACT_EMAIL = "hello@builtwithgrok.co.uk";
const FROM_ADDRESS = "forms@notify.builtwithgrok.co.uk";
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

async function persistLead(env, key, lead) {
  const kv = env && env.CONTACT_LEADS;
  if (!kv || typeof kv.put !== "function") return false;
  try {
    await kv.put(key, JSON.stringify(lead), { expirationTtl: LEAD_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
}

/**
 * RFC 5322 plain-text message for the legacy EmailMessage / send_email path.
 * Envelope From is the notify-subdomain address (Email Routing), never the
 * workers.dev fallback and never the structured Email Sending payload.
 */
function buildRawEnquiryEmail({ name, email, company, interest, message, at }) {
  const safeName = oneLine(name);
  const replyTo = oneLine(email);
  const subject = oneLine(`Built With Grok enquiry from ${safeName}`);
  const body = [
    `Name: ${safeName}`,
    `Email: ${replyTo}`,
    `Company: ${oneLine(company) || "(not provided)"}`,
    `Interest: ${oneLine(interest) || "(not provided)"}`,
    `Sent: ${oneLine(at)}`,
    "",
    "Message:",
    message,
  ].join("\n");

  return [
    `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
    `To: ${CONTACT_EMAIL}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    body,
  ].join("\r\n");
}

async function loadEmailMessage(options = {}) {
  if (typeof options.EmailMessage === "function") {
    return options.EmailMessage;
  }
  const mod = await import("cloudflare:email");
  if (!mod || typeof mod.EmailMessage !== "function") {
    throw new Error("cloudflare:email EmailMessage unavailable");
  }
  return mod.EmailMessage;
}

function describeSendError(err) {
  if (err && typeof err === "object") {
    return {
      error: String(err.message || err),
      code: err.code ?? "E_SEND_FAILED",
    };
  }
  return { error: String(err), code: "E_SEND_FAILED" };
}

function logSendFailure(details) {
  console.error(JSON.stringify({ event: "contact_email_send_failed", ...details }));
}

/**
 * Free Email Routing send_email: env.EMAIL.send(EmailMessage).
 * Do not call the Workers Paid structured API env.EMAIL.send({ from, to, html }).
 */
async function sendEnquiryEmail(env, lead, options = {}) {
  const binding = env && env.EMAIL;
  if (!binding || typeof binding.send !== "function") {
    return { ok: false, error: "EMAIL binding missing or has no send()", code: "E_BINDING_MISSING" };
  }

  let EmailMessage;
  try {
    EmailMessage = await loadEmailMessage(options);
  } catch (err) {
    const { error, code } = describeSendError(err);
    return { ok: false, error, code: code === "E_SEND_FAILED" ? "E_EMAIL_MESSAGE_UNAVAILABLE" : code };
  }

  try {
    const message = new EmailMessage(FROM_ADDRESS, CONTACT_EMAIL, buildRawEnquiryEmail(lead));
    await binding.send(message);
    return { ok: true };
  } catch (err) {
    return describeSendError(err);
  }
}

/**
 * Same-origin contact POST. Persists every valid enquiry to KV and emails
 * hello@ via Email Routing send_email (EmailMessage). Success if either path
 * works. Send failures are logged so they are not swallowed.
 */
export async function handleContact(request, env = {}, options = {}) {
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

  const key = leadKey();
  const stored = await persistLead(env, key, lead);
  const sendResult = await sendEnquiryEmail(env, lead, options);

  if (!sendResult.ok) {
    logSendFailure({
      leadKey: stored ? key : undefined,
      from: FROM_ADDRESS,
      to: CONTACT_EMAIL,
      error: sendResult.error,
      code: sendResult.code ?? null,
    });
    if (stored) {
      await persistLead(env, key, {
        ...lead,
        emailed: false,
        sendError: sendResult.error,
        sendErrorCode: sendResult.code ?? null,
      });
    }
  }

  if (stored || sendResult.ok) {
    return redirect(SUCCESS_PATH);
  }
  return redirect(ERROR_PATH);
}

export {
  CONTACT_EMAIL,
  FROM_ADDRESS,
  FROM_NAME,
  SUCCESS_PATH,
  ERROR_PATH,
  LEAD_KEY_PREFIX,
  LEAD_TTL_SECONDS,
  buildRawEnquiryEmail,
};
