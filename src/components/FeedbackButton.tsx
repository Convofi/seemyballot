"use client";

import { useRef, useState } from "react";

type State = "idle" | "sending" | "sent" | "error";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3 focus:border-accent focus-visible:outline-offset-0";

// `address` is the ballot address the visitor looked up, if any. It is only sent when they tick the box.
export default function FeedbackButton({ address }: { address?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>("idle");

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const form = new FormData(el);
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: form.get("message"),
          email: form.get("email") || undefined,
          address: address && form.get("include-address") ? address : undefined,
          page: window.location.pathname,
          website: form.get("website") || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      el.reset();
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={open}
        className="link inline-flex min-h-11 cursor-pointer items-center"
      >
        Feedback
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="feedback-title"
        onClose={() => {
          if (state === "sent") setState("idle");
          openerRef.current?.focus();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-paper p-5 text-sm text-ink backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="feedback-title" className="text-base font-semibold">
            Feedback
          </h2>
          <button
            type="button"
            onClick={close}
            className="-mr-2 min-h-11 cursor-pointer rounded-lg px-2 text-sm font-semibold text-accent hover:text-accent-hover"
          >
            Close
          </button>
        </div>
        {state === "sent" ? (
          <p role="status" className="mt-3 text-ink-2">
            Thanks, sent.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-3 space-y-4">
            <div>
              <label htmlFor="feedback-message" className="mb-1 block font-medium">
                What should we fix or add?
              </label>
              <textarea
                id="feedback-message"
                name="message"
                required
                maxLength={4000}
                rows={5}
                autoFocus
                className={field}
              />
            </div>
            <div>
              <label htmlFor="feedback-email" className="mb-1 block font-medium">
                Your email (optional, if you&apos;d like a reply)
              </label>
              <input
                id="feedback-email"
                name="email"
                type="email"
                autoComplete="email"
                className={`${field} min-h-11`}
              />
            </div>
            {address && (
              <label className="flex min-h-11 items-center gap-3 text-ink-2">
                <input name="include-address" type="checkbox" className="size-5 shrink-0 accent-accent-solid" />
                Include the address I looked up (helps us debug)
              </label>
            )}
            {/* Honeypot: hidden from people, filled by bots. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor="feedback-website">Website</label>
              <input id="feedback-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            {state === "error" && (
              <p role="alert" className="text-danger">
                Couldn&apos;t send. Email{" "}
                <a href="mailto:ali@convofi.com" className="link">
                  ali@convofi.com
                </a>{" "}
                instead.
              </p>
            )}
            <button
              type="submit"
              disabled={state === "sending"}
              className="min-h-11 w-full cursor-pointer rounded-xl bg-accent-solid px-5 font-semibold text-on-accent transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-45"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
