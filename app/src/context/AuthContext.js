// Estado global de autenticação.
// O token JWT é guardado em expo-secure-store (Keychain no iOS, Keystore no
// Android) — nunca em armazenamento comum. Assim cada usuário vê só suas notas.

import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, limparCachePrivadoPersistente, setAuthToken, setCacheOwner } from '../api/client';
import { limparBuscasRecentes } from '../utils/recentSearches';

const TOKEN_KEY = 'pechincha.token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Ao abrir o app, tenta recuperar uma sessão salva
  useEffect(() => {
    (async () => {
      let liberouSessaoLocal = false;
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          setAuthToken(token);
          const dados = await SecureStore.getItemAsync('pechincha.usuario');
          if (dados) {
            const usuarioSalvo = JSON.parse(dados);
            setCacheOwner(usuarioSalvo?.id);
            setUsuario(usuarioSalvo);
            liberouSessaoLocal = true;
            setCarregando(false);
          }

          try {
            const { usuario: usuarioAtual } = await api.get('/auth/me');
            if (usuarioAtual) {
              await SecureStore.setItemAsync('pechincha.usuario', JSON.stringify(usuarioAtual));
              setCacheOwner(usuarioAtual.id);
              setUsuario(usuarioAtual);
            }
          } catch (erroSessao) {
            if (erroSessao?.status === 401 || erroSessao?.status === 403) {
              setAuthToken(null);
              await SecureStore.deleteItemAsync(TOKEN_KEY);
              await SecureStore.deleteItemAsync('pechincha.usuario');
              setUsuario(null);
            }
          }
        }
      } catch (_e) {
        // sessão inválida — segue deslogado
      } finally {
        if (!liberouSessaoLocal) setCarregando(false);
      }
    })();
  }, []);

  async function persistirSessao(token, dadosUsuario) {
    setAuthToken(token);
    setCacheOwner(dadosUsuario?.id);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync('pechincha.usuario', JSON.stringify(dadosUsuario));
    setUsuario(dadosUsuario);
  }

  async function login(email, senha) {
    let resposta;
    try {
      resposta = await api.post('/auth/login', { email, senha });
    } catch (e) {
      if (e?.status === 403 && e?.payload?.requires_email_verification) return e.payload;
      throw e;
    }
    if (resposta?.requires_2fa) return resposta;
    const { token, usuario: u } = resposta;
    await persistirSessao(token, u);
    return resposta;
  }

  async function register(nome, email, senha, aceite = {}) {
    const resposta = await api.post('/auth/register', {
      nome,
      email,
      senha,
      aceitar_termos: Boolean(aceite.termos),
      aceitar_privacidade: Boolean(aceite.privacidade)
    });
    if (resposta?.requires_email_verification) return resposta;
    const { token, usuario: u } = resposta;
    await persistirSessao(token, u);
    return resposta;
  }

  async function solicitarResetSenha(email) {
    return api.post('/auth/forgot-password', { email });
  }

  async function redefinirSenha(email, token, senha) {
    return api.post('/auth/reset-password', { email, token, senha });
  }

  async function confirmar2fa(email, codigo) {
    const { token, usuario: u } = await api.post('/auth/verify-2fa', { email, codigo });
    await persistirSessao(token, u);
  }

  async function confirmarEmail(email, tokenVerificacao) {
    const { token, usuario: u } = await api.post('/auth/verify-email', { email, token: tokenVerificacao });
    await persistirSessao(token, u);
  }

  async function reenviarVerificacaoEmail(email) {
    return api.post('/auth/resend-verification', { email });
  }

  async function exportarDados() {
    return api.get('/auth/data-export', { timeoutMs: 30000, skipCache: true });
  }

  async function logout() {
    limparCachePrivadoPersistente();
    setCacheOwner(null);
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync('pechincha.usuario');
    await limparBuscasRecentes();
    setUsuario(null);
  }

  async function excluirConta() {
    await api.delete('/auth/me');
    await logout();
  }

  return (
    <AuthContext.Provider value={{
      usuario,
      carregando,
      login,
      register,
      solicitarResetSenha,
      redefinirSenha,
      confirmar2fa,
      confirmarEmail,
      reenviarVerificacaoEmail,
      exportarDados,
      logout,
      excluirConta
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
