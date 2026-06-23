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

export async function POST(req: Request) {
  const { raceName, raceYear, raceUrl, notes, requesterEmail } = await req.json();

  if (!raceName?.trim()) {
    return NextResponse.json({ error: "Race name is required." }, { status: 400 });
  }
  if (!raceYear) {
    return NextResponse.json({ error: "Year is required." }, { status: 400 });
  }

  const emailRegex = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
  const cleanEmail = requesterEmail?.trim() ?? "";
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
      subject: `Race Request: ${raceName.trim()}`,
      text: [
        `Race Name: ${raceName.trim()}`,
        `Year: ${raceYear}`,
        `Race URL: ${raceUrl?.trim() || "Not provided"}`,
        `Requester Email: ${cleanEmail || "Not provided"}`,
        `Notes:\n${notes?.trim() || "None"}`,
      ].join("\n\n"),
      html: `
      <h2>New Race Request</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>Race Name</strong></td><td>${escHtml(raceName.trim())}</td></tr>
        <tr><td><strong>Year</strong></td><td>${escHtml(String(raceYear))}</td></tr>
        <tr><td><strong>Race URL</strong></td><td>${raceUrl?.trim() ? safeHref(raceUrl.trim()) : "Not provided"}</td></tr>
        <tr><td><strong>Requester Email</strong></td><td>${cleanEmail ? escHtml(cleanEmail) : "Not provided"}</td></tr>
        <tr><td><strong>Notes</strong></td><td style="white-space:pre-wrap">${escHtml(notes?.trim() || "None")}</td></tr>
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
