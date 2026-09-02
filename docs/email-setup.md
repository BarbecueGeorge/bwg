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

Do **not** enable Cloudflare Email Routing on the apex. That would replace Proton MX. Apex MX, SPF, DKIM, and DMARC stay Proton’s.

Do not change DNS from this repo.

### Notify subdomain (already configured)

Outbound contact-form mail uses **subdomain Email Routing** on `notify.builtwithgrok.co.uk` only (MX/SPF on `notify`, not the apex):

| Setting | Value |
|---------|--------|
| Custom address | `forms@notify.builtwithgrok.co.uk` (Active) |
| Destination | `hello@builtwithgrok.co.uk` (verified) |

## Site

The contact form posts **same-origin** to `/api/contact` on the `built-with-grok` Worker. The Worker:

1. Persists every valid enquiry to the `CONTACT_LEADS` KV namespace (about 180 days).
2. Emails **hello@builtwithgrok.co.uk** with the free Email Routing `send_email` binding and a `cloudflare:email` `EmailMessage` (raw RFC 5322). This is **not** the Workers Paid Email Sending structured API (`env.EMAIL.send({ from, to, html })`).
3. Redirects the visitor to `/contact.html?sent=1` if the KV write **or** the email send succeeded.
4. Logs send failures (`contact_email_send_failed`) and writes `sendError` onto the KV lead so a KV success does not hide a delivery bug.

The visitor’s browser never leaves this origin.

If both KV and email fail, the visitor is sent to `/contact.html?error=1` and can email `hello@` directly.

### Outbound message

| Field | Value |
|-------|--------|
| To | `hello@builtwithgrok.co.uk` only (`destination_address` on the binding) |
| From | `Built With Grok <forms@notify.builtwithgrok.co.uk>` |
| Reply-To | the visitor’s email |
| Subject | `Built With Grok enquiry from {name}` |
| Body | name, email, company, interest, message, timestamp |

`wrangler.jsonc` binds `EMAIL` with `destination_address` set to `hello@builtwithgrok.co.uk`.

Do not send from `*.workers.dev`. That path is not authorised for Email Routing.
