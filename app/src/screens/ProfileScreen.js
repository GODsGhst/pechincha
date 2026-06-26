import { useState, useCallback } from 'react';
import { Alert, View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL } from '../utils/format';

function iniciais(nome) {
  if (!nome) return '?';
  const p = nome.trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { usuario, logout, excluirConta } = useAuth();
  const [compras, setCompras] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { compras: c } = await api.get('/compras');
      setCompras(c || []);
    } catch (_e) {
      setCompras([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function confirmarExclusao() {
    Alert.alert(
      'Excluir conta?',
      'Isso remove sua conta, histórico de notas, importações e lista de compras. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setExcluindo(true);
            try {
              await excluirConta();
            } catch (_e) {
              setExcluindo(false);
              Alert.alert('Não foi possível excluir', 'Tente novamente em alguns instantes.');
            }
          }
        }
      ]
    );
  }

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 120, paddingHorizontal: 16 }}>
      <View style={styles.topo}>
        <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciais(usuario?.nome)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nome}>{usuario?.nome || 'Você'}</Text>
          <Text style={styles.email}>{usuario?.email}</Text>
        </View>
      </View>

      <View style={styles.colabCard}>
        <View>
          <Text style={styles.colabLabel}>Total de colaborações</Text>
          <Text style={styles.colabTexto}>Cada cupom seu ajuda toda a comunidade</Text>
        </View>
        <Text style={styles.colabNumero}>{carregando ? '—' : compras.length}</Text>
      </View>

      <View style={styles.privacidadeCard}>
        <View style={styles.privacidadeIcone}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.brandDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.privacidadeTitulo}>Privacidade</Text>
          <Text style={styles.privacidadeTexto}>Seu login fica no armazenamento seguro do aparelho. Suas notas ficam no servidor vinculadas à sua conta.</Text>
        </View>
      </View>

      <Text style={styles.secao}>Seu histórico</Text>

      {carregando ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
      ) : compras.length === 0 ? (
        <Text style={styles.vazio}>Você ainda não escaneou nenhum cupom.</Text>
      ) : (
        compras.map((c) => (
          <Pressable key={c.id} style={styles.row} onPress={() => navigation.navigate('Receipt', { id: c.id })}>
            <View style={styles.rowIcone}><Ionicons name="receipt-outline" size={18} color={colors.brandDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLocal} numberOfLines={1}>{c.estabelecimento || 'Estabelecimento'}</Text>
              <Text style={styles.rowData}>{dataHora(c.data_compra)}</Text>
            </View>
            <Text style={styles.rowValor}>{formatBRL(c.valor_total)}</Text>
          </Pressable>
        ))
      )}

      <Pressable style={styles.sair} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.sairTexto}>Sair da conta</Text>
      </Pressable>

      <Pressable style={styles.excluir} onPress={confirmarExclusao} disabled={excluindo}>
        {excluindo ? (
          <ActivityIndicator size="small" color={colors.danger} />
        ) : (
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        )}
        <Text style={styles.excluirTexto}>{excluindo ? 'Excluindo conta' : 'Excluir conta e dados'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fonts.display, fontSize: 22, color: colors.brandDark },
  nome: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  email: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  colabCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.brandDark, borderRadius: radius.lg, padding: 16, marginTop: 20 },
  colabLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  colabTexto: { fontFamily: fonts.body, fontSize: 12, color: '#9FD9BC', marginTop: 2, maxWidth: 200 },
  colabNumero: { fontFamily: fonts.display, fontSize: 36, color: '#5FD698' },
  privacidadeCard: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, marginTop: 12 },
  privacidadeIcone: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  privacidadeTitulo: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  privacidadeTexto: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, marginTop: 2 },
  secao: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 24, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  rowIcone: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  rowLocal: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  rowData: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  rowValor: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.brandDark },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 16 },
  sair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  sairTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
  excluir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: '#F0C6B4', backgroundColor: '#FFF3EC' },
  excluirTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
});
