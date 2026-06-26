const productNormalizer = require('./productNormalizer');

const PALAVRAS_MINUSCULAS = new Set(['a', 'as', 'ao', 'aos', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos', 'para', 'por']);

const PALAVRAS_ESPECIAIS = new Map([
  ['abc', 'ABC'],
  ['bh', 'BH'],
  ['mg', 'MG'],
  ['rj', 'RJ'],
  ['sp', 'SP'],
  ['pr', 'PR'],
  ['rs', 'RS'],
  ['sc', 'SC'],
  ['es', 'ES'],
  ['go', 'GO'],
  ['df', 'DF'],
  ['ba', 'BA'],
  ['pe', 'PE'],
  ['ce', 'CE'],
  ['pa', 'PA'],
  ['am', 'AM'],
  ['ltda', 'Ltda'],
  ['eireli', 'Eireli'],
  ['epp', 'EPP'],
  ['me', 'ME'],
  ['sa', 'S.A.'],
  ['s/a', 'S.A.'],
  ['cia', 'Cia'],
  ['cnpj', 'CNPJ'],
  ['cpf', 'CPF'],
  ['atacadao', 'Atacadão'],
  ['sao', 'São'],
  ['joao', 'João'],
  ['acougue', 'Açougue'],
  ['acucar', 'Açúcar'],
  ['agua', 'Água'],
  ['cafe', 'Café'],
  ['pao', 'Pão']
]);

function limparEspacos(texto) {
  return String(texto || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function normalizarBasico(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function capitalizarToken(token, indice) {
  if (!token) return token;

  const normalizado = normalizarBasico(token);
  if (PALAVRAS_ESPECIAIS.has(normalizado)) return PALAVRAS_ESPECIAIS.get(normalizado);
  if (indice > 0 && PALAVRAS_MINUSCULAS.has(normalizado)) return normalizado;
  if (/^\d+[a-z]*$/i.test(token)) return token.toLowerCase();
  if (/^[A-Z0-9]{2,4}$/.test(token) && !['RUA', 'AV', 'ROD'].includes(token)) return token;

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function capitalizarComSeparadores(texto) {
  return limparEspacos(texto)
    .split(' ')
    .map((parte, indice) => parte
      .split('-')
      .map((pedaco, subIndice) => capitalizarToken(pedaco, indice + subIndice))
      .join('-'))
    .join(' ');
}

function formatarNomeEstabelecimento(nome) {
  const limpo = limparEspacos(nome);
  if (!limpo) return null;
  return capitalizarComSeparadores(limpo);
}

function formatarEndereco(endereco) {
  const limpo = limparEspacos(endereco);
  if (!limpo) return null;

  return limpo
    .split(',')
    .map((parte) => capitalizarComSeparadores(parte))
    .join(', ');
}

function formatarNomeProduto(produtoOuNome) {
  const nome = typeof produtoOuNome === 'string'
    ? produtoOuNome
    : produtoOuNome && produtoOuNome.nome;
  const limpo = limparEspacos(nome);
  if (!limpo) return null;

  try {
    const sobrescritas = typeof produtoOuNome === 'string'
      ? {}
      : {
          categoria: produtoOuNome.categoria || null,
          tipo: produtoOuNome.tipo || null,
          marca: produtoOuNome.marca || null
        };
    const analise = productNormalizer.analisarProduto(limpo, sobrescritas);
    return productNormalizer.formatarNomeProduto(limpo, analise);
  } catch (_err) {
    return capitalizarComSeparadores(limpo);
  }
}

module.exports = {
  formatarEndereco,
  formatarNomeEstabelecimento,
  formatarNomeProduto,
  limparEspacos
};
