export const API_BASE = (import.meta.env.VITE_API_URL || 'https://consult-price-api.onrender.com/api').replace(/\/+$/, '');

const TOKEN_KEY = 'pechincha.web.token';
const USER_KEY = 'pechincha.web.usuario';

let authToken = localStorage.getItem(TOKEN_KEY);
const cacheGet = new Map();
const CACHE_MAX = 80;

export function getStoredSession() {
  const usuario = localStorage.getItem(USER_KEY);
  return {
    token: authToken,
    usuario: usuario ? JSON.parse(usuario) : null
  };
}

export function setStoredSession(token, usuario) {
  authToken = token;
  cacheGet.clear();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

export function clearStoredSession() {
  authToken = null;
  cacheGet.clear();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getCache(key) {
  const item = cacheGet.get(key);
  if (!item) return null;
  if (Date.now() > item.expiraEm) {
    cacheGet.delete(key);
    return null;
  }
  return item.valor;
}

function setCache(key, value, cacheMs) {
  if (!cacheMs) return;
  if (cacheGet.size >= CACHE_MAX) {
    const [first] = cacheGet.keys();
    cacheGet.delete(first);
  }
  cacheGet.set(key, { valor: value, expiraEm: Date.now() + cacheMs });
}

async function request(method, path, body, options = {}) {
  const cacheMs = method === 'GET' ? Number(options.cacheMs || 0) : 0;
  const cacheKey = cacheMs ? `${authToken || 'public'}:${API_BASE}${path}` : null;
  const cached = cacheKey ? getCache(cacheKey) : null;
  if (cached) return cached;

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    const err = new Error(error?.name === 'AbortError'
      ? 'A API demorou demais para responder.'
      : `Falha de conexão com a API em ${API_BASE}`);
    err.cause = error;
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  let json = null;
  try {
    json = await response.json();
  } catch (_error) {
    json = null;
  }

  if (!response.ok) {
    const err = new Error((json && json.error) || `Erro ${response.status}`);
    err.status = response.status;
    err.payload = json;
    throw err;
  }

  if (method !== 'GET') cacheGet.clear();
  if (cacheKey) setCache(cacheKey, json, cacheMs);
  return json;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  delete: (path, options) => request('DELETE', path, undefined, options)
};
