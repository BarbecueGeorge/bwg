import re
import urllib.request

url = "https://www.spacex.com/7083.2b7745f5bcfb7d6d.js"
req = urllib.request.Request(
    url,
    headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.spacex.com/spacexai/starmind",
    },
)
text = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")
print("isHero true", len(re.findall(r"isHero:!0", text)))
print("isHero false", len(re.findall(r"isHero:!1", text)))
for m in re.finditer(r"isHero:!0", text):
    print(text[max(0, m.start() - 400) : m.start() + 600])
    print("=====")

# first 2000 chars of page section data array
idx = text.find("videoDesktop")
print("first videoDesktop context", text[max(0, idx - 800) : idx + 300])

# Search titles near beginning of module exports
for pat in [
    r'title:"([^"]{3,80})"',
    r'subheader:"([^"]{3,80})"',
]:
    titles = re.findall(pat, text)
    print(pat, titles[:20])
