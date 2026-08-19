"""Configure Cloudflare DNS for Proton Mail on builtwithgrok.co.uk.

Uses Wrangler OAuth token from local config. Adds standard Proton MX/SPF/DMARC.
Verification TXT + DKIM selectors must come from Proton after domain is added
in the Proton dashboard (unique per account).
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path

DOMAIN = "builtwithgrok.co.uk"
ACCOUNT_HINT = "2ee7cb91d931dba1f81efe0cec5bf264"

# Standard Proton Mail DNS (public docs)
PROTON_RECORDS = [
    {
        "type": "MX",
        "name": DOMAIN,
        "content": "mail.protonmail.ch",
        "priority": 10,
        "ttl": 3600,
        "proxied": False,
    },
    {
        "type": "MX",
        "name": DOMAIN,
        "content": "mailsec.protonmail.ch",
        "priority": 20,
        "ttl": 3600,
        "proxied": False,
    },
    {
        "type": "TXT",
        "name": DOMAIN,
        "content": "v=spf1 include:_spf.protonmail.ch mx ~all",
        "ttl": 3600,
        "proxied": False,
    },
    {
        "type": "TXT",
        "name": f"_dmarc.{DOMAIN}",
        "content": "v=DMARC1; p=quarantine; rua=mailto:hello@builtwithgrok.co.uk",
        "ttl": 3600,
        "proxied": False,
    },
]


def load_token() -> str:
    path = Path.home() / "AppData/Roaming/xdg.config/.wrangler/config/default.toml"
    text = path.read_text(encoding="utf-8")
    m = re.search(r'oauth_token\s*=\s*"([^"]+)"', text)
    if not m:
        raise SystemExit("No wrangler oauth_token found")
    return m.group(1)


def api(token: str, method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} {path}: {err[:800]}") from e


def main() -> None:
    token = load_token()
    zones = api(token, "GET", f"/zones?name={DOMAIN}")
    if not zones.get("success") or not zones.get("result"):
        # try list all
        zones = api(token, "GET", "/zones?per_page=50")
        print("zones listed:", [z.get("name") for z in zones.get("result", [])])
        match = [z for z in zones.get("result", []) if z.get("name") == DOMAIN]
        if not match:
            raise SystemExit(f"Zone {DOMAIN} not found or no access")
        zone = match[0]
    else:
        zone = zones["result"][0]

    zone_id = zone["id"]
    print(f"zone {DOMAIN} id={zone_id} status={zone.get('status')}")

    existing = api(token, "GET", f"/zones/{zone_id}/dns_records?per_page=100")
    records = existing.get("result", [])
    print(f"existing records: {len(records)}")
    for r in records:
        if r["type"] in ("MX", "TXT") or "proton" in (r.get("content") or "").lower() or "spf" in (r.get("content") or "").lower() or "dmarc" in (r.get("name") or "").lower():
            print(f"  {r['type']} {r['name']} -> {r.get('content')} pri={r.get('priority')}")

    def find_match(desired: dict):
        for r in records:
            if r["type"] != desired["type"]:
                continue
            if r["name"] != desired["name"] and not (
                desired["name"] == DOMAIN and r["name"] in (DOMAIN, "@")
            ):
                # CF returns FQDN
                if r["name"].rstrip(".") != desired["name"].rstrip("."):
                    continue
            if desired["type"] == "MX":
                if r.get("content") == desired["content"] and r.get("priority") == desired.get("priority"):
                    return r
            elif desired["type"] == "TXT":
                if r.get("content") == desired["content"] or r.get("content") == f'"{desired["content"]}"':
                    return r
                # SPF: any existing SPF we may replace
                if "v=spf1" in desired["content"] and "v=spf1" in (r.get("content") or ""):
                    return r
                if desired["name"].startswith("_dmarc") and r["name"].startswith("_dmarc"):
                    return r
        return None

    for desired in PROTON_RECORDS:
        found = find_match(desired)
        payload = {
            "type": desired["type"],
            "name": desired["name"],
            "content": desired["content"],
            "ttl": desired["ttl"],
        }
        if "priority" in desired:
            payload["priority"] = desired["priority"]
        # MX/TXT must not be proxied
        if desired["type"] in ("MX", "TXT", "CNAME"):
            payload["proxied"] = False

        if found:
            rid = found["id"]
            # update if content differs
            same = found.get("content") in (desired["content"], f'"{desired["content"]}"')
            if desired["type"] == "MX":
                same = found.get("content") == desired["content"] and found.get("priority") == desired.get("priority")
            if same:
                print(f"OK exists {desired['type']} {desired['name']} -> {desired['content']}")
                continue
            res = api(token, "PUT", f"/zones/{zone_id}/dns_records/{rid}", payload)
            print(f"UPDATED {desired['type']} {desired['name']}: success={res.get('success')}")
        else:
            res = api(token, "POST", f"/zones/{zone_id}/dns_records", payload)
            print(f"CREATED {desired['type']} {desired['name']}: success={res.get('success')} errors={res.get('errors')}")

    # final list mail-related
    existing = api(token, "GET", f"/zones/{zone_id}/dns_records?per_page=100")
    print("\nMail-related DNS after update:")
    for r in existing.get("result", []):
        if r["type"] in ("MX", "TXT") or "proton" in (r.get("content") or "").lower() or "domainkey" in (r.get("name") or "").lower():
            print(f"  {r['type']:6} {r['name']:40} {r.get('content')} pri={r.get('priority')}")

    print(
        """
NEXT (Proton account — cannot complete without Proton login):
1. Proton Mail → Settings → All settings → Domain names → Add domain: builtwithgrok.co.uk
2. Copy verification TXT from Proton → we can add it here if you paste the value
3. Addresses → Add address: hello@builtwithgrok.co.uk linked to your inbox
4. Copy DKIM CNAMEs (protonmail._domainkey etc.) → paste here to finish DNS
"""
    )


if __name__ == "__main__":
    main()
