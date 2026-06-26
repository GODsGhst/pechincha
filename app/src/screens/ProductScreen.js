import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ProductImage from '../components/ProductImage';
import { useCart } from '../context/CartContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL, tempoRelativo } from '../utils/format';

export default function ProductScreen({ route, navigation }) {
  const { id, nome } = route.params;
  const { adicionar, contem } = useCart();
  const [produto, setProduto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const naLista = contem(id);
  const estatisticaGeral = produto?.estatisticas?.geral || {};
  const mediasPorLocal = produto?.estatisticas?.por_estabelecimento || [];

  useEffect(() => {
    (async () => {
      try {
        setProduto(await api.get(`/produtos/${id}`));
      } catch (_e) {
        setProduto(null);
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
        <Text style={styles.headerTitulo} numberOfLines={1}>Detalhe</Text>
        <View style={{ width: 40 }} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : !produto ? (
        <Text style={styles.vazio}>Não foi possível carregar este produto.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <ProductImage uri={produto.imagem_url} style={styles.imagem} iconName="pricetag" iconSize={48} />
          <Text style={styles.nome}>{produto.nome}</Text>
          <View style={styles.metaLinha}>
            {[produto.categoria, produto.tipo, produto.marca, produto.quantidade].filter(Boolean).map((item) => (
              <View key={item} style={styles.metaChip}>
                <Text style={styles.metaTexto} numberOfLines={1}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.bannerPreco}>
            <Text style={styles.bannerLabel}>melhor preço encontrado</Text>
            <Text style={styles.bannerValor}>{formatBRL(produto.menor_preco)}</Text>
          </View>

          {estatisticaGeral.registros > 0 && (
            <View style={styles.statsBox}>
              <View style={styles.statPrincipal}>
                <Text style={styles.statLabel}>média geral</Text>
                <Text style={styles.statValor}>{formatBRL(estatisticaGeral.media_preco)}</Text>
              </View>
              <View style={styles.statDupla}>
                <View style={styles.statMini}>
                  <Text style={styles.statLabel}>menor</Text>
                  <Text style={styles.statMiniValor}>{formatBRL(estatisticaGeral.menor_preco)}</Text>
                </View>
                <View style={styles.statMini}>
                  <Text style={styles.statLabel}>maior</Text>
                  <Text style={styles.statMiniValor}>{formatBRL(estatisticaGeral.maior_preco)}</Text>
                </View>
              </View>
            </View>
          )}

          <Pressable
            style={[styles.botaoLista, naLista && styles.botaoListaOn]}
            onPress={() => adicionar({ id, nome: produto.nome, menor_preco: produto.menor_preco })}
            disabled={naLista}
          >
            <Ionicons name={naLista ? 'checkmark' : 'cart-outline'} size={18} color={naLista ? colors.brand : colors.white} />
            <Text style={[styles.botaoListaTexto, naLista && { color: colors.brand }]}>
              {naLista ? 'Na sua lista' : 'Adicionar à lista'}
            </Text>
          </Pressable>

          <Text style={styles.secao}>Preços e lugares</Text>
          {mediasPorLocal.length > 0 && (
            <View style={styles.mediasLista}>
              {mediasPorLocal.slice(0, 4).map((local) => (
                <View key={String(local.estabelecimento_id || local.estabelecimento)} style={styles.mediaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mediaLocal} numberOfLines={1}>{local.estabelecimento || 'Local não identificado'}</Text>
                    <Text style={styles.mediaMeta} numberOfLines={1}>
                      média {formatBRL(local.media_preco)} · menor {formatBRL(local.menor_preco)}
                    </Text>
                  </View>
                  <Text style={styles.mediaUltimo}>{formatBRL(local.ultimo_preco)}</Text>
                </View>
              ))}
            </View>
          )}
          {produto.historico.length === 0 ? (
            <Text style={styles.vazio}>Sem registros ainda.</Text>
          ) : (
            produto.historico.map((h, i) => {
              const melhor = h.valor === produto.menor_preco;
              return (
                <View key={i} style={[styles.row, melhor && styles.rowMelhor]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowValor, melhor && { color: colors.brandDark }]}>{formatBRL(h.valor)}</Text>
                    <Text style={styles.rowLocal} numberOfLines={1}>
                      {h.estabelecimento || 'Local não identificado'} · {tempoRelativo(h.data)}
                    </Text>
                  </View>
                  {melhor ? (
                    <View style={styles.tagMelhor}><Text style={styles.tagMelhorTexto}>melhor</Text></View>
                  ) : (
                    <Ionicons name="location-outline" size={18} color={colors.location} />
                  )}
                </View>
              );
            })
          )}
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
  imagem: { height: 150, borderRadius: radius.lg, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  nome: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: 14 },
  metaLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaChip: { borderRadius: radius.pill, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' },
  metaTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.brandDark },
  bannerPreco: { backgroundColor: colors.brandDark, borderRadius: radius.lg, padding: 16, marginTop: 12 },
  bannerLabel: { fontFamily: fonts.body, fontSize: 11, color: '#9FD9BC', textTransform: 'uppercase' },
  bannerValor: { fontFamily: fonts.monoMedium, fontSize: 28, color: colors.white, marginTop: 2 },
  statsBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginTop: 12 },
  statPrincipal: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 10, marginBottom: 10 },
  statLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted, textTransform: 'uppercase' },
  statValor: { fontFamily: fonts.monoMedium, fontSize: 22, color: colors.brandDark, marginTop: 2 },
  statDupla: { flexDirection: 'row', gap: 10 },
  statMini: { flex: 1 },
  statMiniValor: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.ink, marginTop: 2 },
  botaoLista: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, height: 50, marginTop: 14 },
  botaoListaOn: { backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine },
  botaoListaTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  secao: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 22, marginBottom: 10 },
  mediasLista: { gap: 8, marginBottom: 10 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 11 },
  mediaLocal: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  mediaMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  mediaUltimo: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.brandDark },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  rowMelhor: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftLine },
  rowValor: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
  rowLocal: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  tagMelhor: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  tagMelhorTexto: { fontFamily: fonts.semibold, fontSize: 11, color: colors.white },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 24 },
});
