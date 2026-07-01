import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ProductImage from '../components/ProductImage';
import { useCart } from '../context/CartContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL, formatPrecoUnidade } from '../utils/format';

export default function CartScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    itens,
    remover,
    alternar,
    alterarQuantidade,
    carregarLista,
    carregando: carregandoLista,
    erro: erroLista,
    pendentesFila,
    sincronizandoFila,
    sincronizarFila
  } = useCart();
  const [analise, setAnalise] = useState(null);
  const [carregandoAnalise, setCarregandoAnalise] = useState(false);
  const [erroAnalise, setErroAnalise] = useState(null);

  const selecionados = useMemo(() => itens.filter((i) => i.selecionado), [itens]);
  const payloadComparacao = useMemo(
    () => selecionados.map((item) => ({ produto_id: item.id, quantidade: item.quantidade || 1 })),
    [selecionados]
  );
  const totalMenores = useMemo(
    () => selecionados.reduce((s, i) => s + (Number(i.menor_preco) || 0) * (Number(i.quantidade) || 1), 0),
    [selecionados]
  );
  const melhorCesta = analise?.comparacao?.[0] || null;
  const outrasLojas = analise?.comparacao?.slice(1, 3) || [];
  const totalRodape = melhorCesta?.total_estimado ?? analise?.resumo?.total_melhores_individuais ?? totalMenores;
  const rodapeLabel = melhorCesta
    ? (melhorCesta.cobertura_completa ? 'Na loja mais barata' : 'Melhor cobertura encontrada')
    : 'Somando os menores preços';

  function metaTexto(item) {
    const partes = [];
    if (item.marca) partes.push(item.marca);
    else if (item.tipo) partes.push(item.tipo);
    if (item.quantidade_produto) partes.push(item.quantidade_produto);
    return partes.join(' · ');
  }

  const buscarAnalise = useCallback(async () => {
    if (payloadComparacao.length === 0) {
      setAnalise(null);
      setErroAnalise(null);
      setCarregandoAnalise(false);
      return;
    }

    setCarregandoAnalise(true);
    setErroAnalise(null);
    try {
      setAnalise(await api.post('/comparacao/cesta', { itens: payloadComparacao }));
    } catch (_e) {
      setAnalise(null);
      setErroAnalise('Não foi possível comparar sua lista agora.');
    } finally {
      setCarregandoAnalise(false);
    }
  }, [payloadComparacao]);

  useEffect(() => {
    const timer = setTimeout(buscarAnalise, 250);
    return () => clearTimeout(timer);
  }, [buscarAnalise]);

  function renderAnalise() {
    if (selecionados.length === 0) return null;

    return (
      <View style={styles.resumoCesta}>
        <View style={styles.resumoTopo}>
          <View style={styles.resumoIcone}>
            <Ionicons name="storefront-outline" size={19} color={colors.brandDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumoLabel}>melhor cesta</Text>
            <Text style={styles.resumoTitulo} numberOfLines={1}>
              {melhorCesta ? melhorCesta.estabelecimento : 'Comparação da lista'}
            </Text>
          </View>
          <Pressable
            style={styles.resumoAtualizar}
            onPress={buscarAnalise}
            disabled={carregandoAnalise}
            accessibilityLabel="Atualizar comparação"
          >
            {carregandoAnalise ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Ionicons name="refresh" size={18} color={colors.brand} />
            )}
          </Pressable>
        </View>

        {carregandoAnalise && !melhorCesta ? (
          <View style={styles.resumoEstado}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={styles.resumoTexto}>Buscando os últimos preços registrados.</Text>
          </View>
        ) : erroAnalise ? (
          <View style={styles.resumoEstado}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.location} />
            <Text style={styles.resumoTexto}>{erroAnalise}</Text>
          </View>
        ) : melhorCesta ? (
          <>
            <View style={styles.resumoNumeros}>
              <View>
                <Text style={styles.resumoLabel}>total estimado</Text>
                <Text style={styles.resumoValor}>{formatBRL(melhorCesta.total_estimado)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.resumoLabel}>cobertura</Text>
                <Text style={styles.resumoCobertura}>
                  {melhorCesta.produtos_cobertos}/{melhorCesta.total_produtos}
                </Text>
              </View>
            </View>

            {!melhorCesta.cobertura_completa && (
              <Text style={styles.resumoAviso}>Essa loja ainda não tem preço para todos os itens selecionados.</Text>
            )}

            {outrasLojas.length > 0 && (
              <View style={styles.ranking}>
                {outrasLojas.map((loja, indice) => (
                  <View key={String(loja.estabelecimento_id)} style={styles.rankingLinha}>
                    <Text style={styles.rankingNome} numberOfLines={1}>{indice + 2}. {loja.estabelecimento}</Text>
                    <Text style={styles.rankingPreco}>{formatBRL(loja.total_estimado)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.resumoTexto}>Ainda não há histórico de preço para comparar os itens selecionados.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.tela, { paddingTop: insets.top + 12 }]}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Sua lista</Text>
        <Text style={styles.contador}>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</Text>
      </View>
      <Text style={styles.subtitulo}>Produtos que você quer comprar, sempre no menor preço do momento.</Text>

      <FlatList
        data={itens}
        keyExtractor={(item) => item.id}
        refreshing={carregandoLista}
        onRefresh={() => carregarLista(true)}
        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 180 }}
        ListHeaderComponent={
          <>
            {erroLista ? (
              <View style={styles.alertaLista}>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.location} />
                <Text style={styles.alertaTexto}>{erroLista}</Text>
              </View>
            ) : null}
            {pendentesFila > 0 ? (
              <View style={styles.alertaFila}>
                <Ionicons name="sync-outline" size={18} color={colors.brandDark} />
                <Text style={styles.alertaTexto}>
                  {pendentesFila} {pendentesFila === 1 ? 'alteração pendente' : 'alterações pendentes'}
                </Text>
                <Pressable style={styles.sincronizarBotao} onPress={sincronizarFila} disabled={sincronizandoFila}>
                  {sincronizandoFila ? (
                    <ActivityIndicator size="small" color={colors.brand} />
                  ) : (
                    <Text style={styles.sincronizarTexto}>Sincronizar</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
            {renderAnalise()}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => alternar(item.id)} hitSlop={8} accessibilityLabel="Selecionar item">
              <Ionicons
                name={item.selecionado ? 'checkbox' : 'square-outline'}
                size={24}
                color={item.selecionado ? colors.brand : colors.inkMuted}
              />
            </Pressable>
            <ProductImage uri={item.imagem_url} style={styles.cardImg} iconSize={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardNome} numberOfLines={2}>{item.nome}</Text>
              {!!metaTexto(item) && <Text style={styles.cardMeta} numberOfLines={1}>{metaTexto(item)}</Text>}
              <Text style={styles.cardLabel}>menor preço</Text>
              <Text style={styles.cardPreco}>{formatBRL(item.menor_preco)}</Text>
              {!!formatPrecoUnidade(item.preco_unidade) && (
                <Text style={styles.cardPrecoUnidade}>{formatPrecoUnidade(item.preco_unidade)}</Text>
              )}
              <Pressable style={styles.analisar} onPress={() => navigation.navigate('Product', { id: item.id, nome: item.nome, produto: item })}>
                <Ionicons name="search" size={13} color={colors.brand} />
                <Text style={styles.analisarTexto}>Analisar produto</Text>
              </Pressable>
            </View>
            <View style={styles.acoesItem}>
              <View style={styles.stepper}>
                <Pressable
                  style={[styles.stepperBotao, Number(item.quantidade) <= 1 && styles.stepperBotaoOff]}
                  onPress={() => alterarQuantidade(item.id, Number(item.quantidade || 1) - 1)}
                  disabled={Number(item.quantidade) <= 1}
                  accessibilityLabel="Diminuir quantidade"
                >
                  <Ionicons name="remove" size={15} color={Number(item.quantidade) <= 1 ? colors.inkMuted : colors.brandDark} />
                </Pressable>
                <Text style={styles.stepperValor}>{Number(item.quantidade) || 1}x</Text>
                <Pressable
                  style={styles.stepperBotao}
                  onPress={() => alterarQuantidade(item.id, Number(item.quantidade || 1) + 1)}
                  accessibilityLabel="Aumentar quantidade"
                >
                  <Ionicons name="add" size={15} color={colors.brandDark} />
                </Pressable>
              </View>
              <Pressable onPress={() => remover(item.id)} hitSlop={8} accessibilityLabel="Remover" style={styles.removerBotao}>
                <Ionicons name="trash-outline" size={19} color={colors.location} />
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          carregandoLista ? (
            <View style={styles.vazio}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.vazioTexto}>Carregando sua lista.</Text>
            </View>
          ) : (
            <View style={styles.vazio}>
              <Ionicons name="cart-outline" size={40} color={colors.inkMuted} />
              <Text style={styles.vazioTitulo}>Sua lista está vazia</Text>
              <Text style={styles.vazioTexto}>Busque um produto e toque em “Adicionar à lista” para acompanhar o melhor preço.</Text>
              <Pressable style={styles.vazioBotao} onPress={() => navigation.navigate('Buscar')}>
                <Text style={styles.vazioBotaoTexto}>Buscar produtos</Text>
              </Pressable>
            </View>
          )
        }
      />

      {selecionados.length > 0 && (
        <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
          <View>
            <Text style={styles.rodapeLabel}>{rodapeLabel}</Text>
            <Text style={styles.rodapeTotal}>{formatBRL(totalRodape)}</Text>
          </View>
          <Pressable style={styles.rodapeBotao} onPress={() => navigation.navigate('Area')}>
            <Ionicons name="map-outline" size={18} color={colors.white} />
            <Text style={styles.rodapeBotaoTexto}>Ver no mapa</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  cabecalho: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16 },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  contador: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkMuted },
  subtitulo: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, paddingHorizontal: 16, marginTop: 4, lineHeight: 19 },
  resumoCesta: { backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, borderRadius: radius.lg, padding: 12, marginBottom: 12 },
  resumoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resumoIcone: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  resumoAtualizar: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  resumoLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkSoft },
  resumoTitulo: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brandDark, marginTop: 1 },
  resumoEstado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  resumoTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  resumoNumeros: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 },
  resumoValor: { fontFamily: fonts.monoMedium, fontSize: 24, color: colors.brandDark, marginTop: 2 },
  resumoCobertura: { fontFamily: fonts.monoMedium, fontSize: 16, color: colors.brandDark, marginTop: 3 },
  resumoAviso: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, lineHeight: 17, marginTop: 8 },
  ranking: { borderTopWidth: 1, borderTopColor: colors.brandSoftLine, marginTop: 10, paddingTop: 8, gap: 5 },
  rankingLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rankingNome: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  rankingPreco: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink },
  alertaLista: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF2EC', borderWidth: 1, borderColor: '#FFD4C4', borderRadius: radius.md, padding: 10, marginBottom: 10 },
  alertaFila: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, borderRadius: radius.md, padding: 10, marginBottom: 10 },
  alertaTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  sincronizarBotao: { minWidth: 84, height: 32, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandSoftLine, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  sincronizarTexto: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brandDark },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
  cardImg: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  cardNome: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink },
  cardMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.brandDark, marginTop: 2 },
  cardLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted, marginTop: 4 },
  cardPreco: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.brand },
  cardPrecoUnidade: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 1 },
  analisar: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  analisarTexto: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brand },
  acoesItem: { alignItems: 'flex-end', gap: 9 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, backgroundColor: colors.canvas, height: 32 },
  stepperBotao: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepperBotaoOff: { opacity: 0.45 },
  stepperValor: { minWidth: 28, textAlign: 'center', fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink },
  removerBotao: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  vazio: { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 32 },
  vazioTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 4 },
  vazioTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 19 },
  vazioBotao: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 20, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  vazioBotaoTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rodapeLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted },
  rodapeTotal: { fontFamily: fonts.monoMedium, fontSize: 22, color: colors.brandDark, marginTop: 2 },
  rodapeBotao: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 18, height: 48 },
  rodapeBotaoTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
});
