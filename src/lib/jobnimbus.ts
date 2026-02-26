/**
 * JobNimbus API Client
 * Handles authentication and API requests to JobNimbus
 */

const JN_BASE_URL = "https://api.jobnimbus.com/api/v2";

interface JNRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, any>;
  query?: Record<string, string | number>;
}

/**
 * Make authenticated request to JobNimbus API
 */
export async function jnRequest<T>(
  endpoint: string,
  options: JNRequestOptions = {}
): Promise<T> {
  const apiKey = process.env.JOBNIMBUS_API_KEY;
  if (!apiKey) {
    throw new Error("JOBNIMBUS_API_KEY environment variable not set");
  }

  const { method = "GET", body, query } = options;

  // Build URL with query params
  const url = new URL(`${JN_BASE_URL}${endpoint}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`JN API error: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Fetch jobs from JobNimbus with pagination
 */
export async function jnGetJobs(options: {
  size?: number;
  offset?: number;
  sort?: string;
} = {}) {
  const { size = 1000, offset = 0, sort = "-date_updated" } = options;

  interface JNJobResponse {
    items: Array<{
      jnid: string;
      name: string;
      [key: string]: any;
    }>;
    total: number;
  }

  return jnRequest<JNJobResponse>("/jobs", {
    query: {
      size,
      offset,
      sort,
    },
  });
}

/**
 * Fetch contacts from JobNimbus
 */
export async function jnGetContacts(options: {
  size?: number;
  offset?: number;
} = {}) {
  const { size = 1000, offset = 0 } = options;

  interface JNContactResponse {
    items: Array<{
      jnid: string;
      name: string;
      [key: string]: any;
    }>;
    total: number;
  }

  return jnRequest<JNContactResponse>("/contacts", {
    query: {
      size,
      offset,
    },
  });
}
