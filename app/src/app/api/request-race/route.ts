import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function safeHref(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `<a href="${escHtml(raw)}">${escHtml(raw)}</a>`;
    }
  } catch {
    // not a valid URL — fall through to plain text
  }
  return escHtml(raw);
}

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Opportunistically evict expired windows so the map cannot grow without
  // bound over the lifetime of a long-lived instance.
  if (rateLimitMap.size > 1000) {
    for (const [key, e] of rateLimitMap) {
      if (now - e.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(key);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Per-field length caps — these values feed an outbound email, so reject
// oversized payloads before they reach nodemailer.
const MAX_LENGTHS = {
  raceName: 200,
  raceUrl: 500,
  requesterEmail: 254,
  notes: 2000,
} as const;

/** Returns the value as a trimmed string, or null if absent/not a string. */
function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

export async function POST(req: Request) {
  // x-real-ip is set by Vercel from the verified connection; fall back to the
  // first x-forwarded-for entry (also platform-controlled on Vercel — do not
  // trust it behind other proxy chains without revisiting this).
  const ip =
    req.headers.get("x-real-ip")?.trim() ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raceName = asTrimmedString(body.raceName);
  const raceYear = body.raceYear;
  const raceUrl = asTrimmedString(body.raceUrl);
  const notes = asTrimmedString(body.notes);
  const requesterEmail = asTrimmedString(body.requesterEmail);

  if (!raceName) {
    return NextResponse.json({ error: "Race name is required." }, { status: 400 });
  }

  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    const value = { raceName, raceUrl, requesterEmail, notes }[
      field as keyof typeof MAX_LENGTHS
    ];
    if (value && value.length > max) {
      return NextResponse.json(
        { error: `${field} must be ${max} characters or fewer.` },
        { status: 400 }
      );
    }
  }

  const year = parseInt(String(raceYear), 10);
  const currentYear = new Date().getFullYear();
  if (!raceYear || isNaN(year) || year < 1900 || year > currentYear + 2) {
    return NextResponse.json({ error: "A valid race year is required." }, { status: 400 });
  }

  const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
  const cleanEmail = requesterEmail ?? "";
  if (cleanEmail && !emailRegex.test(cleanEmail)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Race Replay" <${process.env.GMAIL_USER}>`,
      replyTo: cleanEmail || undefined,
      to: "race-request@racereplay.app",
      subject: `Race Request: ${raceName}`,
      text: [
        `Race Name: ${raceName}`,
        `Year: ${raceYear}`,
        `Race URL: ${raceUrl || "Not provided"}`,
        `Requester Email: ${cleanEmail || "Not provided"}`,
        `Notes:\n${notes || "None"}`,
      ].join("\n\n"),
      html: `
      <h2>New Race Request</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>Race Name</strong></td><td>${escHtml(raceName)}</td></tr>
        <tr><td><strong>Year</strong></td><td>${escHtml(String(raceYear))}</td></tr>
        <tr><td><strong>Race URL</strong></td><td>${raceUrl ? safeHref(raceUrl) : "Not provided"}</td></tr>
        <tr><td><strong>Requester Email</strong></td><td>${cleanEmail ? escHtml(cleanEmail) : "Not provided"}</td></tr>
        <tr><td><strong>Notes</strong></td><td style="white-space:pre-wrap">${escHtml(notes || "None")}</td></tr>
      </table>
    `,
    });
  } catch (err) {
    console.error("Failed to send race request email:", err);
    return NextResponse.json(
      { error: "Failed to send email. Please try again later." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
