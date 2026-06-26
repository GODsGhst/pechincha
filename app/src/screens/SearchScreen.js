import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ProductImage from '../components/ProductImage';
import { colors, fonts, radius } from '../theme';
import { formatBRL } from '../utils/format';

function montarQuery({ termo, categoria, tipo, marca, quantidade }) {
  const params = [];
  if (termo?.trim()) params.push(`nome=${encodeURIComponent(termo.trim())}`);
  if (categoria) params.push(`categoria=${encodeURIComponent(categoria)}`);
  if (tipo) params.push(`tipo=${encodeURIComponent(tipo)}`);
  if (marca) params.push(`marca=${encodeURIComponent(marca)}`);
  if (quantidade) params.push(`quantidade=${encodeURIComponent(quantidade)}`);
  return params.length ? `?${params.join('&')}` : '';
}

function metaTexto(item) {
  return [item.categoria, item.tipo, item.marca, item.quantidade].filter(Boolean).join(' · ');
}

function Chip({ label, ativo, onPress }) {
  return (
    <Pressable style={[styles.chip, ativo && styles.chipAtivo]} onPress={onPress}>
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{label}</Text>
    </Pressable>
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
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const debounce = useRef(null);
  const debounceSugestoes = useRef(null);

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
    try {
      const query = montarQuery({ categoria, tipo, marca });
      setFiltros(await api.get(`/produtos/filtros${query}`));
    } catch (_e) {
      setFiltros({ categorias: [], tipos: [], marcas: [], quantidades: [] });
    }
  }, [categoria, tipo, marca]);

  const buscar = useCallback(async () => {
    if (!termo.trim() && !categoria && !tipo && !marca && !quantidade) {
      setResultados([]);
      setBuscou(false);
      return;
    }

    setCarregando(true);
    try {
      const query = montarQuery({ termo, categoria, tipo, marca, quantidade });
      const { produtos } = await api.get(`/produtos${query}`);
      setResultados(produtos || []);
    } catch (_e) {
      setResultados([]);
    } finally {
      setCarregando(false);
      setBuscou(true);
    }
  }, [termo, categoria, tipo, marca, quantidade]);

  const carregarSugestoes = useCallback(async () => {
    const termoLimpo = termo.trim();
    if (termoLimpo.length < 2) {
      setSugestoes([]);
      setCarregandoSugestoes(false);
      return;
    }

    setCarregandoSugestoes(true);
    try {
      const query = montarQuery({ termo: termoLimpo, categoria, tipo, marca, quantidade }).replace('nome=', 'termo=');
      const { sugestoes: itens } = await api.get(`/produtos/sugestoes${query}`);
      setSugestoes(itens || []);
    } catch (_e) {
      setSugestoes([]);
    } finally {
      setCarregandoSugestoes(false);
    }
  }, [termo, categoria, tipo, marca, quantidade]);

  useEffect(() => {
    carregarFiltros();
  }, [carregarFiltros]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(buscar, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [buscar]);

  useEffect(() => {
    if (debounceSugestoes.current) clearTimeout(debounceSugestoes.current);
    debounceSugestoes.current = setTimeout(carregarSugestoes, 160);
    return () => {
      if (debounceSugestoes.current) clearTimeout(debounceSugestoes.current);
    };
  }, [carregarSugestoes]);

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

  const temFiltro = Boolean(termo || categoria || tipo || marca || quantidade);
  const temSugestoes = termo.trim().length >= 2 && (sugestoes.length > 0 || carregandoSugestoes);

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
          placeholder="Ex.: detergente ype, coca 2L…"
          placeholderTextColor={colors.inkMuted}
          value={termo}
          onChangeText={setTermo}
          autoFocus
          returnKeyType="search"
        />
        {termo.length > 0 && (
          <Pressable onPress={() => setTermo('')}><Ionicons name="close-circle" size={18} color={colors.inkMuted} /></Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {filtros.categorias.map((item) => (
          <Chip key={`cat-${item}`} label={item} ativo={categoria === item} onPress={() => selecionarCategoria(item)} />
        ))}
      </ScrollView>

      {(categoria || filtros.tipos.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsSecundarios}>
          {filtros.tipos.map((item) => (
            <Chip key={`tipo-${item}`} label={item} ativo={tipo === item} onPress={() => selecionarTipo(item)} />
          ))}
        </ScrollView>
      )}

      {(categoria || tipo || filtros.marcas.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsSecundarios}>
          {filtros.marcas.map((item) => (
            <Chip key={`marca-${item}`} label={item} ativo={marca === item} onPress={() => selecionarMarca(item)} />
          ))}
        </ScrollView>
      )}

      {(categoria || tipo || marca || filtros.quantidades.length > 0) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsSecundarios}>
          {filtros.quantidades.map((item) => (
            <Chip key={`qtd-${item}`} label={item} ativo={quantidade === item} onPress={() => selecionarQuantidade(item)} />
          ))}
        </ScrollView>
      )}

      {temSugestoes && (
        <View style={styles.sugestoesBox}>
          <View style={styles.sugestoesTopo}>
            <Text style={styles.sugestoesTitulo}>Sugestões</Text>
            {carregandoSugestoes && <ActivityIndicator size="small" color={colors.brand} />}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugestoes}>
            {sugestoes.map((item) => (
              <Pressable
                key={`sug-${item.id}`}
                style={styles.sugestao}
                onPress={() => {
                  setTermo(item.nome);
                  navigation.navigate('Product', { id: item.id, nome: item.nome });
                }}
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

      {carregando ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.linha} onPress={() => navigation.navigate('Product', { id: item.id, nome: item.nome })}>
              <ProductImage uri={item.imagem_url} style={styles.linhaImg} iconSize={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linhaNome} numberOfLines={2}>{item.nome}</Text>
                {!!metaTexto(item) && <Text style={styles.linhaMeta} numberOfLines={1}>{metaTexto(item)}</Text>}
                {item.ultimo_preco?.estabelecimento && (
                  <Text style={styles.linhaLocal} numberOfLines={1}>{item.ultimo_preco.estabelecimento}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.linhaLabel}>menor</Text>
                <Text style={styles.linhaPreco}>{formatBRL(item.menor_preco)}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            buscou ? (
              <Text style={styles.vazio}>Nenhum produto encontrado.</Text>
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
  chips: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  chipsSecundarios: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  chip: { height: 34, maxWidth: 150, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipAtivo: { backgroundColor: colors.brandDark, borderColor: colors.brandDark },
  chipTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkSoft },
  chipTextoAtivo: { color: colors.white },
  sugestoesBox: { marginTop: 10 },
  sugestoesTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  sugestoesTitulo: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
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
  linhaLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted },
  linhaPreco: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.brand },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
});
