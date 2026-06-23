// Área de pesquisa: localização do usuário + distância máxima.
// O mapa real virá das coordenadas dos estabelecimentos (o backend já
// geocodifica os endereços das notas). Aqui fica a UI de filtro.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme';

const DISTANCIAS = [5, 10, 20, 50];

export default function AreaScreen({ navigation }) {
  const [distancia, setDistancia] = useState(10);

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconeVoltar} onPress={() => navigation.goBack()} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitulo}>Área de pesquisa</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ padding: 16 }}>
        <View style={styles.tituloLinha}>
          <Text style={styles.titulo}>Onde buscar</Text>
          <Ionicons name="location" size={20} color={colors.brand} />
        </View>

        <View style={styles.cardLocal}>
          <Text style={styles.cardLabel}>sua localização</Text>
          <Text style={styles.cardLocalNome}>Nova Serrana · MG</Text>
          <Text style={styles.cardLocalCep}>35520-000</Text>
        </View>

        <View style={styles.botoes}>
          <Pressable style={styles.botaoO}><Text style={styles.botaoOTexto}>Usar atual</Text></Pressable>
          <Pressable style={styles.botaoG}><Text style={styles.botaoGTexto}>Alterar endereço</Text></Pressable>
        </View>

        <Text style={[styles.cardLabel, { marginTop: 22 }]}>distância máxima</Text>
        <View style={styles.chips}>
          {DISTANCIAS.map((km) => {
            const ativo = km === distancia;
            return (
              <Pressable key={km} style={[styles.chip, ativo && styles.chipOn]} onPress={() => setDistancia(km)}>
                <Text style={[styles.chipTexto, ativo && styles.chipTextoOn]}>{km} km</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.cardLabel, { marginTop: 22 }]}>no mapa</Text>
        <View style={styles.mapa}>
          <View style={styles.raioExterno}>
            <View style={styles.raioInterno}>
              <Ionicons name="location" size={20} color={colors.brand} />
            </View>
          </View>
          <Text style={styles.mapaNota}>Lojas num raio de {distancia} km de você</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  iconeVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: colors.brandDark },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.brandDark },
  cardLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardLocal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, marginTop: 12 },
  cardLocalNome: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginTop: 4 },
  cardLocalCep: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 10 },
  botaoO: { flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  botaoOTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  botaoG: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  botaoGTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  chips: { flexDirection: 'row', gap: 10, marginTop: 10 },
  chip: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftLine },
  chipTexto: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.inkSoft },
  chipTextoOn: { color: colors.brandDark },
  mapa: { height: 180, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: '#EEF1EC', alignItems: 'center', justifyContent: 'center', marginTop: 10, gap: 14 },
  raioExterno: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(22,163,90,0.12)', borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  raioInterno: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  mapaNota: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
});
