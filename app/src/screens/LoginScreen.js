// Tela de login / cadastro. Cada usuário só vê as próprias notas, então o
// acesso é exigido antes de tudo (o gate fica em App.js).

import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, fonts, radius } from '../theme';

export default function LoginScreen() {
  const { login, register, solicitarResetSenha, redefinirSenha, confirmar2fa, confirmarEmail, reenviarVerificacaoEmail } = useAuth();
  const [modo, setModo] = useState('login'); // 'login' | 'cadastro' | 'recuperar' | 'redefinir' | 'verificar' | '2fa'
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [tokenReset, setTokenReset] = useState('');
  const [erro, setErro] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);

  function senhaForte(valor) {
    return valor.length >= 8 && /[a-z]/.test(valor) && /[A-Z]/.test(valor) && /\d/.test(valor);
  }

  function trocarModo(proximo) {
    setModo(proximo);
    setErro(null);
    setMensagem(null);
    if (proximo !== 'redefinir' && proximo !== 'verificar') setTokenReset('');
  }

  async function enviar() {
    setErro(null);
    setMensagem(null);
    const emailLimpo = email.trim().toLowerCase();

    if (!emailLimpo) {
      setErro('Informe seu e-mail.');
      return;
    }

    if ((modo === 'cadastro' || modo === 'redefinir') && !senhaForte(senha)) {
      setErro('Use uma senha com 8+ caracteres, maiúscula, minúscula e número.');
      return;
    }
    if (modo === 'cadastro' && (!aceiteTermos || !aceitePrivacidade)) {
      setErro('Aceite os termos de uso e a política de privacidade.');
      return;
    }
    if (modo === 'redefinir' && tokenReset.trim().length < 16) {
      setErro('Informe o código de recuperação.');
      return;
    }
    if (modo === 'verificar' && tokenReset.trim().length < 16) {
      setErro('Informe o código de confirmação enviado por e-mail.');
      return;
    }
    if (modo === '2fa' && !/^\d{6}$/.test(tokenReset.trim())) {
      setErro('Informe o código de 6 dígitos.');
      return;
    }

    setCarregando(true);
    try {
      if (modo === 'cadastro') {
        const resposta = await register(nome.trim(), emailLimpo, senha, {
          termos: aceiteTermos,
          privacidade: aceitePrivacidade
        });
        if (resposta?.requires_email_verification) {
          if (resposta?.email_verification_token_dev) setTokenReset(resposta.email_verification_token_dev);
          setSenha('');
          setMensagem(resposta?.message || 'Enviamos um código para confirmar seu e-mail.');
          setModo('verificar');
        }
      } else if (modo === 'recuperar') {
        const resposta = await solicitarResetSenha(emailLimpo);
        if (resposta?.reset_token_dev) setTokenReset(resposta.reset_token_dev);
        setMensagem(resposta?.message || 'Verifique as instruções para redefinir sua senha.');
        setModo('redefinir');
      } else if (modo === 'redefinir') {
        const resposta = await redefinirSenha(emailLimpo, tokenReset.trim(), senha);
        setSenha('');
        setTokenReset('');
        setModo('login');
        setMensagem(resposta?.message || 'Senha redefinida. Entre com a nova senha.');
      } else if (modo === 'verificar') {
        await confirmarEmail(emailLimpo, tokenReset.trim());
      } else if (modo === '2fa') {
        await confirmar2fa(emailLimpo, tokenReset.trim());
      } else {
        const resposta = await login(emailLimpo, senha);
        if (resposta?.requires_2fa) {
          if (resposta?.codigo_2fa_dev) setTokenReset(resposta.codigo_2fa_dev);
          setSenha('');
          setMensagem(resposta?.message || 'Enviamos um código para confirmar seu acesso.');
          setModo('2fa');
        } else if (resposta?.requires_email_verification) {
          if (resposta?.email_verification_token_dev) setTokenReset(resposta.email_verification_token_dev);
          setSenha('');
          setMensagem(resposta?.message || 'Confirme seu e-mail antes de entrar.');
          setModo('verificar');
        }
      }
    } catch (e) {
      setErro(e.message || 'Não foi possível entrar');
    } finally {
      setCarregando(false);
    }
  }

  const cadastro = modo === 'cadastro';
  const recuperar = modo === 'recuperar';
  const redefinir = modo === 'redefinir';
  const verificar = modo === 'verificar';
  const doisFatores = modo === '2fa';
  const titulo = cadastro ? 'Criar conta' : recuperar ? 'Recuperar senha' : redefinir ? 'Nova senha' : verificar ? 'Confirmar e-mail' : doisFatores ? 'Código admin' : 'Entrar';
  const textoBotao = cadastro ? 'Cadastrar' : recuperar ? 'Enviar recuperação' : redefinir ? 'Redefinir senha' : verificar ? 'Confirmar e-mail' : doisFatores ? 'Confirmar código' : 'Entrar';

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.topo}>
          <View style={styles.logo}>
            <Ionicons name="pricetags" size={26} color={colors.white} />
          </View>
          <Text style={styles.marca}>Consult Price</Text>
          <Text style={styles.tagline}>Os melhores preços da sua região,{'\n'}feitos pela comunidade.</Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.titulo}>{titulo}</Text>

          {cadastro && (
            <Campo icone="person-outline" placeholder="Seu nome" value={nome} onChangeText={setNome} autoCapitalize="words" />
          )}
          <Campo icone="mail-outline" placeholder="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          {(redefinir || verificar || doisFatores) && (
            <Campo
              icone="key-outline"
              placeholder={doisFatores ? 'Código de 6 dígitos' : verificar ? 'Código de confirmação' : 'Código de recuperação'}
              value={tokenReset}
              onChangeText={setTokenReset}
              keyboardType={doisFatores ? 'number-pad' : 'default'}
              autoCapitalize="none"
            />
          )}
          {!recuperar && !verificar && !doisFatores && (
            <Campo
              icone="lock-closed-outline"
              placeholder={cadastro || redefinir ? 'Senha forte' : 'Senha'}
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
            />
          )}
          {cadastro && (
            <View style={styles.termosBox}>
              <CheckLinha checked={aceiteTermos} onPress={() => setAceiteTermos((v) => !v)} texto="Aceito os termos de uso" />
              <CheckLinha checked={aceitePrivacidade} onPress={() => setAceitePrivacidade((v) => !v)} texto="Aceito a política de privacidade" />
            </View>
          )}

          {mensagem && <Text style={styles.sucesso}>{mensagem}</Text>}
          {erro && <Text style={styles.erro}>{erro}</Text>}

          <Pressable style={({ pressed }) => [styles.botao, pressed && styles.botaoPressed]} onPress={enviar} disabled={carregando}>
            {carregando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoTexto}>{textoBotao}</Text>}
          </Pressable>

          {modo === 'login' && (
            <Pressable onPress={() => trocarModo('recuperar')}>
              <Text style={styles.esqueci}>Esqueci minha senha</Text>
            </Pressable>
          )}

          {recuperar || redefinir || verificar || doisFatores ? (
            <>
              {verificar && (
                <Pressable
                  onPress={async () => {
                    try {
                      const resposta = await reenviarVerificacaoEmail(email.trim().toLowerCase());
                      if (resposta?.email_verification_token_dev) setTokenReset(resposta.email_verification_token_dev);
                      setMensagem(resposta?.message || 'Enviamos um novo código.');
                    } catch (e) {
                      setErro(e.message || 'Não foi possível reenviar.');
                    }
                  }}
                >
                  <Text style={styles.esqueci}>Reenviar código</Text>
                </Pressable>
              )}
              <Pressable onPress={() => trocarModo('login')}>
                <Text style={styles.alternar}>Voltar para <Text style={styles.alternarForte}>entrar</Text></Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => trocarModo(cadastro ? 'login' : 'cadastro')}>
              <Text style={styles.alternar}>
                {cadastro ? 'Já tem conta? ' : 'Ainda não tem conta? '}
                <Text style={styles.alternarForte}>{cadastro ? 'Entrar' : 'Cadastre-se'}</Text>
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CheckLinha({ checked, onPress, texto }) {
  return (
    <Pressable style={styles.checkLinha} onPress={onPress}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18} color={checked ? colors.brand : colors.inkMuted} />
      <Text style={styles.checkTexto}>{texto}</Text>
    </Pressable>
  );
}

function Campo({ icone, ...props }) {
  return (
    <View style={styles.campo}>
      <Ionicons name={icone} size={18} color={colors.inkMuted} />
      <TextInput style={styles.input} placeholderTextColor={colors.inkMuted} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.brandDark },
  flex: { flex: 1, justifyContent: 'center' },
  topo: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 28 },
  logo: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  marca: { fontFamily: fonts.display, fontSize: 26, color: colors.white },
  tagline: { fontFamily: fonts.body, fontSize: 13, color: '#9FD9BC', textAlign: 'center', marginTop: 8, lineHeight: 19 },
  cartao: { backgroundColor: colors.canvas, marginHorizontal: 18, borderRadius: radius.xl, padding: 22 },
  titulo: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, marginBottom: 16 },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, height: 50, marginBottom: 12 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  termosBox: { gap: 8, marginBottom: 12 },
  checkLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft },
  erro: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger, marginBottom: 10 },
  sucesso: { fontFamily: fonts.medium, fontSize: 13, color: colors.brandDark, marginBottom: 10, lineHeight: 18 },
  botao: { backgroundColor: colors.brand, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  botaoPressed: { opacity: 0.85 },
  botaoTexto: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  esqueci: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.brand, textAlign: 'center', marginTop: 14 },
  alternar: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 16 },
  alternarForte: { fontFamily: fonts.semibold, color: colors.brand },
});
