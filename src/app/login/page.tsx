"use client";

import { FormEvent, useState } from "react";

function safeNextPath(): string {
  const value = new URLSearchParams(window.location.search).get("next");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(
          response.status === 503
            ? "Authentication is not configured. Contact the administrator."
            : "Invalid password.",
        );
        return;
      }

      window.location.assign(safeNextPath());
    } catch {
      setError("Unable to sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0d1117] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[#30363d] bg-[#161b22] p-8 shadow-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#58a6ff]">
          Maverick Exteriors
        </p>
        <h1 className="mb-2 text-2xl font-bold text-[#e6edf3]">
          Command Center
        </h1>
        <p className="mb-6 text-sm text-[#8b949e]">
          Sign in to view internal company metrics.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#e6edf3]">
              Password
            </span>
            <input
              autoComplete="current-password"
              autoFocus
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[#e6edf3] outline-none focus:border-[#58a6ff]"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            className="w-full rounded-md bg-[#1f6feb] px-4 py-2 font-semibold text-white hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
