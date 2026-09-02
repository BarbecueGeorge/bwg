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

Do **not** change apex MX, SPF, DKIM, or DMARC. Do **not** re-enable Cloudflare Email Routing on the root domain.

## Site

The contact form posts **same-origin** to `/api/contact` on the `built-with-grok` Worker. The Worker:

1. Persists every valid enquiry to the `CONTACT_LEADS` KV namespace (about 180 days).
2. Emails **hello@builtwithgrok.co.uk** from the Worker using the Cloudflare Email Service `send_email` binding (`env.EMAIL.send` structured API).
3. Redirects the visitor to `/contact.html?sent=1` if the KV write **or** the email send succeeded.

The visitor’s browser never leaves this origin.

If both KV and email fail, the visitor is sent to `/contact.html?error=1` and can email `hello@` directly.

### Outbound message

| Field | Value |
|-------|--------|
| To | `hello@builtwithgrok.co.uk` only (`destination_address` on the binding) |
| From | `Built With Grok <hello@builtwithgrok.co.uk>` |
| Reply-To | the visitor’s email |
| Subject | `Built With Grok enquiry from {name}` |
| Body | name, email, company, interest, message, timestamp |

`wrangler.jsonc` binds `EMAIL` with `destination_address` set to `hello@builtwithgrok.co.uk`.

## Follow-up: onboard Email Sending (do not apply from this repo)

The Worker code and binding are in this repo. Live delivery still needs the sending domain onboarded in the Cloudflare dashboard. **Do not apply DNS from this repo.**

1. Cloudflare dashboard → **Compute → Email Service → Email Sending** → **Onboard Domain** for `builtwithgrok.co.uk`.
2. Email Sending may propose DNS. **Accept only `cf-bounce` records.** Typical bounce-handling records (names only; values come from Cloudflare):
   - MX on `cf-bounce.builtwithgrok.co.uk`
   - TXT SPF on `cf-bounce.builtwithgrok.co.uk`
   - TXT DKIM on `cf-bounce._domainkey.builtwithgrok.co.uk`
3. **Reject / skip any change to apex MX, apex SPF, Proton DKIM CNAMEs, or `_dmarc.builtwithgrok.co.uk`.** Email Sending docs sometimes list a root `_dmarc` record (`p=reject`). Proton already publishes DMARC (`p=quarantine`). Leave Proton’s apex DMARC in place.
4. Do not enable **Email Routing** on the root domain. That would replace Proton MX.
5. After `cf-bounce` records exist and the Worker is deployed, submit the contact form once (or `POST /api/contact` with a real Reply-To) and confirm the message in the Proton inbox for `hello@`.

Until Email Sending is onboarded, `env.EMAIL.send` will fail at runtime. KV persist still succeeds, so the visitor sees `?sent=1` and the lead remains recoverable from `CONTACT_LEADS`.
