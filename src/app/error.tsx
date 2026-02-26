"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
          <h1 className="text-3xl font-bold text-[#f85149] mb-3">
            Something went wrong
          </h1>
          <p className="text-[#8b949e] mb-2 font-mono text-sm">
            {error.message || "An unexpected error occurred"}
          </p>
          {error.digest && (
            <p className="text-[#484f58] text-xs mb-6">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            className="bg-[#58a6ff] text-[#0d1117] font-semibold py-2 px-6 rounded-lg hover:bg-[#79c0ff] transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
