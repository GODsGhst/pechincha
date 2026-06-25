import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, fonts, radius } from '../theme';
import { formatBRL } from '../utils/format';

function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatarQtd(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function metaTexto(item) {
  return [item.categoria, item.tipo, item.marca, item.quantidade_produto].filter(Boolean).join(' · ');
}

export default function ReceiptScreen({ route, navigation }) {
  const { id } = route.params;
  const [compra, setCompra] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setCompra(await api.get(`/compras/${id}`));
      } catch (_e) {
        setCompra(null);
      } finally {
        setCarregando(false);
      }
    })();
  }, [id]);

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconeVoltar} onPress={() => navigation.goBack()} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitulo} numberOfLines={1}>Notinha</Text>
        <View style={{ width: 40 }} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : !compra ? (
        <Text style={styles.vazio}>Não foi possível carregar esta compra.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <View style={styles.resumo}>
            <View style={styles.resumoIcone}>
              <Ionicons name="receipt" size={24} color={colors.brandDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.local} numberOfLines={2}>{compra.estabelecimento || 'Estabelecimento'}</Text>
              <Text style={styles.data}>{dataHora(compra.data_compra)}</Text>
            </View>
          </View>

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>total da nota</Text>
            <Text style={styles.totalValor}>{formatBRL(compra.valor_total)}</Text>
          </View>

          <Text style={styles.secao}>Produtos</Text>
          {(compra.itens || []).map((item, index) => {
            const nome = item.produto || item.nome_original || 'Produto';
            const originalDiferente = item.nome_original && item.nome_original !== nome;

            return (
              <View key={`${item.produto_id || index}-${index}`} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome} numberOfLines={2}>{nome}</Text>
                  {!!metaTexto(item) && <Text style={styles.itemMeta} numberOfLines={1}>{metaTexto(item)}</Text>}
                  {originalDiferente && (
                    <Text style={styles.itemOriginal} numberOfLines={1}>{item.nome_original}</Text>
                  )}
                  <Text style={styles.itemConta}>
                    {formatarQtd(item.quantidade)}x {formatBRL(item.valor_unitario)}
                  </Text>
                </View>
                <Text style={styles.itemTotal}>{formatBRL(item.valor_total)}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  iconeVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: colors.brandDark },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14 },
  resumoIcone: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  local: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  data: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  totalBox: { backgroundColor: colors.brandDark, borderRadius: radius.lg, padding: 16, marginTop: 12 },
  totalLabel: { fontFamily: fonts.body, fontSize: 11, color: '#9FD9BC', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValor: { fontFamily: fonts.monoMedium, fontSize: 28, color: colors.white, marginTop: 2 },
  secao: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 22, marginBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  itemNome: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  itemMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.brandDark, marginTop: 2 },
  itemOriginal: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  itemConta: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 6 },
  itemTotal: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.brandDark, marginTop: 1 },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 24 },
});
