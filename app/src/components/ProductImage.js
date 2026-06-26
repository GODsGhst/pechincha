import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

export default function ProductImage({
  uri,
  style,
  iconName = 'pricetag-outline',
  iconSize = 22,
  iconColor = colors.inkMuted
}) {
  const [falhou, setFalhou] = useState(false);
  const mostrarImagem = Boolean(uri) && !falhou;

  useEffect(() => {
    setFalhou(false);
  }, [uri]);

  return (
    <View style={[styles.caixa, style]}>
      {mostrarImagem ? (
        <Image
          source={{ uri }}
          style={styles.imagem}
          resizeMode="contain"
          onError={() => setFalhou(true)}
        />
      ) : (
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#F1F0EA',
    alignItems: 'center',
    justifyContent: 'center'
  },
  imagem: {
    width: '100%',
    height: '100%'
  }
});
