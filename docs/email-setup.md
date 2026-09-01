# Email: hello@builtwithgrok.co.uk

## Public contact (live)

The marketing site uses **hello@builtwithgrok.co.uk**.

### Receive path (live)

**Proton Mail** hosts the custom domain. Proton MX is live for `builtwithgrok.co.uk`:

| Setting | Value |
|---------|--------|
| Address | `hello@builtwithgrok.co.uk` |
| MX | `mail.protonmail.ch` (priority 10), `mailsec.protonmail.ch` (priority 20) |

Mail to **hello@builtwithgrok.co.uk** arrives in the Proton inbox for that address.

Cloudflare **Email Routing** is no longer the inbound path. Do not re-enable Email Routing MX while Proton MX is in use — the two conflict.

Do not change DNS from this repo. Proton verification TXT, DKIM CNAMEs, SPF, and DMARC are managed in Cloudflare DNS / the Proton dashboard.

## Site

The contact form posts **same-origin** to `/api/contact` on the `built-with-grok` Worker. The Worker:

1. Persists every valid enquiry to the `CONTACT_LEADS` KV namespace (about 180 days).
2. Tries [FormSubmit](https://formsubmit.co) **server-side** as a best-effort copy to `hello@builtwithgrok.co.uk`.
3. Redirects the visitor to `/contact.html?sent=1` if the KV write succeeded, even when FormSubmit fails (activation mail, 429, or `success: false`).

The visitor’s browser never has to resolve `formsubmit.co`.

If KV is missing and FormSubmit also fails, the visitor is sent to `/contact.html?error=1` and can email `hello@` directly.

**FormSubmit first submission:** FormSubmit may email `hello@…` with an activation link — open that once if you want the best-effort copy to land in Proton. The KV record is the durable backup when that copy does not arrive.
