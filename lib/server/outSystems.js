import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'remitease_session';

const DEFAULT_BASE_URL = 'https://smuedu-dev.outsystemsenterprise.com';

export function outSystemsUrl(path) {
  const baseUrl = (process.env.OUTSYSTEMS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return `${baseUrl}${path}`;
}

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value || '';
}

export function authHeaders(token) {
  return {
    // P5's published Auth API uses Token. Authorization is also forwarded for
    // consumers that implemented the earlier shared Bearer-token convention.
    Token: token,
    Authorization: `Bearer ${token}`,
  };
}

export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key ? `${key[0].toLowerCase()}${key.slice(1)}` : key,
      camelize(child),
    ]),
  );
}

export async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function proxyEnvelope(response, payload) {
  const normalized = camelize(payload);

  if (!response.ok) {
    const rawErrors = normalized?.errors;
    const errors = Array.isArray(rawErrors)
      ? rawErrors.map((error) =>
          typeof error === 'string' ? { code: 'BACKEND_ERROR', message: error } : error,
        )
      : [{ code: 'BACKEND_ERROR', message: normalized?.errorMessage || `Request failed (${response.status}).` }];
    return { success: false, data: null, errors };
  }

  if (normalized && typeof normalized.success === 'boolean' && 'data' in normalized) {
    return normalized;
  }

  return { success: true, data: normalized, errors: [] };
}
