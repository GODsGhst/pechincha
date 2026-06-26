import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme';

export default function BrandMark({ light = false }) {
  const textColor = light ? colors.white : colors.ink;
  const markBg = light ? 'rgba(255,255,255,0.14)' : colors.brandSoft;
  const markBorder = light ? 'rgba(255,255,255,0.26)' : colors.brandSoftLine;
  const iconColor = light ? '#BFE8D2' : colors.brandDark;

  return (
    <View style={styles.container}>
      <View style={[styles.mark, { backgroundColor: markBg, borderColor: markBorder }]}>
        <Ionicons name="pricetag" size={17} color={iconColor} />
      </View>
      <Text style={[styles.texto, { color: textColor }]}>
        Consult<Text style={styles.destaque}>Price</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  texto: { fontFamily: fonts.display, fontSize: 20 },
  destaque: { color: '#5FD698' }
});
