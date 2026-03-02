export interface FetchPostJsonParams {
  url: string;
  bodyObject?: object;
  credentials?: RequestCredentials;
  options?: Omit<RequestInit, 'method' | 'headers' | 'body' | 'credentials'>;
}

/**
 * Fetches a URL with POST method and JSON body.
 * Convenience helper for common API request pattern.
 */
export async function fetchPostJson({
  url,
  bodyObject = {},
  credentials,
  options = {},
}: FetchPostJsonParams): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObject),
    credentials,
    ...options,
  });
}
