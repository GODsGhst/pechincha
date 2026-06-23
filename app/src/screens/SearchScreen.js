import { useState, useRef } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, fonts, radius } from '../theme';
import { formatBRL } from '../utils/format';

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const debounce = useRef(null);

  function aoDigitar(texto) {
    setTermo(texto);
    if (debounce.current) clearTimeout(debounce.current);
    if (!texto.trim()) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    debounce.current = setTimeout(() => buscar(texto.trim()), 350);
  }

  async function buscar(q) {
    setCarregando(true);
    try {
      const { produtos } = await api.get(`/produtos?nome=${encodeURIComponent(q)}`);
      setResultados(produtos || []);
    } catch (_e) {
      setResultados([]);
    } finally {
      setCarregando(false);
      setBuscou(true);
    }
  }

  return (
    <View style={[styles.tela, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.titulo}>Buscar preços</Text>
      <View style={styles.campo}>
        <Ionicons name="search" size={18} color={colors.inkMuted} />
        <TextInput
          style={styles.input}
          placeholder="Ex.: arroz, leite, café…"
          placeholderTextColor={colors.inkMuted}
          value={termo}
          onChangeText={aoDigitar}
          autoFocus
          returnKeyType="search"
        />
        {termo.length > 0 && (
          <Pressable onPress={() => aoDigitar('')}><Ionicons name="close-circle" size={18} color={colors.inkMuted} /></Pressable>
        )}
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.linha} onPress={() => navigation.navigate('Product', { id: item.id, nome: item.nome })}>
              <View style={styles.linhaImg}><Ionicons name="pricetag-outline" size={20} color={colors.inkMuted} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linhaNome} numberOfLines={1}>{item.nome}</Text>
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
              <Text style={styles.vazio}>Nenhum produto encontrado para “{termo}”.</Text>
            ) : (
              <Text style={styles.vazio}>Digite o nome de um produto para comparar preços.</Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, paddingHorizontal: 16 },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, height: 48, marginHorizontal: 16, marginTop: 12 },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
  linhaImg: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  linhaNome: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  linhaLocal: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  linhaLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.inkMuted, textTransform: 'uppercase' },
  linhaPreco: { fontFamily: fonts.monoMedium, fontSize: 15, color: colors.brand },
  vazio: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
});
