"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

interface ApiErrorStateProps {
  title: string;
  message?: string;
  onRetry: () => void;
}

export function ApiErrorState({
  title,
  message = "The data service did not respond. Try again in a moment.",
  onRetry,
}: ApiErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
        <div>
          <p className="font-medium text-red-300">{title}</p>
          <p className="mt-1 text-sm text-red-200/80">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-400/40 px-3 py-1.5 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <RotateCcw className="size-3.5" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
