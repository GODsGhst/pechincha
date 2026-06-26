// Cliente HTTP do app. Centraliza a base URL e a injeção do token JWT.
// O app é um "cliente fino": só fala com o backend, que faz toda a análise.

import Constants from 'expo-constants';

const PUBLIC_API_URL = 'https://consult-price-api.onrender.com/api';

function limparUrl(url) {
  return url ? url.replace(/\/+$/, '') : null;
}

function extraApiUrl() {
  return (
    Constants.expoConfig?.extra?.apiUrl ||
    Constants.manifest?.extra?.apiUrl ||
    Constants.manifest2?.extra?.expoClient?.extra?.apiUrl
  );
}

// APK/Expo Go não deve depender de localhost. Para testar uma API local,
// troque expo.extra.apiUrl no app.json para o IP da máquina na mesma rede.
function resolverBaseUrl() {
  const extra = limparUrl(extraApiUrl());
  if (extra) return extra;

  return PUBLIC_API_URL;
}

export const API_BASE = resolverBaseUrl();

if (__DEV__) {
  console.log(`API_BASE=${API_BASE}`);
}

let authToken = null;
const cacheGet = new Map();
const CACHE_MAX = 80;

export function setAuthToken(token) {
  authToken = token;
}

function obterCacheGet(chave) {
  const item = cacheGet.get(chave);
  if (!item) return null;
  if (Date.now() > item.expiraEm) {
    cacheGet.delete(chave);
    return null;
  }
  return item.valor;
}

function salvarCacheGet(chave, valor, cacheMs) {
  if (!cacheMs) return;
  if (cacheGet.size >= CACHE_MAX) {
    const [primeira] = cacheGet.keys();
    cacheGet.delete(primeira);
  }
  cacheGet.set(chave, { valor, expiraEm: Date.now() + cacheMs });
}

async function request(metodo, caminho, corpo, opcoes = {}) {
  const cacheMs = metodo === 'GET' ? Number(opcoes.cacheMs || 0) : 0;
  const cacheKey = cacheMs ? `${authToken || 'public'}:${API_BASE}${caminho}` : null;
  if (cacheKey) {
    const cached = obterCacheGet(cacheKey);
    if (cached) return cached;
  }

  let resposta;
  const timeoutMs = opcoes.timeoutMs || 60000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    resposta = await fetch(API_BASE + caminho, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    const abortou = e && (e.name === 'AbortError' || controller?.signal?.aborted);
    const erro = new Error(abortou
      ? 'A API demorou demais para responder. Tente novamente em alguns segundos.'
      : `Falha de conexão com a API em ${API_BASE}`);
    erro.cause = e;
    erro.status = abortou ? 'timeout' : undefined;
    throw erro;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  let json = null;
  try {
    json = await resposta.json();
  } catch (_e) {
    json = null;
  }

  if (!resposta.ok) {
    const erro = new Error((json && json.error) || `Erro ${resposta.status}`);
    erro.status = resposta.status;
    erro.payload = json;
    throw erro;
  }
  if (cacheKey) salvarCacheGet(cacheKey, json, cacheMs);
  return json;
}

export const api = {
  get: (caminho, opcoes) => request('GET', caminho, undefined, opcoes),
  post: (caminho, corpo, opcoes) => request('POST', caminho, corpo, opcoes),
  put: (caminho, corpo, opcoes) => request('PUT', caminho, corpo, opcoes),
  delete: (caminho, opcoes) => request('DELETE', caminho, undefined, opcoes),
};
