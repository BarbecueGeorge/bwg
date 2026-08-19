const CONTACT_EMAIL = "hello@builtwithgrok.co.uk";
const FORMSUBMIT_ENDPOINT = `https://formsubmit.co/ajax/${CONTACT_EMAIL}`;
const SUCCESS_PATH = "/contact.html?sent=1";
const ERROR_PATH = "/contact.html?error=1";

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

function sameHost(request, headerValue) {
  if (!headerValue) return true;
  try {
    const src = new URL(headerValue);
    const host = new URL(request.url).host;
    return src.host === host;
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

function formsubmitSucceeded(status, body) {
  if (status < 200 || status >= 300) return false;
  if (body && (body.success === true || body.success === "true")) return true;
  if (body && typeof body.message === "string" && body.message.length > 0) return true;
  return status === 200 || status === 201;
}

/**
 * Same-origin contact POST. Forwards to FormSubmit from the Worker so the
 * visitor's browser never has to resolve formsubmit.co.
 */
export async function handleContact(request, options = {}) {
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
  if (!sameHost(request, origin) || !sameHost(request, referer)) {
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

  const payload = {
    name,
    email,
    company,
    interest,
    message,
    _subject: "Built With Grok — project enquiry",
    _template: "table",
    _captcha: "false",
  };

  const originUrl = new URL(request.url);
  let upstream;
  try {
    upstream = await fetchImpl(FORMSUBMIT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: originUrl.origin,
        Referer: `${originUrl.origin}/contact.html`,
      },
      body: JSON.stringify(payload),
      redirect: "manual",
    });
  } catch {
    return redirect(ERROR_PATH);
  }

  let body = {};
  const text = await upstream.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }

  if (formsubmitSucceeded(upstream.status, body)) {
    return redirect(SUCCESS_PATH);
  }
  return redirect(ERROR_PATH);
}

export { CONTACT_EMAIL, FORMSUBMIT_ENDPOINT, SUCCESS_PATH, ERROR_PATH };
