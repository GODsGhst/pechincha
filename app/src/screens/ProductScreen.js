import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
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

function produtoInicial(params = {}) {
  const resumo = params.produto || null;
  if (!resumo && !params.nome) return null;

  const valor = resumo?.menor_preco ?? resumo?.valor ?? null;
  const ultimo = resumo?.ultimo_preco || (resumo?.estabelecimento || resumo?.data
    ? {
        valor,
        data: resumo?.data || null,
        estabelecimento: resumo?.estabelecimento || null,
        preco_unidade: resumo?.preco_unidade || null,
        confianca_preco: resumo?.confianca_preco || null
      }
    : null);

  return {
    id: params.id || resumo?.id || resumo?.produto_id,
    nome: resumo?.nome || resumo?.produto || params.nome || 'Produto',
    categoria: resumo?.categoria || null,
    tipo: resumo?.tipo || null,
    marca: resumo?.marca || null,
    quantidade: resumo?.quantidade || resumo?.quantidade_produto || null,
    imagem_url: resumo?.imagem_url || null,
    imagem_credito: resumo?.imagem_credito || null,
    menor_preco: valor,
    preco_unidade: resumo?.preco_unidade || null,
    confianca_preco: resumo?.confianca_preco || null,
    ultimo_preco_info: ultimo,
    estatisticas: null,
    historico: []
  };
}

function PriceHistoryChart({ historico }) {
  const [largura, setLargura] = useState(0);
  const pontos = useMemo(() => (
    [...(historico || [])]
      .filter((item) => Number.isFinite(Number(item.valor)))
      .sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0))
      .slice(-12)
  ), [historico]);

  if (!pontos.length) {
    return <Text style={styles.vazio}>Sem histórico suficiente para montar o gráfico.</Text>;
  }

  const valores = pontos.map((p) => Number(p.valor));
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const faixa = Math.max(maior - menor, 0.01);
  const altura = 112;
  const padding = 14;
  const larguraUtil = Math.max(largura - padding * 2, 1);
  const alturaUtil = altura - padding * 2;
  const coords = largura > 0
    ? pontos.map((ponto, index) => ({
        x: padding + (pontos.length === 1 ? larguraUtil / 2 : (index / (pontos.length - 1)) * larguraUtil),
        y: padding + (1 - ((Number(ponto.valor) - menor) / faixa)) * alturaUtil,
        ponto
      }))
    : [];
  const segmentos = coords.slice(1).map((coord, index) => {
    const anterior = coords[index];
    const dx = coord.x - anterior.x;
    const dy = coord.y - anterior.y;
    return {
      key: `${coord.ponto.data || index}-${coord.ponto.valor}`,
      left: anterior.x,
      top: anterior.y,
      width: Math.sqrt(dx * dx + dy * dy),
      angle: Math.atan2(dy, dx)
    };
  });

  return (
    <View style={styles.graficoCard}>
      <View style={styles.graficoTopo}>
        <View>
          <Text style={styles.graficoTitulo}>Evolução do preço</Text>
          <Text style={styles.graficoSubtitulo}>últimos {pontos.length} registros</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.graficoPreco}>{formatBRL(maior)}</Text>
          <Text style={styles.graficoSubtitulo}>maior</Text>
        </View>
      </View>
      <View style={styles.graficoLinhaArea} onLayout={(e) => setLargura(e.nativeEvent.layout.width)}>
        <View style={[styles.graficoGrade, { top: padding }]} />
        <View style={[styles.graficoGrade, { top: altura / 2 }]} />
        <View style={[styles.graficoGrade, { bottom: padding }]} />
        {segmentos.map((segmento) => (
          <View
            key={segmento.key}
            style={[
              styles.graficoSegmento,
              {
                left: segmento.left,
                top: segmento.top,
                width: segmento.width,
                transform: [{ rotateZ: `${segmento.angle}rad` }]
              }
            ]}
          />
        ))}
        {coords.map(({ x, y, ponto }, index) => {
          const melhor = Number(ponto.valor) === menor;
          return (
            <View key={`${ponto.data || index}-${ponto.valor}-${index}`}>
              <View style={[styles.graficoPonto, melhor && styles.graficoPontoMelhor, { left: x - 5, top: y - 5 }]} />
              {(index === 0 || index === coords.length - 1 || melhor) && (
                <Text style={[styles.graficoValorLinha, { left: Math.max(2, Math.min(x - 28, largura - 56)), top: Math.max(0, y - 26) }]}>
                  {formatBRL(ponto.valor).replace('R$', '').trim()}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.graficoLegenda}>
        <Text style={styles.graficoData}>{dataCurta(pontos[0].data)}</Text>
        <Text style={styles.graficoData}>{formatBRL(menor)} menor</Text>
        <Text style={styles.graficoData}>{dataCurta(pontos[pontos.length - 1].data)}</Text>
      </View>
    </View>
  );
}

export default function ProductScreen({ route, navigation }) {
  const { id, nome } = route.params;
  const { adicionar, contem } = useCart();
  const inicial = useMemo(() => produtoInicial(route.params), [route.params]);
  const [produto, setProduto] = useState(inicial);
  const [carregando, setCarregando] = useState(!inicial);
  const [atualizando, setAtualizando] = useState(false);
  const [aba, setAba] = useState('locais');
  const [offlineCache, setOfflineCache] = useState(false);
  const historico = produto?.historico || [];
  const naLista = contem(id);
  const estatisticaGeral = produto?.estatisticas?.geral || {};
  const mediasPorLocal = produto?.estatisticas?.por_estabelecimento || [];
  const ultimoPrecoInfo = produto?.ultimo_preco_info || null;
  const precoUnidade = formatPrecoUnidade(produto?.preco_unidade);
  const frescorPreco = rotuloConfiancaPreco(produto?.confianca_preco || ultimoPrecoInfo?.confianca_preco);

  async function carregarProduto(manual = false) {
    if (manual) setAtualizando(true);
    else if (!produto) setCarregando(true);
    try {
      const resposta = await api.get(`/produtos/${id}`, {
        cacheMs: 5 * 60 * 1000,
        forceRefresh: manual,
        preferStale: !manual,
        maxStaleMs: 24 * 60 * 60 * 1000
      });
      setProduto(resposta);
      setOfflineCache(Boolean(resposta._meta?.offline));
      if (!manual && resposta._meta?.stale) {
        api.get(`/produtos/${id}`, { cacheMs: 5 * 60 * 1000, forceRefresh: true })
          .then((atualizado) => {
            setProduto(atualizado);
            setOfflineCache(Boolean(atualizado._meta?.offline));
          })
          .catch(() => {});
      }
    } catch (_e) {
      if (!produto) setProduto(null);
      setOfflineCache(false);
    } finally {
      setCarregando(false);
      if (manual) setAtualizando(false);
    }
  }

  useEffect(() => {
    carregarProduto();
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
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => carregarProduto(true)} tintColor={colors.brand} />}
        >
          {offlineCache && (
            <View style={styles.offlineBox}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.brandDark} />
              <Text style={styles.offlineTexto}>Detalhe carregado dos últimos preços salvos.</Text>
            </View>
          )}
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
              <PriceHistoryChart historico={historico} />
              {historico.length === 0 ? (
                <Text style={styles.vazio}>Sem registros ainda.</Text>
              ) : (
                <View style={styles.tabelaHistorico}>
                  <View style={styles.tabelaHeader}>
                    <Text style={[styles.tabelaHeaderTexto, { flex: 0.8 }]}>Preço</Text>
                    <Text style={[styles.tabelaHeaderTexto, { flex: 1.4 }]}>Local</Text>
                    <Text style={[styles.tabelaHeaderTexto, { flex: 0.8, textAlign: 'right' }]}>Quando</Text>
                  </View>
                  {historico.map((h, i) => {
                    const melhor = h.valor === produto.menor_preco;
                    return (
                      <View key={`${h.data || i}-${h.valor}-${h.estabelecimento || 'local'}`} style={[styles.tabelaRow, melhor && styles.tabelaRowMelhor]}>
                        <Text style={[styles.tabelaValor, melhor && { color: colors.brandDark }]}>{formatBRL(h.valor)}</Text>
                        <Text style={styles.tabelaLocal} numberOfLines={1}>{h.estabelecimento || 'Local não identificado'}</Text>
                        <Text style={styles.tabelaData} numberOfLines={1}>{tempoRelativo(h.data)}</Text>
                      </View>
                    );
                  })}
                </View>
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
  offlineBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, borderRadius: radius.md, padding: 10, marginBottom: 12 },
  offlineTexto: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.brandDark },
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
  graficoLinhaArea: { height: 112, marginTop: 12, borderRadius: radius.md, backgroundColor: '#F6F8F4', overflow: 'hidden' },
  graficoGrade: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#E3E9E0' },
  graficoSegmento: { position: 'absolute', height: 2, borderRadius: 1, backgroundColor: colors.brand },
  graficoPonto: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brand },
  graficoPontoMelhor: { backgroundColor: colors.brand, borderColor: colors.brandDark },
  graficoValorLinha: { position: 'absolute', width: 56, textAlign: 'center', fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.brandDark },
  graficoLegenda: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  graficoData: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted },
  mediasLista: { gap: 8, marginBottom: 10 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 11 },
  mediaLocal: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  mediaMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  mediaUltimo: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.brandDark },
  tabelaHistorico: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
  tabelaHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F6F8F4', paddingHorizontal: 12, height: 34 },
  tabelaHeaderTexto: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.inkMuted },
  tabelaRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.line },
  tabelaRowMelhor: { backgroundColor: colors.brandSoft },
  tabelaValor: { flex: 0.8, fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink },
  tabelaLocal: { flex: 1.4, fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  tabelaData: { flex: 0.8, fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted, textAlign: 'right' },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 24 },
});
