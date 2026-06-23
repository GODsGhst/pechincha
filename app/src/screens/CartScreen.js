import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL } from '../utils/format';

export default function CartScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { itens, remover, alternar } = useCart();

  const selecionados = itens.filter((i) => i.selecionado);
  const total = selecionados.reduce((s, i) => s + (Number(i.menor_preco) || 0), 0);

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
        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 180 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => alternar(item.id)} hitSlop={8} accessibilityLabel="Selecionar item">
              <Ionicons
                name={item.selecionado ? 'checkbox' : 'square-outline'}
                size={24}
                color={item.selecionado ? colors.brand : colors.inkMuted}
              />
            </Pressable>
            <View style={styles.cardImg}><Ionicons name="pricetag-outline" size={20} color={colors.inkMuted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardNome} numberOfLines={2}>{item.nome}</Text>
              <Text style={styles.cardLabel}>menor preço</Text>
              <Text style={styles.cardPreco}>{formatBRL(item.menor_preco)}</Text>
              <Pressable style={styles.analisar} onPress={() => navigation.navigate('Product', { id: item.id, nome: item.nome })}>
                <Ionicons name="search" size={13} color={colors.brand} />
                <Text style={styles.analisarTexto}>Analisar produto</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => remover(item.id)} hitSlop={8} accessibilityLabel="Remover">
              <Ionicons name="trash-outline" size={20} color={colors.location} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Ionicons name="cart-outline" size={40} color={colors.inkMuted} />
            <Text style={styles.vazioTitulo}>Sua lista está vazia</Text>
            <Text style={styles.vazioTexto}>Busque um produto e toque em “Adicionar à lista” para acompanhar o melhor preço.</Text>
            <Pressable style={styles.vazioBotao} onPress={() => navigation.navigate('Buscar')}>
              <Text style={styles.vazioBotaoTexto}>Buscar produtos</Text>
            </Pressable>
          </View>
        }
      />

      {selecionados.length > 0 && (
        <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
          <View>
            <Text style={styles.rodapeLabel}>Somando os menores preços</Text>
            <Text style={styles.rodapeTotal}>{formatBRL(total)}</Text>
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
  cardImg: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  cardNome: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink },
  cardLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted, textTransform: 'uppercase', marginTop: 4 },
  cardPreco: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.brand },
  analisar: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  analisarTexto: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brand },
  vazio: { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 32 },
  vazioTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 4 },
  vazioTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 19 },
  vazioBotao: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 20, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  vazioBotaoTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rodapeLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  rodapeTotal: { fontFamily: fonts.monoMedium, fontSize: 22, color: colors.brandDark, marginTop: 2 },
  rodapeBotao: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 18, height: 48 },
  rodapeBotaoTexto: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
});
