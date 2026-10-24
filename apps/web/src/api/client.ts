export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Small fetch wrapper: JSON in/out, cookie auth, and one error type for the whole app.
 * A FormData body is sent as multipart (the browser sets the Content-Type boundary).
 */
export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error ?? {};
    // A gateway error with no API error body comes from the proxy while the free-tier API wakes up.
    if (!data?.error && [502, 503, 504].includes(res.status)) {
      throw new ApiError(
        res.status,
        'UNAVAILABLE',
        'The server is waking up. Try again in a few seconds.',
      );
    }
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.message ?? 'Something went wrong',
      err.fields,
    );
  }
  return data as T;
}
