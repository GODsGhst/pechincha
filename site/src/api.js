export const API_BASE = (import.meta.env.VITE_API_URL || 'https://consult-price-api.onrender.com/api').replace(/\/+$/, '');

const TOKEN_KEY = 'pechincha.web.token';
const USER_KEY = 'pechincha.web.usuario';

let authToken = localStorage.getItem(TOKEN_KEY);

export function getStoredSession() {
  const usuario = localStorage.getItem(USER_KEY);
  return {
    token: authToken,
    usuario: usuario ? JSON.parse(usuario) : null
  };
}

export function setStoredSession(token, usuario) {
  authToken = token;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

export function clearStoredSession() {
  authToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    const err = new Error(`Falha de conexão com a API em ${API_BASE}`);
    err.cause = error;
    throw err;
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

  return json;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path)
};
