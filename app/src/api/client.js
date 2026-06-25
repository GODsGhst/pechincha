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
export function setAuthToken(token) {
  authToken = token;
}

async function request(metodo, caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(API_BASE + caminho, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    const erro = new Error(`Falha de conexão com a API em ${API_BASE}`);
    erro.cause = e;
    throw erro;
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
  return json;
}

export const api = {
  get: (caminho) => request('GET', caminho),
  post: (caminho, corpo) => request('POST', caminho, corpo),
  put: (caminho, corpo) => request('PUT', caminho, corpo),
  delete: (caminho) => request('DELETE', caminho),
};
