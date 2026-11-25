"""Generate src/assets/legal/*.html from extracted markdown (temp)."""
from pathlib import Path
import html
import re

src = Path(r"C:\Users\Ulises\AppData\Local\Temp\cgi-legal")
out = Path(__file__).resolve().parents[1] / "src" / "assets" / "legal"
out.mkdir(parents=True, exist_ok=True)

COOKIE_SUBHEADS = {
    "Interpretation",
    "Definitions",
    "Technical cookies",
    "Table of technical cookies",
    "Analytics without cookies",
    "INTERPRETATION AND DEFINITIONS",
    "USE OF COOKIES AND ANALYTICS",
    "INTERNATIONAL DATA TRANSFERS",
    "NAVIGATION PROFILING",
    "HOW TO MANAGE COOKIES",
    "DATA PROTECTION RIGHTS",
    "LEGAL BASIS AND GDPR COMPLIANCE",
    "COOKIE POLICY",
}


def enrich(text: str) -> str:
    text = re.sub(
        r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        r'<a href="mailto:\1">\1</a>',
        text,
    )
    for url in ("https://www.aepd.es", "https://educgi.cgiclinics.eu"):
        esc = html.escape(url)
        text = text.replace(
            esc,
            f'<a href="{url}" target="_blank" rel="noopener noreferrer">{url}</a>',
        )
    # Privacy Policy / click here variants
    text = re.sub(
        r"(?i)If you want to know our Privacy Policy, click here\.?",
        'If you want to know our Privacy Policy, <a href="/legal/privacy">click here</a>.',
        text,
    )
    text = re.sub(
        r"(?i)You can consult our privacy policy by clicking here\.?",
        'You can consult our privacy policy by <a href="/legal/privacy">clicking here</a>.',
        text,
    )
    text = re.sub(
        r"(?i)please see our\s+Privacy Policy\.?",
        'please see our <a href="/legal/privacy">Privacy Policy</a>.',
        text,
    )
    text = re.sub(
        r"(?i)as described in our\s+Privacy Policy",
        'as described in our <a href="/legal/privacy">Privacy Policy</a>',
        text,
    )
    text = re.sub(
        r"(?i)reading the Cookies Policy",
        'reading the <a href="/legal/cookies">Cookies Policy</a>',
        text,
    )
    text = re.sub(
        r"(?i)in the Legal notice",
        'in the <a href="/legal/legal-notice">Legal notice</a>',
        text,
    )
    return text


def md_to_html(md_text: str) -> str:
    lines = md_text.splitlines()
    parts: list[str] = []
    i = 0
    first_h1_done = False

    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue

        # Cookie table: Name / Type / Owner / Duration / Purpose
        if line.strip() == "Name" and i + 1 < len(lines) and lines[i + 1].strip() == "Type":
            headers = [html.escape(lines[i + k].strip()) for k in range(5)]
            j = i + 5
            rows: list[list[str]] = []
            while j < len(lines):
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j >= len(lines):
                    break
                peek = lines[j].strip()
                if peek in ("Analytics without cookies",) or peek.startswith("#"):
                    break
                if peek.isupper() and len(peek) > 10:
                    break
                row = []
                for _ in range(5):
                    row.append(html.escape(lines[j].strip()) if j < len(lines) else "")
                    j += 1
                if any(row):
                    rows.append(row)
            table = [
                '<div class="overflow-x-auto my-6">',
                '<table class="legal-table">',
                "<thead><tr>" + "".join(f"<th>{h}</th>" for h in headers) + "</tr></thead>",
                "<tbody>",
            ]
            for row in rows:
                table.append("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>")
            table.extend(["</tbody>", "</table>", "</div>"])
            parts.append("\n".join(table))
            i = j
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1 and not first_h1_done:
                first_h1_done = True
                i += 1
                continue
            first_h1_done = True
            # Word sometimes styles body copy as Heading; treat long/sentence-like as <p>
            looks_like_body = (
                len(text) > 90
                or text.endswith(".")
                or text.endswith(";")
                or re.match(r"^(For |The |eduCGI |IRB |Once |As |Any |This |By )", text)
            ) and not re.match(r"^\d+\.\s", text)
            if looks_like_body:
                parts.append(f"<p>{enrich(html.escape(text))}</p>")
            else:
                parts.append(
                    f"<h{min(level, 3)}>{enrich(html.escape(text))}</h{min(level, 3)}>"
                )
            i += 1
            continue

        if line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{enrich(html.escape(lines[i][2:].strip()))}</li>")
                i += 1
            parts.append("<ul>" + "".join(items) + "</ul>")
            continue

        text = line.strip()
        if text == "COOKIE POLICY":
            i += 1
            continue

        if text in COOKIE_SUBHEADS:
            level = 2 if text.isupper() else 3
            parts.append(f"<h{level}>{html.escape(text)}</h{level}>")
            i += 1
            continue

        if text.isupper() and 3 < len(text) < 80 and not text.startswith("IRB"):
            parts.append(f"<h2>{html.escape(text)}</h2>")
            i += 1
            continue

        # Terms: bare "Intellectual Property" without heading marker
        if text == "Intellectual Property":
            parts.append(f"<h3>{html.escape(text)}</h3>")
            i += 1
            continue

        parts.append(f"<p>{enrich(html.escape(text))}</p>")
        i += 1

    return "\n".join(parts)


mapping = {
    "legal-notice-educgi.md": "legal-notice.html",
    "terms-and-conditions-educgi.md": "terms.html",
    "cookie-policy-educgi.md": "cookies.html",
    "privacy-policy-educgi.md": "privacy.html",
}

for src_name, out_name in mapping.items():
    body = md_to_html((src / src_name).read_text(encoding="utf-8"))
    (out / out_name).write_text(body, encoding="utf-8")
    print(f"{out_name}: {len(body)} chars")
