import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const { raceName, raceYear, raceUrl, notes, requesterEmail } = await req.json();

  if (!raceName?.trim()) {
    return NextResponse.json({ error: "Race name is required." }, { status: 400 });
  }
  if (!raceYear) {
    return NextResponse.json({ error: "Year is required." }, { status: 400 });
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
      replyTo: requesterEmail?.trim() || undefined,
      to: "race-request@racereplay.app",
      subject: `Race Request: ${raceName.trim()}`,
      text: [
        `Race Name: ${raceName.trim()}`,
        `Year: ${raceYear}`,
        `Race URL: ${raceUrl?.trim() || "Not provided"}`,
        `Requester Email: ${requesterEmail?.trim() || "Not provided"}`,
        `Notes:\n${notes?.trim() || "None"}`,
      ].join("\n\n"),
      html: `
      <h2>New Race Request</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><td><strong>Race Name</strong></td><td>${raceName.trim()}</td></tr>
        <tr><td><strong>Year</strong></td><td>${raceYear}</td></tr>
        <tr><td><strong>Race URL</strong></td><td>${raceUrl?.trim() ? `<a href="${raceUrl.trim()}">${raceUrl.trim()}</a>` : "Not provided"}</td></tr>
        <tr><td><strong>Requester Email</strong></td><td>${requesterEmail?.trim() || "Not provided"}</td></tr>
        <tr><td><strong>Notes</strong></td><td style="white-space:pre-wrap">${notes?.trim() || "None"}</td></tr>
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
