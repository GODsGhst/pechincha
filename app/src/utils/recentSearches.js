import * as SecureStore from 'expo-secure-store';

const CHAVE = 'recent_product_searches_v1';
const LIMITE = 8;

export async function carregarBuscasRecentes() {
  try {
    const bruto = await SecureStore.getItemAsync(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter(Boolean).slice(0, LIMITE) : [];
  } catch (_e) {
    return [];
  }
}

export async function salvarBuscaRecente(termo) {
  const valor = String(termo || '').trim();
  if (valor.length < 2) return carregarBuscasRecentes();

  const atuais = await carregarBuscasRecentes();
  const normalizado = valor.toLocaleLowerCase('pt-BR');
  const novaLista = [
    valor,
    ...atuais.filter((item) => String(item).toLocaleLowerCase('pt-BR') !== normalizado)
  ].slice(0, LIMITE);

  try {
    await SecureStore.setItemAsync(CHAVE, JSON.stringify(novaLista));
  } catch (_e) {
    return atuais;
  }
  return novaLista;
}

export async function limparBuscasRecentes() {
  try {
    await SecureStore.deleteItemAsync(CHAVE);
  } catch (_e) {
    // Histórico de busca é apenas conveniência local.
  }
  return [];
}
