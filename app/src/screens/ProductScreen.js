import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useCart } from '../context/CartContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL, tempoRelativo } from '../utils/format';

export default function ProductScreen({ route, navigation }) {
  const { id, nome } = route.params;
  const { adicionar, contem } = useCart();
  const [produto, setProduto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const naLista = contem(id);

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
          <View style={styles.imagem}><Ionicons name="pricetag" size={48} color={colors.inkMuted} /></View>
          <Text style={styles.nome}>{produto.nome}</Text>

          <View style={styles.bannerPreco}>
            <Text style={styles.bannerLabel}>melhor preço encontrado</Text>
            <Text style={styles.bannerValor}>{formatBRL(produto.menor_preco)}</Text>
          </View>

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
  bannerPreco: { backgroundColor: colors.brandDark, borderRadius: radius.lg, padding: 16, marginTop: 12 },
  bannerLabel: { fontFamily: fonts.body, fontSize: 11, color: '#9FD9BC', textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerValor: { fontFamily: fonts.monoMedium, fontSize: 28, color: colors.white, marginTop: 2 },
  botaoLista: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, height: 50, marginTop: 14 },
  botaoListaOn: { backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine },
  botaoListaTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  secao: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  rowMelhor: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftLine },
  rowValor: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.ink },
  rowLocal: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  tagMelhor: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  tagMelhorTexto: { fontFamily: fonts.semibold, fontSize: 11, color: colors.white },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 24 },
});
