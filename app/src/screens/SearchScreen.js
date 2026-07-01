import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ProductImage from '../components/ProductImage';
import { colors, fonts, radius } from '../theme';
import { formatBRL, formatPrecoUnidade, rotuloConfiancaPreco } from '../utils/format';
import { carregarBuscasRecentes, limparBuscasRecentes, salvarBuscaRecente } from '../utils/recentSearches';

const CATEGORIAS_PADRAO = ['Alimentos', 'Bebidas', 'Limpeza', 'Higiene', 'Açougue', 'Hortifruti'];

function montarQuery({ termo, categoria, tipo, marca, quantidade }) {
  const params = [];
  if (termo?.trim()) params.push(`nome=${encodeURIComponent(termo.trim())}`);
  if (categoria) params.push(`categoria=${encodeURIComponent(categoria)}`);
  if (tipo) params.push(`tipo=${encodeURIComponent(tipo)}`);
  if (marca) params.push(`marca=${encodeURIComponent(marca)}`);
  if (quantidade) params.push(`quantidade=${encodeURIComponent(quantidade)}`);
  return params.length ? `?${params.join('&')}` : '';
}

function ordenarUnicos(lista) {
  return [...new Set(lista.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

function metaTexto(item) {
  const partes = [];
  if (item.marca) partes.push(item.marca);
  else if (item.tipo) partes.push(item.tipo);
  if (item.quantidade) partes.push(item.quantidade);
  return partes.join(' · ');
}

function Chip({ label, ativo, onPress }) {
  return (
    <Pressable style={[styles.chip, ativo && styles.chipAtivo]} onPress={onPress}>
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function FilterRow({ titulo, itens, ativo, onSelect }) {
  if (!itens.length) return null;
  return (
    <View style={styles.filtroLinha}>
      <Text style={styles.filtroTitulo}>{titulo}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {itens.map((item) => (
          <Chip key={`${titulo}-${item}`} label={item} ativo={ativo === item} onPress={() => onSelect(item)} />
        ))}
      </ScrollView>
    </View>
  );
}

function LoadingCards({ pulse }) {
  return (
    <View style={styles.loadingLista}>
      {[0, 1, 2].map((item) => (
        <Animated.View key={item} style={[styles.loadingCard, { opacity: pulse }]}>
          <View style={styles.loadingImg} />
          <View style={styles.loadingTextoBox}>
            <View style={styles.loadingLinhaGrande} />
            <View style={styles.loadingLinhaPequena} />
          </View>
          <View style={styles.loadingPreco} />
        </Animated.View>
      ))}
    </View>
  );
}

export default function SearchScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState(route.params?.categoria || null);
  const [tipo, setTipo] = useState(null);
  const [marca, setMarca] = useState(null);
  const [quantidade, setQuantidade] = useState(null);
  const [filtros, setFiltros] = useState({ categorias: [], tipos: [], marcas: [], quantidades: [] });
  const [resultados, setResultados] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [buscasRecentes, setBuscasRecentes] = useState([]);
  const [offlineCache, setOfflineCache] = useState(false);
  const debounce = useRef(null);
  const requisicaoBusca = useRef(0);
  const requisicaoFiltros = useRef(0);
  const pulseValue = useRef(new Animated.Value(0)).current;

  const pulse = pulseValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 1],
  });

  const categoriasDisponiveis = useMemo(
    () => ordenarUnicos([...CATEGORIAS_PADRAO, ...filtros.categorias]),
    [filtros.categorias]
  );

  useEffect(() => {
    const animacao = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(pulseValue, { toValue: 0, duration: 520, useNativeDriver: true }),
      ])
    );
    animacao.start();
    return () => animacao.stop();
  }, [pulseValue]);

  useEffect(() => {
    carregarBuscasRecentes().then(setBuscasRecentes);
  }, []);

  useEffect(() => {
    if (route.params?.categoria) {
      setCategoria(route.params.categoria);
      setTipo(null);
      setMarca(null);
      setQuantidade(null);
      setBuscou(true);
    }
  }, [route.params?.categoria]);

  const carregarFiltros = useCallback(async () => {
    const seq = ++requisicaoFiltros.current;
    try {
      const query = montarQuery({ categoria, tipo, marca, quantidade });
      const resposta = await api.get(`/produtos/filtros${query}`, { timeoutMs: 20000, cacheMs: 120000 });
      if (seq === requisicaoFiltros.current) {
        setFiltros({
          categorias: resposta.categorias || [],
          tipos: resposta.tipos || [],
          marcas: resposta.marcas || [],
          quantidades: resposta.quantidades || [],
        });
      }
    } catch (_e) {
      if (seq === requisicaoFiltros.current) {
        setFiltros({ categorias: [], tipos: [], marcas: [], quantidades: [] });
      }
    }
  }, [categoria, tipo, marca, quantidade]);

  const buscar = useCallback(async () => {
    const termoLimpo = termo.trim();
    const temFiltro = Boolean(termoLimpo || categoria || tipo || marca || quantidade);
    const seq = ++requisicaoBusca.current;

    if (!temFiltro) {
      setResultados([]);
      setSugestoes([]);
      setBuscou(false);
      setCarregando(false);
      setOfflineCache(false);
      return;
    }

    setCarregando(true);
    try {
      const query = montarQuery({ termo: termoLimpo, categoria, tipo, marca, quantidade });
      const resposta = await api.get(`/produtos${query}`, { timeoutMs: 20000, cacheMs: 30000 });
      if (seq !== requisicaoBusca.current) return;

      const lista = resposta.produtos || [];
      setResultados(lista);
      setSugestoes(termoLimpo.length >= 2 ? lista.slice(0, 8) : []);
      setOfflineCache(Boolean(resposta._meta?.offline));
      if (termoLimpo.length >= 2 && lista.length > 0) {
        salvarBuscaRecente(termoLimpo).then(setBuscasRecentes);
      }
    } catch (_e) {
      if (seq === requisicaoBusca.current) {
        setResultados([]);
        setSugestoes([]);
        setOfflineCache(false);
      }
    } finally {
      if (seq === requisicaoBusca.current) {
        setCarregando(false);
        setBuscou(true);
      }
    }
  }, [termo, categoria, tipo, marca, quantidade]);

  useEffect(() => {
    carregarFiltros();
  }, [carregarFiltros]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(buscar, 230);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [buscar]);

  function selecionarCategoria(valor) {
    setCategoria((atual) => (atual === valor ? null : valor));
    setTipo(null);
    setMarca(null);
    setQuantidade(null);
  }

  function selecionarTipo(valor) {
    setTipo((atual) => (atual === valor ? null : valor));
    setMarca(null);
    setQuantidade(null);
  }

  function selecionarMarca(valor) {
    setMarca((atual) => (atual === valor ? null : valor));
    setQuantidade(null);
  }

  function selecionarQuantidade(valor) {
    setQuantidade((atual) => (atual === valor ? null : valor));
  }

  function limparTudo() {
    setTermo('');
    setCategoria(null);
    setTipo(null);
    setMarca(null);
    setQuantidade(null);
  }

  function limparFiltros() {
    setCategoria(null);
    setTipo(null);
    setMarca(null);
    setQuantidade(null);
  }

  async function apagarRecentes() {
    setBuscasRecentes(await limparBuscasRecentes());
  }

  const temFiltro = Boolean(termo || categoria || tipo || marca || quantidade);
  const temSugestoes = termo.trim().length >= 2 && sugestoes.length > 0;
  const mostrarRecentes = !temFiltro && buscasRecentes.length > 0;
  const filtrosSelecionados = [categoria, tipo, marca, quantidade].filter(Boolean);
  const resumoFiltros = filtrosSelecionados.length > 0
    ? filtrosSelecionados.join(' · ')
    : 'Categoria, tipo, marca e tamanho';

  return (
    <View style={[styles.tela, { paddingTop: insets.top + 12 }]}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>Buscar preços</Text>
        {temFiltro && (
          <Pressable style={styles.limpar} onPress={limparTudo}>
            <Ionicons name="close" size={16} color={colors.inkSoft} />
          </Pressable>
        )}
      </View>

      <View style={styles.campo}>
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          style={styles.input}
          placeholder="Ex.: detergente ype, coca 2L..."
          placeholderTextColor={colors.inkMuted}
          value={termo}
          onChangeText={setTermo}
          autoFocus
          returnKeyType="search"
        />
        {carregando && <ActivityIndicator size="small" color={colors.brand} />}
        {termo.length > 0 && (
          <Pressable onPress={() => setTermo('')}>
            <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.filtrosBox}>
        <Pressable style={styles.filtrosToggle} onPress={() => setFiltrosAbertos((atual) => !atual)}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.filtrosLabel}>Filtros</Text>
            <Text style={styles.filtrosResumo} numberOfLines={1}>{resumoFiltros}</Text>
          </View>
          {filtrosSelecionados.length > 0 && (
            <View style={styles.filtrosBadge}>
              <Text style={styles.filtrosBadgeTexto}>{filtrosSelecionados.length}</Text>
            </View>
          )}
          <Ionicons name={filtrosAbertos ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
        </Pressable>
        {filtrosAbertos && (
          <View style={styles.filtrosConteudo}>
            <FilterRow titulo="Categoria" itens={categoriasDisponiveis} ativo={categoria} onSelect={selecionarCategoria} />
            <FilterRow titulo="Tipo" itens={filtros.tipos} ativo={tipo} onSelect={selecionarTipo} />
            <FilterRow titulo="Marca" itens={filtros.marcas} ativo={marca} onSelect={selecionarMarca} />
            <FilterRow titulo="Tamanho" itens={filtros.quantidades} ativo={quantidade} onSelect={selecionarQuantidade} />
          </View>
        )}
      </View>

      {mostrarRecentes && (
        <View style={styles.recentesBox}>
          <View style={styles.recentesTopo}>
            <Text style={styles.recentesTitulo}>Buscas recentes</Text>
            <Pressable onPress={apagarRecentes} hitSlop={8}>
              <Text style={styles.recentesLimpar}>Limpar</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentesLista}>
            {buscasRecentes.map((item) => (
              <Pressable key={item} style={styles.recenteChip} onPress={() => setTermo(item)}>
                <Ionicons name="time-outline" size={14} color={colors.brandDark} />
                <Text style={styles.recenteTexto} numberOfLines={1}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {temSugestoes && (
        <View style={styles.sugestoesBox}>
          <Text style={styles.sugestoesTitulo}>Sugestões</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugestoes}>
            {sugestoes.map((item) => (
              <Pressable
                key={`sug-${item.id}`}
                style={styles.sugestao}
                onPress={() => navigation.navigate('Product', { id: item.id, nome: item.nome })}
              >
                <ProductImage uri={item.imagem_url} style={styles.sugestaoImg} iconSize={14} />
                <View style={{ minWidth: 0 }}>
                  <Text style={styles.sugestaoTexto} numberOfLines={1}>{item.nome}</Text>
                  {!!metaTexto(item) && <Text style={styles.sugestaoMeta} numberOfLines={1}>{metaTexto(item)}</Text>}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {offlineCache && (
        <View style={styles.offlineBox}>
          <Ionicons name="cloud-offline-outline" size={17} color={colors.brandDark} />
          <Text style={styles.offlineTexto}>Resultados dos últimos preços salvos.</Text>
        </View>
      )}

      {carregando ? (
        <LoadingCards pulse={pulse} />
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={resultados.length > 0 ? (
            <View style={styles.resultadosTopo}>
              <Text style={styles.resultadosTexto}>{resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}</Text>
              {filtrosSelecionados.length > 0 && (
                <Pressable onPress={limparFiltros} hitSlop={8}>
                  <Text style={styles.resultadosAcao}>limpar filtros</Text>
                </Pressable>
              )}
            </View>
          ) : null}
          renderItem={({ item }) => {
            const precoUnidade = formatPrecoUnidade(item.preco_unidade);
            const idadePreco = rotuloConfiancaPreco(item.confianca_preco || item.ultimo_preco?.confianca_preco);
            return (
              <Pressable style={styles.linha} onPress={() => navigation.navigate('Product', { id: item.id, nome: item.nome })}>
                <ProductImage uri={item.imagem_url} style={styles.linhaImg} iconSize={20} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.linhaNome} numberOfLines={2}>{item.nome}</Text>
                  {!!metaTexto(item) && <Text style={styles.linhaMeta} numberOfLines={1}>{metaTexto(item)}</Text>}
                  {item.ultimo_preco?.estabelecimento && (
                    <Text style={styles.linhaLocal} numberOfLines={1}>{item.ultimo_preco.estabelecimento}</Text>
                  )}
                </View>
                <View style={styles.linhaPrecoBox}>
                  <Text style={styles.linhaLabel}>menor</Text>
                  <Text style={styles.linhaPreco}>{formatBRL(item.menor_preco)}</Text>
                  {!!precoUnidade && <Text style={styles.linhaPrecoUnidade} numberOfLines={1}>{precoUnidade}</Text>}
                  {!!idadePreco && <Text style={styles.linhaFresh} numberOfLines={1}>{idadePreco}</Text>}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            buscou ? (
              <View style={styles.vazioBox}>
                <Text style={styles.vazio}>{filtrosSelecionados.length > 0 ? 'Nenhum produto com esses filtros.' : 'Nenhum produto encontrado.'}</Text>
                {filtrosSelecionados.length > 0 && (
                  <Pressable style={styles.vazioBotao} onPress={limparFiltros}>
                    <Text style={styles.vazioBotaoTexto}>Limpar filtros</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={styles.vazio}>Digite um produto ou escolha um filtro.</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  limpar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, height: 48, marginHorizontal: 16, marginTop: 12 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  filtrosBox: { paddingTop: 10, paddingHorizontal: 16 },
  filtrosToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  filtrosLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  filtrosResumo: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  filtrosBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, alignItems: 'center', justifyContent: 'center' },
  filtrosBadgeTexto: { fontFamily: fonts.semibold, fontSize: 11, color: colors.brandDark },
  filtrosConteudo: { paddingTop: 10, marginHorizontal: -16 },
  filtroLinha: { marginBottom: 8 },
  filtroTitulo: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkMuted, paddingHorizontal: 16, marginBottom: 6 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: { height: 34, maxWidth: 150, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipAtivo: { backgroundColor: colors.brandDark, borderColor: colors.brandDark },
  chipTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkSoft },
  chipTextoAtivo: { color: colors.white },
  sugestoesBox: { marginTop: 2 },
  recentesBox: { paddingTop: 10 },
  recentesTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  recentesTitulo: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  recentesLimpar: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.brand },
  recentesLista: { paddingHorizontal: 16, gap: 8 },
  recenteChip: { maxWidth: 180, height: 34, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, paddingHorizontal: 12 },
  recenteTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.brandDark },
  offlineBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 16, marginTop: 8 },
  offlineTexto: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.brandDark },
  sugestoesTitulo: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, paddingHorizontal: 16, marginBottom: 8 },
  sugestoes: { paddingHorizontal: 16, gap: 8 },
  sugestao: { width: 230, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, paddingHorizontal: 10, paddingVertical: 8 },
  sugestaoImg: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sugestaoTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.brandDark },
  sugestaoMeta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 1 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
  linhaImg: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  linhaNome: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  linhaMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.brandDark, marginTop: 2 },
  linhaLocal: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  linhaPrecoBox: { alignItems: 'flex-end', minWidth: 76 },
  linhaLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted },
  linhaPreco: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.brand },
  linhaPrecoUnidade: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 1 },
  linhaFresh: { fontFamily: fonts.semibold, fontSize: 9.5, color: colors.inkMuted, marginTop: 2 },
  resultadosTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  resultadosTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  resultadosAcao: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.brand },
  vazioBox: { alignItems: 'center', marginTop: 30 },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  vazioBotao: { marginTop: 12, borderRadius: radius.md, backgroundColor: colors.brand, height: 42, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  vazioBotaoTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  loadingLista: { paddingHorizontal: 16, paddingTop: 8 },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
  loadingImg: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: '#E8EBE4' },
  loadingTextoBox: { flex: 1, gap: 8 },
  loadingLinhaGrande: { height: 14, width: '78%', borderRadius: radius.pill, backgroundColor: '#E8EBE4' },
  loadingLinhaPequena: { height: 10, width: '54%', borderRadius: radius.pill, backgroundColor: '#E8EBE4' },
  loadingPreco: { width: 62, height: 22, borderRadius: radius.pill, backgroundColor: '#E8EBE4' },
});
