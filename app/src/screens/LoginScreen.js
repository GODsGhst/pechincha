// Tela de login / cadastro. Cada usuário só vê as próprias notas, então o
// acesso é exigido antes de tudo (o gate fica em App.js).

import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, fonts, radius } from '../theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [modo, setModo] = useState('login'); // 'login' | 'cadastro'
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar() {
    setErro(null);
    setCarregando(true);
    try {
      if (modo === 'cadastro') await register(nome.trim(), email.trim().toLowerCase(), senha);
      else await login(email.trim().toLowerCase(), senha);
    } catch (e) {
      setErro(e.message || 'Não foi possível entrar');
    } finally {
      setCarregando(false);
    }
  }

  const cadastro = modo === 'cadastro';

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
          <Text style={styles.titulo}>{cadastro ? 'Criar conta' : 'Entrar'}</Text>

          {cadastro && (
            <Campo icone="person-outline" placeholder="Seu nome" value={nome} onChangeText={setNome} autoCapitalize="words" />
          )}
          <Campo icone="mail-outline" placeholder="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Campo icone="lock-closed-outline" placeholder="Senha" value={senha} onChangeText={setSenha} secureTextEntry />

          {erro && <Text style={styles.erro}>{erro}</Text>}

          <Pressable style={({ pressed }) => [styles.botao, pressed && styles.botaoPressed]} onPress={enviar} disabled={carregando}>
            {carregando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.botaoTexto}>{cadastro ? 'Cadastrar' : 'Entrar'}</Text>}
          </Pressable>

          <Pressable onPress={() => { setModo(cadastro ? 'login' : 'cadastro'); setErro(null); }}>
            <Text style={styles.alternar}>
              {cadastro ? 'Já tem conta? ' : 'Ainda não tem conta? '}
              <Text style={styles.alternarForte}>{cadastro ? 'Entrar' : 'Cadastre-se'}</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  erro: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger, marginBottom: 10 },
  botao: { backgroundColor: colors.brand, borderRadius: radius.md, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  botaoPressed: { opacity: 0.85 },
  botaoTexto: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  alternar: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 16 },
  alternarForte: { fontFamily: fonts.semibold, color: colors.brand },
});
