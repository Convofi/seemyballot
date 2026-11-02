import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { redis } from "@/lib/stats";

const FROM = process.env.FEEDBACK_FROM || "See My Ballot <feedback@seemyballot.com>";
const TO = process.env.FEEDBACK_TO || "ali@convofi.com";
const LIMIT = 5; // submissions per IP per hour
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown, max: number) => typeof v === "string" && v.trim().length <= max;
const optional = (v: unknown, max: number) => v === undefined || v === null || v === "" || str(v, max);

// Counts by a hash of the IP so the raw IP is never stored.
async function overLimit(request: NextRequest): Promise<boolean> {
  const db = redis();
  if (!db) return false;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = `feedback:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
  try {
    const n = await db.incr(key);
    if (n === 1) await db.expire(key, 60 * 60);
    return n > LIMIT;
  } catch {
    return false; // Redis down: let the send proceed.
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid body" }, { status: 400 });

  const { message, email, address, page, website } = body;
  if (
    typeof message !== "string" ||
    !message.trim() ||
    !str(message, 4000) ||
    !optional(email, 320) ||
    (typeof email === "string" && email.trim() !== "" && !EMAIL.test(email.trim())) ||
    !optional(address, 300) ||
    !optional(page, 500)
  ) {
    return Response.json({ error: "Invalid feedback" }, { status: 400 });
  }

  // Honeypot: bots fill the hidden field; pretend success.
  if (typeof website === "string" && website !== "") return Response.json({ ok: true });

  if (await overLimit(request)) {
    return Response.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  const text = message.trim();
  const from = typeof email === "string" && email.trim() ? email.trim() : undefined;
  const oneLine = text.replace(/\s+/g, " ");
  const subject = `[See My Ballot feedback] ${oneLine.length > 60 ? `${oneLine.slice(0, 60).trimEnd()}…` : oneLine}`;
  const lines = [
    text,
    "",
    `From: ${from ?? "not given"}`,
    `Ballot address: ${typeof address === "string" && address.trim() ? address.trim() : "not given"}`,
    `Page: ${typeof page === "string" && page.trim() ? page.trim() : "not given"}`,
    `Time: ${new Date().toISOString()}`,
  ];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject,
        text: lines.join("\n"),
        ...(from && { reply_to: from }),
      }),
    });
    if (!res.ok) {
      console.error("feedback send failed", res.status, await res.text());
      return Response.json({ error: "Send failed" }, { status: 502 });
    }
  } catch (err) {
    console.error("feedback send failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "Send failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
