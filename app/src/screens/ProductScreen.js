import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ProductImage from '../components/ProductImage';
import { useCart } from '../context/CartContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL, formatPrecoUnidade, rotuloConfiancaPreco, tempoRelativo } from '../utils/format';

function dataCurta(data) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function PriceHistoryChart({ historico }) {
  const pontos = useMemo(() => (
    [...(historico || [])]
      .filter((item) => Number.isFinite(Number(item.valor)))
      .sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0))
      .slice(-10)
  ), [historico]);

  if (!pontos.length) {
    return <Text style={styles.vazio}>Sem histórico suficiente para montar o gráfico.</Text>;
  }

  const valores = pontos.map((p) => Number(p.valor));
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const faixa = Math.max(maior - menor, 0.01);

  return (
    <View style={styles.graficoCard}>
      <View style={styles.graficoTopo}>
        <View>
          <Text style={styles.graficoTitulo}>Histórico geral</Text>
          <Text style={styles.graficoSubtitulo}>últimos {pontos.length} registros</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.graficoPreco}>{formatBRL(menor)}</Text>
          <Text style={styles.graficoSubtitulo}>menor</Text>
        </View>
      </View>
      <View style={styles.graficoArea}>
        {pontos.map((ponto, index) => {
          const altura = 18 + ((Number(ponto.valor) - menor) / faixa) * 72;
          const melhor = Number(ponto.valor) === menor;
          return (
            <View key={`${ponto.data || index}-${ponto.valor}-${index}`} style={styles.graficoColuna}>
              <Text style={[styles.graficoValor, melhor && { color: colors.brandDark }]} numberOfLines={1}>
                {formatBRL(ponto.valor).replace('R$', '').trim()}
              </Text>
              <View style={styles.graficoBarraBox}>
                <View style={[styles.graficoBarra, melhor && styles.graficoBarraMelhor, { height: altura }]} />
              </View>
              <Text style={styles.graficoData} numberOfLines={1}>{dataCurta(ponto.data)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ProductScreen({ route, navigation }) {
  const { id, nome } = route.params;
  const { adicionar, contem } = useCart();
  const [produto, setProduto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('locais');
  const naLista = contem(id);
  const estatisticaGeral = produto?.estatisticas?.geral || {};
  const mediasPorLocal = produto?.estatisticas?.por_estabelecimento || [];
  const ultimoPrecoInfo = produto?.ultimo_preco_info || null;
  const precoUnidade = formatPrecoUnidade(produto?.preco_unidade);
  const frescorPreco = rotuloConfiancaPreco(produto?.confianca_preco || ultimoPrecoInfo?.confianca_preco);

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
            {!!precoUnidade && <Text style={styles.bannerUnidade}>equivale a {precoUnidade}</Text>}
          </View>

          <View style={styles.confiancaBox}>
            <View style={styles.confiancaIcone}>
              <Ionicons name="receipt-outline" size={18} color={colors.brandDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.confiancaTitulo}>
                Preço vindo de cupom fiscal{frescorPreco ? ` · ${frescorPreco}` : ''}
              </Text>
              <Text style={styles.confiancaTexto}>
                {ultimoPrecoInfo
                  ? `Último registro: ${formatBRL(ultimoPrecoInfo.valor)}${ultimoPrecoInfo.estabelecimento ? ` em ${ultimoPrecoInfo.estabelecimento}` : ''}${ultimoPrecoInfo.data ? ` · ${tempoRelativo(ultimoPrecoInfo.data)}` : ''}.`
                  : 'Ainda sem último registro detalhado para este produto.'}
              </Text>
            </View>
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
            onPress={() => adicionar({
              id,
              nome: produto.nome,
              menor_preco: produto.menor_preco,
              preco_unidade: produto.preco_unidade,
              imagem_url: produto.imagem_url
            })}
            disabled={naLista}
          >
            <Ionicons name={naLista ? 'checkmark' : 'cart-outline'} size={18} color={naLista ? colors.brand : colors.white} />
            <Text style={[styles.botaoListaTexto, naLista && { color: colors.brand }]}>
              {naLista ? 'Na sua lista' : 'Adicionar à lista'}
            </Text>
          </Pressable>

          <View style={styles.abas}>
            <Pressable style={[styles.aba, aba === 'locais' && styles.abaAtiva]} onPress={() => setAba('locais')}>
              <Ionicons name="storefront-outline" size={15} color={aba === 'locais' ? colors.white : colors.inkSoft} />
              <Text style={[styles.abaTexto, aba === 'locais' && styles.abaTextoAtivo]}>Locais</Text>
            </Pressable>
            <Pressable style={[styles.aba, aba === 'historico' && styles.abaAtiva]} onPress={() => setAba('historico')}>
              <Ionicons name="stats-chart-outline" size={15} color={aba === 'historico' ? colors.white : colors.inkSoft} />
              <Text style={[styles.abaTexto, aba === 'historico' && styles.abaTextoAtivo]}>Histórico</Text>
            </Pressable>
          </View>

          {aba === 'locais' ? (
            <>
              <Text style={styles.secao}>Preços e lugares</Text>
              {mediasPorLocal.length > 0 ? (
                <View style={styles.mediasLista}>
                  {mediasPorLocal.slice(0, 8).map((local) => (
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
              ) : (
                <Text style={styles.vazio}>Sem médias por estabelecimento ainda.</Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.secao}>Histórico de preços</Text>
              <PriceHistoryChart historico={produto.historico} />
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
            </>
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
  bannerLabel: { fontFamily: fonts.body, fontSize: 11, color: '#9FD9BC' },
  bannerValor: { fontFamily: fonts.monoMedium, fontSize: 28, color: colors.white, marginTop: 2 },
  bannerUnidade: { fontFamily: fonts.medium, fontSize: 12, color: '#BFE8D2', marginTop: 2 },
  confiancaBox: { flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginTop: 12 },
  confiancaIcone: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  confiancaTitulo: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  confiancaTexto: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, marginTop: 2 },
  statsBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginTop: 12 },
  statPrincipal: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 10, marginBottom: 10 },
  statLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted },
  statValor: { fontFamily: fonts.monoMedium, fontSize: 22, color: colors.brandDark, marginTop: 2 },
  statDupla: { flexDirection: 'row', gap: 10 },
  statMini: { flex: 1 },
  statMiniValor: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.ink, marginTop: 2 },
  botaoLista: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, height: 50, marginTop: 14 },
  botaoListaOn: { backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine },
  botaoListaTexto: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  abas: { flexDirection: 'row', gap: 8, marginTop: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 4 },
  aba: { flex: 1, height: 38, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  abaAtiva: { backgroundColor: colors.brandDark },
  abaTexto: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.inkSoft },
  abaTextoAtivo: { color: colors.white },
  secao: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 22, marginBottom: 10 },
  graficoCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 12 },
  graficoTopo: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  graficoTitulo: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  graficoSubtitulo: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkMuted, marginTop: 2 },
  graficoPreco: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.brandDark },
  graficoArea: { height: 142, flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 12 },
  graficoColuna: { flex: 1, minWidth: 24, alignItems: 'center' },
  graficoValor: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.inkSoft, marginBottom: 4 },
  graficoBarraBox: { height: 90, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  graficoBarra: { width: '62%', minWidth: 8, borderRadius: radius.pill, backgroundColor: '#C9D8D0' },
  graficoBarraMelhor: { backgroundColor: colors.brand },
  graficoData: { fontFamily: fonts.body, fontSize: 9, color: colors.inkMuted, marginTop: 5 },
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
