// Design system do Consult Price.
// Paleta verde esmeralda (profissional) derivada da prévia aprovada.

export const colors = {
  canvas: '#FAFAF7', // fundo
  surface: '#FFFFFF', // cartões
  ink: '#14211C', // texto principal
  inkSoft: '#5A635C', // texto secundário
  inkMuted: '#8C948D', // dicas / inativo
  brand: '#16A35A', // verde fresco — preços e ações
  brandDark: '#0A3D29', // esmeralda — headers e títulos
  brandSoft: '#E8F3EC', // fundo de selos/realces verdes
  brandSoftLine: '#BFE3CC', // borda de realces verdes
  line: '#EDEBE3', // bordas neutras
  location: '#E06A3B', // coral — pinos de localização
  danger: '#C0392B',
  white: '#FFFFFF',
};

// Fontes carregadas via @expo-google-fonts em App.js
export const fonts = {
  display: 'PlusJakartaSans_700Bold', // títulos grandes
  semibold: 'PlusJakartaSans_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  mono: 'DMMono_400Regular', // dígitos de preço
  monoMedium: 'DMMono_500Medium',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
