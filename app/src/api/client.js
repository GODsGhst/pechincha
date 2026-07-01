// Cliente HTTP do app. Centraliza a base URL e a injeção do token JWT.
// O app é um "cliente fino": só fala com o backend, que faz toda a análise.

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUBLIC_API_URL = 'https://consult-price-api.onrender.com/api';
const CACHE_STORAGE_KEY = 'pechincha.httpCache.v1';

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
let cacheOwnerId = null;
const cacheGet = new Map();
const requisicoesGet = new Map();
const CACHE_MAX = 80;
let cachePersistenteCarregado = false;
let cachePersistentePromise = null;

export function setAuthToken(token) {
  if (token !== authToken) {
    limparCacheGet({ incluirPrivadoPersistente: true });
    requisicoesGet.clear();
    cachePersistenteCarregado = false;
    cachePersistentePromise = null;
  }
  authToken = token;
}

export function setCacheOwner(id) {
  const novoId = id ? String(id) : null;
  if (novoId !== cacheOwnerId) {
    limparCacheGet({ incluirPrivadoPersistente: true });
    requisicoesGet.clear();
  }
  cacheOwnerId = novoId;
}

export function limparCachePrivadoPersistente() {
  limparCacheGet({ incluirPrivadoPersistente: true });
  persistirCacheGet();
}

function cachePublico(caminho) {
  return caminho.startsWith('/produtos') || caminho.startsWith('/estabelecimentos');
}

function cachePrivado(caminho) {
  return caminho === '/lista' ||
    caminho.startsWith('/lista?') ||
    caminho === '/compras' ||
    caminho.startsWith('/compras?') ||
    caminho.startsWith('/compras/');
}

function devePersistirCache(caminho, opcoes = {}) {
  if (opcoes.persistCache !== undefined) return Boolean(opcoes.persistCache);
  return cachePublico(caminho) || (Boolean(authToken && cacheOwnerId) && cachePrivado(caminho));
}

function chaveDaSessao(caminho) {
  if (cachePublico(caminho)) return 'public';
  if (authToken && cacheOwnerId) return `user:${cacheOwnerId}`;
  return authToken ? 'auth-session' : 'anon';
}

async function carregarCachePersistente() {
  if (cachePersistenteCarregado) return;
  if (!cachePersistentePromise) {
    cachePersistentePromise = (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
        const entradas = bruto ? JSON.parse(bruto) : [];
        if (Array.isArray(entradas)) {
          entradas.forEach(([chave, item]) => {
            if (chave && item && item.persistente && item.valor !== undefined) {
              cacheGet.set(chave, item);
            }
          });
        }
      } catch (_e) {
        await AsyncStorage.removeItem(CACHE_STORAGE_KEY);
      } finally {
        cachePersistenteCarregado = true;
      }
    })();
  }
  await cachePersistentePromise;
}

function persistirCacheGet() {
  const entradas = [...cacheGet.entries()]
    .filter(([, item]) => item.persistente)
    .sort((a, b) => Number(b[1].salvoEmMs || 0) - Number(a[1].salvoEmMs || 0))
    .slice(0, CACHE_MAX);

  AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entradas)).catch(() => {});
}

function limparCacheGet({ incluirPersistente = false, incluirPrivadoPersistente = false } = {}) {
  if (incluirPersistente) {
    cacheGet.clear();
    AsyncStorage.removeItem(CACHE_STORAGE_KEY).catch(() => {});
    return;
  }

  for (const [chave, item] of cacheGet.entries()) {
    if (!item.persistente || (incluirPrivadoPersistente && item.privado)) cacheGet.delete(chave);
  }
}

function obterCacheGetItem(chave, aceitarExpirado = false) {
  const item = cacheGet.get(chave);
  if (!item) return null;
  if (!aceitarExpirado && Date.now() > item.expiraEm) {
    return null;
  }
  return item;
}

function salvarCacheGet(chave, valor, cacheMs, persistente, privado) {
  if (!cacheMs) return;
  if (cacheGet.size >= CACHE_MAX) {
    const [primeira] = cacheGet.keys();
    cacheGet.delete(primeira);
  }
  const salvoEmMs = Date.now();
  cacheGet.set(chave, {
    valor,
    expiraEm: salvoEmMs + cacheMs,
    salvoEm: new Date(salvoEmMs).toISOString(),
    salvoEmMs,
    persistente,
    privado
  });
  if (persistente) persistirCacheGet();
}

function comMetaCache(valor, item, extra = {}) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return valor;
  return {
    ...valor,
    _meta: {
      ...(valor._meta || {}),
      from_cache: true,
      cached_at: item.salvoEm,
      ...extra
    }
  };
}

async function request(metodo, caminho, corpo, opcoes = {}) {
  const chaveGet = metodo === 'GET' ? `${chaveDaSessao(caminho)}:${API_BASE}${caminho}` : null;
  const cacheMs = metodo === 'GET' ? Number(opcoes.cacheMs || 0) : 0;
  const cacheKey = cacheMs ? chaveGet : null;
  const persistente = Boolean(cacheKey && devePersistirCache(caminho, opcoes));
  const privado = Boolean(persistente && cachePrivado(caminho) && !cachePublico(caminho));
  const forcarRede = Boolean(opcoes.forceRefresh || opcoes.skipCache);
  if (persistente) await carregarCachePersistente();
  if (cacheKey && !forcarRede) {
    const cached = obterCacheGetItem(cacheKey);
    if (cached) return cached.valor;
  }

  const podeReaproveitar = chaveGet && !forcarRede;
  if (podeReaproveitar && requisicoesGet.has(chaveGet)) {
    return requisicoesGet.get(chaveGet);
  }

  const requisicao = executarRequest(metodo, caminho, corpo, opcoes, cacheKey, cacheMs, persistente, privado);
  if (podeReaproveitar) {
    requisicoesGet.set(chaveGet, requisicao);
    requisicao.then(
      () => requisicoesGet.delete(chaveGet),
      () => requisicoesGet.delete(chaveGet)
    );
  }
  return requisicao;
}

async function executarRequest(metodo, caminho, corpo, opcoes, cacheKey, cacheMs, persistente, privado) {
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
    if (cacheKey) {
      const stale = obterCacheGetItem(cacheKey, true);
      if (stale) {
        return comMetaCache(stale.valor, stale, {
          offline: true,
          stale: Date.now() > stale.expiraEm
        });
      }
    }

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
  if (metodo !== 'GET') limparCacheGet({ incluirPrivadoPersistente: Boolean(authToken) });
  if (cacheKey) salvarCacheGet(cacheKey, json, cacheMs, persistente, privado);
  return json;
}

export const api = {
  get: (caminho, opcoes) => request('GET', caminho, undefined, opcoes),
  post: (caminho, corpo, opcoes) => request('POST', caminho, corpo, opcoes),
  put: (caminho, corpo, opcoes) => request('PUT', caminho, corpo, opcoes),
  delete: (caminho, opcoes) => request('DELETE', caminho, undefined, opcoes),
};
