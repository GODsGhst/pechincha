// Cliente HTTP do app. Centraliza a base URL e a injeção do token JWT.
// O app é um "cliente fino": só fala com o backend, que faz toda a análise.

import Constants from 'expo-constants';

// Em desenvolvimento (Expo Go), o app roda no celular e "localhost" apontaria
// para o próprio celular. Por isso derivamos o IP da máquina de dev a partir
// do host do Metro. Em produção, troque por sua URL pública (HTTPS).
function resolverBaseUrl() {
  const extra = Constants.expoConfig?.extra?.apiUrl;
  if (extra) return extra;

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3001/api`;

  return 'http://localhost:3001/api';
}

export const API_BASE = resolverBaseUrl();

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

async function request(metodo, caminho, corpo) {
  const resposta = await fetch(API_BASE + caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

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
