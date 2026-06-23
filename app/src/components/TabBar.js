// Barra de abas customizada.
// Decisão de design (Lei de Fitts + zona do polegar): a ação principal —
// escanear o cupom — fica no centro, grande e elevada, no ponto mais fácil de
// alcançar. As outras 4 abas ficam ao redor; o foco é escanear e a lista.

import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const ICONES = { Inicio: 'home', Lista: 'cart', Buscar: 'search', Perfil: 'person' };
const ROTULOS = { Inicio: 'Início', Lista: 'Lista', Buscar: 'Buscar', Perfil: 'Perfil' };

function TabButton({ route, index, state, navigation }) {
  const focado = state.index === index;
  const cor = focado ? colors.brandDark : colors.inkMuted;

  function aoTocar() {
    const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focado && !evento.defaultPrevented) navigation.navigate(route.name);
  }

  return (
    <Pressable style={styles.tab} onPress={aoTocar} accessibilityRole="button" accessibilityLabel={ROTULOS[route.name]}>
      <Ionicons name={focado ? ICONES[route.name] : `${ICONES[route.name]}-outline`} size={22} color={cor} />
      <Text style={[styles.rotulo, { color: cor }]}>{ROTULOS[route.name]}</Text>
    </Pressable>
  );
}

export default function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const r = state.routes;

  return (
    <View style={[styles.barra, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <TabButton route={r[0]} index={0} state={state} navigation={navigation} />
      <TabButton route={r[1]} index={1} state={state} navigation={navigation} />

      <View style={styles.centro}>
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('Scan')}
          accessibilityRole="button"
          accessibilityLabel="Escanear cupom fiscal"
        >
          <Ionicons name="qr-code" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.fabRotulo}>Escanear</Text>
      </View>

      <TabButton route={r[2]} index={2} state={state} navigation={navigation} />
      <TabButton route={r[3]} index={3} state={state} navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  rotulo: { fontFamily: fonts.medium, fontSize: 11 },
  centro: { flex: 1, alignItems: 'center', gap: 3 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.surface,
  },
  fabRotulo: { fontFamily: fonts.semibold, fontSize: 11, color: colors.brandDark },
});
