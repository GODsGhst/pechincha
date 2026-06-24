// Sistema de tratamento de dados dos produtos.
// A descrição na notinha varia muito ("ARROZ TIO JOÃO 5KG", "ARROZ T.JOAO 5 KG",
// "ARROZ 5KG" sem marca). Aqui normalizamos o texto e usamos fuzzy matching
// (fuse.js) para que o mesmo produto, escrito de formas diferentes, caia num
// único registro — sem juntar produtos distintos (ex.: "ARROZ 1KG" x "ARROZ 5KG").

const Fuse = require('fuse.js');
const Produto = require('../models/Produto');

// Limiar estrito para deduplicação (0 = idêntico, 1 = qualquer coisa).
// Baixo de propósito: só junta descrições quase idênticas (espaços/acentos/
// pequenos erros), preservando variações reais de tamanho/marca.
const LIMIAR_DEDUP = 0.2;
// Limiar mais frouxo para a BUSCA do usuário (prioriza encontrar, não precisão).
const LIMIAR_BUSCA = 0.4;

// Conectores curtos sem valor de comparação.
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'por', 'a', 'o']);

// minúsculas, sem acento, espaços colapsados: "PÃO  DE Fôrma" === "pao de forma"
function normalizarTexto(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas de acento combinantes
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function limparNome(texto) {
  return (texto || '').replace(/\s+/g, ' ').trim();
}

// Quebra em tokens úteis (descarta conectores e tokens de 1 char).
function tokenizar(texto) {
  return texto
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Deduplicação: acha o produto existente mais parecido; cria se não houver.
// Retorna { produto, novo }. Chame em sequência ao processar um cupom, para
// que um produto criado para um item seja reaproveitado pelos itens seguintes.
async function encontrarOuCriarProduto(nomeBruto) {
  const nome = limparNome(nomeBruto);
  const normalizado = normalizarTexto(nome);

  if (!normalizado) {
    const criado = await Produto.create({ nome: nome || 'PRODUTO', nome_normalizado: normalizado });
    return { produto: criado, novo: true };
  }

  const produtos = await Produto.find();
  if (produtos.length > 0) {
    const entradas = produtos.map((p) => ({ ref: p, texto: p.nome_normalizado || normalizarTexto(p.nome) }));
    const fuse = new Fuse(entradas, { keys: ['texto'], threshold: LIMIAR_DEDUP, ignoreLocation: true });
    const [melhor] = fuse.search(normalizado);
    if (melhor) return { produto: melhor.item.ref, novo: false };
  }

  const criado = await Produto.create({ nome, nome_normalizado: normalizado });
  return { produto: criado, novo: true };
}

// Busca tolerante para o usuário: aceita caixa, acentos, ordem das palavras e
// tokens faltando ("pao forma" acha "PAO FORMA VISCONT 400G"). Não cria nada.
// Retorna os produtos ordenados pela relevância do fuzzy matching.
async function buscarProdutos(descricao) {
  const normalizado = normalizarTexto(descricao);
  if (!normalizado) return [];

  const produtos = await Produto.find();
  if (produtos.length === 0) return [];

  const entradas = produtos.map((p) => ({ ref: p, texto: p.nome_normalizado || normalizarTexto(p.nome) }));
  const tokens = tokenizar(normalizado);
  const usarEstendida = tokens.length > 0;

  const fuse = new Fuse(entradas, {
    keys: ['texto'],
    threshold: LIMIAR_BUSCA,
    ignoreLocation: true,
    useExtendedSearch: usarEstendida
  });

  const query = usarEstendida ? tokens.map((t) => `'${t}`).join(' ') : normalizado;
  return fuse.search(query).map((r) => r.item.ref);
}

module.exports = {
  encontrarOuCriarProduto,
  buscarProdutos,
  normalizarTexto,
  tokenizar,
  LIMIAR_DEDUP,
  LIMIAR_BUSCA
};
