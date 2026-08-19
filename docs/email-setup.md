# Email: hello@builtwithgrok.co.uk

## Public contact (live)

The marketing site uses **hello@builtwithgrok.co.uk**.

### Receive path (configured)

Cloudflare **Email Routing** for zone `builtwithgrok.co.uk`:

| Setting | Value |
|---------|--------|
| Status | Enabled / ready |
| Address | `hello@builtwithgrok.co.uk` |
| Action | Forward to `barbecuegeorge@proton.me` |
| Rule | `hello-bwg` |

Mail to **hello@builtwithgrok.co.uk** is delivered into the Proton inbox for **barbecuegeorge@proton.me**.

If a destination verification email is still pending, open Proton Mail and confirm the Cloudflare “verify destination address” message.

### DNS

Email Routing manages MX + SPF + DKIM for Cloudflare mail. Do **not** point MX at Proton while using Email Routing (they conflict).

## Optional: native Proton custom domain (send as hello@ from Proton)

Requires a **paid Proton plan** (Mail Plus / Unlimited / etc.) and cannot be finished without the Proton dashboard (verification TXT + DKIM values are unique):

1. Proton → **Settings → All settings → Domain names → Add domain** → `builtwithgrok.co.uk`
2. Add the **verification TXT** Proton shows (DNS only / Cloudflare DNS)
3. **Before** switching MX away from Cloudflare Email Routing, add address **hello@builtwithgrok.co.uk** under the domain
4. Replace Email Routing MX with Proton MX:
   - `mail.protonmail.ch` priority 10  
   - `mailsec.protonmail.ch` priority 20  
5. Add SPF `include:_spf.protonmail.ch`, Proton DKIM CNAMEs, and DMARC as shown in Proton
6. Disable Cloudflare Email Routing once Proton MX is green

Until step 4, keep Email Routing so public contact mail still arrives.

## Site

Contact page form posts via [FormSubmit](https://formsubmit.co) AJAX to **hello@builtwithgrok.co.uk**, which Email Routing delivers to Proton.

**First submission:** FormSubmit may email `hello@…` with an activation link — open that once so production enquiries deliver. After activation, submissions appear in Proton as normal mail.
