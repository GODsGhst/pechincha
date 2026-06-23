// Estado global de autenticação.
// O token JWT é guardado em expo-secure-store (Keychain no iOS, Keystore no
// Android) — nunca em armazenamento comum. Assim cada usuário vê só suas notas.

import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken } from '../api/client';

const TOKEN_KEY = 'pechincha.token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Ao abrir o app, tenta recuperar uma sessão salva
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          setAuthToken(token);
          const dados = await SecureStore.getItemAsync('pechincha.usuario');
          if (dados) setUsuario(JSON.parse(dados));
        }
      } catch (_e) {
        // sessão inválida — segue deslogado
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function persistirSessao(token, dadosUsuario) {
    setAuthToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync('pechincha.usuario', JSON.stringify(dadosUsuario));
    setUsuario(dadosUsuario);
  }

  async function login(email, senha) {
    const { token, usuario: u } = await api.post('/auth/login', { email, senha });
    await persistirSessao(token, u);
  }

  async function register(nome, email, senha) {
    const { token, usuario: u } = await api.post('/auth/register', { nome, email, senha });
    await persistirSessao(token, u);
  }

  async function logout() {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync('pechincha.usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
