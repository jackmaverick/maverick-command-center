interface ErrorWithCode extends Error {
  code?: unknown;
}

function redactSecrets(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-database-url]")
    .replace(
      /(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    );
}

export function getSafeServerError(error: unknown): {
  message: string;
  code: string | null;
} {
  if (!(error instanceof Error)) {
    return { message: "Unknown server error", code: null };
  }

  const codedError = error as ErrorWithCode;
  return {
    message: redactSecrets(error.message),
    code:
      typeof codedError.code === "string" ||
      typeof codedError.code === "number"
        ? String(codedError.code)
        : null,
  };
}

export function logServerError(context: string, error: unknown): void {
  console.error(context, getSafeServerError(error));
}
