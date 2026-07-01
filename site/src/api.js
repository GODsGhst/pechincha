export const API_BASE = (import.meta.env.VITE_API_URL || 'https://consult-price-api.onrender.com/api').replace(/\/+$/, '');

const TOKEN_KEY = 'pechincha.web.token';
const USER_KEY = 'pechincha.web.usuario';

function storageDisponivel(nome) {
  try {
    return typeof window !== 'undefined' ? window[nome] : null;
  } catch (_error) {
    return null;
  }
}

const sessionStore = storageDisponivel('sessionStorage');
const legacyStore = storageDisponivel('localStorage');

function ler(store, chave) {
  try {
    return store ? store.getItem(chave) : null;
  } catch (_error) {
    return null;
  }
}

function gravar(store, chave, valor) {
  try {
    if (store) store.setItem(chave, valor);
  } catch (_error) {
    // Sessão web continua em memória se o navegador bloquear storage.
  }
}

function remover(store, chave) {
  try {
    if (store) store.removeItem(chave);
  } catch (_error) {
    // Sem ação: falha de storage não deve quebrar o app.
  }
}

function migrarSessaoLegada() {
  const tokenSessao = ler(sessionStore, TOKEN_KEY);
  const usuarioSessao = ler(sessionStore, USER_KEY);
  const tokenLegado = ler(legacyStore, TOKEN_KEY);
  const usuarioLegado = ler(legacyStore, USER_KEY);

  if (!tokenSessao && tokenLegado) gravar(sessionStore, TOKEN_KEY, tokenLegado);
  if (!usuarioSessao && usuarioLegado) gravar(sessionStore, USER_KEY, usuarioLegado);
  remover(legacyStore, TOKEN_KEY);
  remover(legacyStore, USER_KEY);

  return ler(sessionStore, TOKEN_KEY) || null;
}

let authToken = migrarSessaoLegada();
const cacheGet = new Map();
const requestsGet = new Map();
const CACHE_MAX = 80;

export function getStoredSession() {
  try {
    const usuario = ler(sessionStore, USER_KEY);
    return {
      token: authToken,
      usuario: usuario ? JSON.parse(usuario) : null
    };
  } catch (_error) {
    clearStoredSession();
    return { token: null, usuario: null };
  }
}

export function setStoredSession(token, usuario) {
  authToken = token;
  cacheGet.clear();
  requestsGet.clear();
  gravar(sessionStore, TOKEN_KEY, token);
  gravar(sessionStore, USER_KEY, JSON.stringify(usuario));
  remover(legacyStore, TOKEN_KEY);
  remover(legacyStore, USER_KEY);
}

export function clearStoredSession() {
  authToken = null;
  cacheGet.clear();
  requestsGet.clear();
  remover(sessionStore, TOKEN_KEY);
  remover(sessionStore, USER_KEY);
  remover(legacyStore, TOKEN_KEY);
  remover(legacyStore, USER_KEY);
}

function getCache(key, allowExpired = false) {
  const item = cacheGet.get(key);
  if (!item) return null;
  if (!allowExpired && Date.now() > item.expiraEm) {
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
  const getKey = method === 'GET' ? `${authToken || 'public'}:${API_BASE}${path}` : null;
  const cacheMs = method === 'GET' ? Number(options.cacheMs || 0) : 0;
  const cacheKey = cacheMs ? getKey : null;
  const forceNetwork = Boolean(options.forceRefresh || options.skipCache);
  const cached = cacheKey && !forceNetwork ? getCache(cacheKey) : null;
  if (cached) return cached;

  const canReuse = getKey && !forceNetwork;
  if (canReuse && requestsGet.has(getKey)) {
    return requestsGet.get(getKey);
  }

  const promise = runRequest(method, path, body, options, cacheKey, cacheMs);
  if (canReuse) {
    requestsGet.set(getKey, promise);
    promise.then(
      () => requestsGet.delete(getKey),
      () => requestsGet.delete(getKey)
    );
  }
  return promise;
}

async function runRequest(method, path, body, options, cacheKey, cacheMs) {
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
    if (cacheKey) {
      const stale = getCache(cacheKey, true);
      if (stale) return stale;
    }

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
