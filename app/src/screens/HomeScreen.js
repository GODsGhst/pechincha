import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import BrandMark from '../components/BrandMark';
import ProductImage from '../components/ProductImage';
import { useAuth } from '../context/AuthContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL, formatPrecoUnidade, rotuloConfiancaPreco } from '../utils/format';

const CATEGORIAS = [
  { nome: 'Alimentos', icone: 'fast-food-outline' },
  { nome: 'Bebidas', icone: 'wine-outline' },
  { nome: 'Limpeza', icone: 'sparkles-outline' },
  { nome: 'Higiene', icone: 'water-outline' },
  { nome: 'Açougue', icone: 'restaurant-outline' },
  { nome: 'Hortifruti', icone: 'leaf-outline' },
];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { usuario } = useAuth();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [offlineCache, setOfflineCache] = useState(false);

  const carregar = useCallback(async (manual = false) => {
    if (manual) setAtualizando(true);
    try {
      const resposta = await api.get('/produtos/menores?limite=6', {
        cacheMs: 2 * 60 * 1000,
        forceRefresh: manual,
        preferStale: !manual,
        maxStaleMs: 6 * 60 * 60 * 1000
      });
      setItens(resposta.menores_precos || []);
      setOfflineCache(Boolean(resposta._meta?.offline));
      if (!manual && resposta._meta?.stale) {
        api.get('/produtos/menores?limite=6', { cacheMs: 2 * 60 * 1000, forceRefresh: true })
          .then((atualizado) => {
            setItens(atualizado.menores_precos || []);
            setOfflineCache(Boolean(atualizado._meta?.offline));
          })
          .catch(() => {});
      }
    } catch (_e) {
      setItens([]);
      setOfflineCache(false);
    } finally {
      setCarregando(false);
      if (manual) setAtualizando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  return (
    <View style={styles.tela}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTopo}>
          <BrandMark light />
          <View style={styles.headerIcones}>
            <Pressable onPress={() => navigation.navigate('Area')} accessibilityLabel="Área de pesquisa">
              <Ionicons name="location-outline" size={22} color="#BfE8D2" />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Lista')} accessibilityLabel="Minha lista">
              <Ionicons name="cart-outline" size={22} color="#BfE8D2" />
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.busca} onPress={() => navigation.navigate('Buscar')}>
          <Ionicons name="search" size={18} color={colors.inkMuted} />
          <Text style={styles.buscaTexto}>Buscar produto…</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => carregar(true)} tintColor={colors.brand} />}
      >
        <View style={styles.comunidade}>
          <Ionicons name="people" size={20} color={colors.brand} />
          <Text style={styles.comunidadeTexto}>
            Olá, {usuario?.nome?.split(' ')[0] || 'bem-vindo'}! Escaneie um cupom e <Text style={{ color: colors.brand, fontFamily: fonts.semibold }}>colabore</Text> com a comunidade.
          </Text>
        </View>

        {offlineCache && (
          <View style={styles.offlineBox}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.brandDark} />
            <Text style={styles.offlineTexto}>Mostrando últimos preços salvos no aparelho.</Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18 }} contentContainerStyle={{ gap: 12, paddingRight: 2 }}>
          {CATEGORIAS.map((c) => (
            <Pressable key={c.nome} style={styles.categoria} onPress={() => navigation.navigate('Buscar', { categoria: c.nome })}>
              <View style={styles.categoriaIcone}><Ionicons name={c.icone} size={22} color={colors.brandDark} /></View>
              <Text style={styles.categoriaNome}>{c.nome}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.secao}>Melhores preços</Text>

        {carregando ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : itens.length === 0 ? (
          <View style={styles.vazio}>
            <Ionicons name="qr-code-outline" size={36} color={colors.inkMuted} />
            <Text style={styles.vazioTitulo}>Ainda não há preços por aqui</Text>
            <Text style={styles.vazioTexto}>Escaneie o QR Code do seu primeiro cupom para começar a comparar.</Text>
            <Pressable style={styles.vazioBotao} onPress={() => navigation.navigate('Scan')}>
              <Ionicons name="qr-code" size={18} color={colors.white} />
              <Text style={styles.vazioBotaoTexto}>Escanear agora</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grade}>
            {itens.map((it) => (
              <Pressable
                key={it.produto_id}
                style={styles.card}
                onPress={() => navigation.navigate('Product', {
                  id: it.produto_id,
                  nome: it.produto,
                  produto: {
                    id: it.produto_id,
                    nome: it.produto,
                    categoria: it.categoria,
                    tipo: it.tipo,
                    marca: it.marca,
                    quantidade: it.quantidade,
                    imagem_url: it.imagem_url,
                    imagem_credito: it.imagem_credito,
                    menor_preco: it.valor,
                    preco_unidade: it.preco_unidade,
                    confianca_preco: it.confianca_preco,
                    estabelecimento: it.estabelecimento,
                    data: it.data,
                    valor: it.valor
                  }
                })}
              >
                <ProductImage uri={it.imagem_url} style={styles.cardImg} iconSize={26} />
                <Text style={styles.cardNome} numberOfLines={2}>{it.produto}</Text>
                <Text style={styles.cardLabel}>menor preço</Text>
                <Text style={styles.cardPreco}>{formatBRL(it.valor)}</Text>
                {!!formatPrecoUnidade(it.preco_unidade) && (
                  <Text style={styles.cardPrecoUnidade}>{formatPrecoUnidade(it.preco_unidade)}</Text>
                )}
                {!!rotuloConfiancaPreco(it.confianca_preco) && (
                  <Text style={styles.cardFresh}>{rotuloConfiancaPreco(it.confianca_preco)}</Text>
                )}
                {it.estabelecimento && <Text style={styles.cardLocal} numberOfLines={1}>{it.estabelecimento}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  header: { backgroundColor: colors.brandDark, paddingHorizontal: 16, paddingBottom: 26, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIcones: { flexDirection: 'row', gap: 16 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 12, height: 46, marginTop: 14 },
  buscaTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted },
  comunidade: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14 },
  comunidadeTexto: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  offlineBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, borderRadius: radius.md, padding: 10, marginTop: 12 },
  offlineTexto: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.brandDark },
  categoria: { alignItems: 'center', gap: 6, width: 64 },
  categoriaIcone: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  categoriaNome: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkSoft },
  secao: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginTop: 22, marginBottom: 12 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  card: { width: '47%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 10 },
  cardImg: { height: 78, borderRadius: radius.md, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  cardNome: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.ink, marginTop: 8, minHeight: 34 },
  cardLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted, marginTop: 4 },
  cardPreco: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.brand, marginTop: 2 },
  cardPrecoUnidade: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 1 },
  cardFresh: { alignSelf: 'flex-start', fontFamily: fonts.semibold, fontSize: 9.5, color: colors.inkMuted, marginTop: 3 },
  cardLocal: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  vazio: { alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 24, marginTop: 8, gap: 8 },
  vazioTitulo: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginTop: 4 },
  vazioTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 19 },
  vazioBotao: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 18, height: 46, marginTop: 8 },
  vazioBotaoTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
});
