const Produto = require('../models/Produto');
const ProdutoGrafoNode = require('../models/ProdutoGrafoNode');
const ProdutoGrafoEdge = require('../models/ProdutoGrafoEdge');
const productNormalizer = require('./productNormalizer');
const cacheService = require('./cacheService');

const LIMITE_BUSCA_PADRAO = 50;
const LIMITE_AGREGACAO_MAX = 300;
const PREFIXO_MIN = 2;
const PREFIXO_MAX = 5;

const TOKENS_BAIXO_VALOR = new Set([
  'un',
  'und',
  'unid',
  'unidade',
  'unidades',
  'kg',
  'g',
  'mg',
  'ml',
  'l',
  'lt',
  'lts',
  'litro',
  'litros',
  'grama',
  'gramas',
  'pct',
  'pc',
  'pack',
  'cx',
  'caixa',
  'caixas',
  'produto',
  'promocao',
  'oferta'
]);

let indicesGarantidos = false;

function valorNo(valor) {
  return productNormalizer.normalizarTexto(valor);
}

function chaveNo(tipo, valor) {
  const normalizado = valorNo(valor);
  return normalizado ? `${tipo}:${normalizado}` : null;
}

function tokenValido(token) {
  const normalizado = valorNo(token);
  if (!normalizado || normalizado.length < 2) return false;
  if (TOKENS_BAIXO_VALOR.has(normalizado)) return false;
  if (/^\d+(\.\d+)?$/.test(normalizado)) return false;
  return true;
}

function textoProduto(produto) {
  return [
    produto.nome,
    produto.nome_normalizado,
    produto.marca,
    produto.tipo,
    produto.categoria,
    produto.quantidade,
    produto.quantidade_normalizada
  ].filter(Boolean).join(' ');
}

function analisarProdutoSalvo(produto) {
  return productNormalizer.analisarProduto(textoProduto(produto), {
    categoria: produto.categoria || undefined,
    tipo: produto.tipo || undefined,
    marca: produto.marca || undefined
  });
}

function adicionarNo(mapa, tipo, valor, peso, label = null) {
  const key = chaveNo(tipo, valor);
  if (!key) return;

  const existente = mapa.get(key);
  const node = {
    node_key: key,
    tipo,
    valor: valorNo(valor),
    label: label || String(valor || '').trim() || null,
    peso
  };

  if (!existente || existente.peso < peso) {
    mapa.set(key, node);
  }
}

function adicionarPrefixos(mapa, token) {
  const normalizado = valorNo(token);
  if (!tokenValido(normalizado)) return;

  const limite = Math.min(normalizado.length, PREFIXO_MAX);
  for (let tamanho = PREFIXO_MIN; tamanho <= limite; tamanho += 1) {
    adicionarNo(mapa, 'prefixo', normalizado.slice(0, tamanho), 0.55, normalizado.slice(0, tamanho));
  }
}

function tokensDeAnalise(analise, textoExtra = '') {
  return [
    ...(analise.tokens || []),
    ...(analise.extras || []),
    ...productNormalizer.tokenizar(textoExtra)
  ].filter(tokenValido);
}

function nodesDoProduto(produto) {
  const analise = analisarProdutoSalvo(produto);
  const nodes = new Map();

  if (analise.chave) adicionarNo(nodes, 'chave', analise.chave, analise.confiavel ? 10 : 4, analise.chave);
  if (analise.marca) adicionarNo(nodes, 'marca', analise.marca, 5, analise.marca);
  if (analise.tipo) adicionarNo(nodes, 'tipo', analise.tipo, 4, analise.tipo);
  if (analise.categoria) adicionarNo(nodes, 'categoria', analise.categoria, 2, analise.categoria);
  if (analise.quantidade_normalizada || analise.quantidade) {
    adicionarNo(nodes, 'quantidade', analise.quantidade_normalizada || analise.quantidade, 4, analise.quantidade);
  }

  const tokens = new Set(tokensDeAnalise(analise, textoProduto(produto)));
  for (const token of tokens) {
    adicionarNo(nodes, 'token', token, (analise.extras || []).includes(token) ? 3 : 2, token);
    adicionarPrefixos(nodes, token);
  }

  return [...nodes.values()];
}

function nodesDaBusca(termo, filtros = {}) {
  const analise = productNormalizer.analisarProduto(termo, {
    categoria: filtros.categoria || undefined,
    tipo: filtros.tipo || undefined,
    marca: filtros.marca || undefined
  });
  const nodes = new Map();

  if (analise.confiavel && analise.chave) adicionarNo(nodes, 'chave', analise.chave, 10, analise.chave);
  if (filtros.marca || analise.marca) adicionarNo(nodes, 'marca', filtros.marca || analise.marca, 5);
  if (filtros.tipo || analise.tipo) adicionarNo(nodes, 'tipo', filtros.tipo || analise.tipo, 4);
  if (filtros.categoria || analise.categoria) adicionarNo(nodes, 'categoria', filtros.categoria || analise.categoria, 2);

  const quantidade = filtros.quantidade || analise.quantidade_normalizada || analise.quantidade;
  if (quantidade) adicionarNo(nodes, 'quantidade', quantidade, 4);

  const tokens = new Set(tokensDeAnalise(analise, termo));
  for (const token of tokens) {
    adicionarNo(nodes, 'token', token, 2, token);
    adicionarPrefixos(nodes, token);
  }

  return { analise, nodes: [...nodes.values()] };
}

async function garantirIndices() {
  if (indicesGarantidos) return;

  await Promise.all([
    ProdutoGrafoNode.collection.createIndex(
      { node_key: 1 },
      { unique: true, name: 'uniq_produto_grafo_node_key', background: true }
    ),
    ProdutoGrafoNode.collection.createIndex(
      { tipo: 1, valor: 1 },
      { unique: true, name: 'uniq_produto_grafo_node_tipo_valor', background: true }
    ),
    ProdutoGrafoEdge.collection.createIndex(
      { node_key: 1, produto_id: 1 },
      { unique: true, name: 'uniq_produto_grafo_edge', background: true }
    ),
    ProdutoGrafoEdge.collection.createIndex(
      { node_key: 1, peso: -1 },
      { name: 'idx_produto_grafo_edge_node_peso', background: true }
    ),
    ProdutoGrafoEdge.collection.createIndex(
      { produto_id: 1, node_key: 1 },
      { name: 'idx_produto_grafo_edge_produto_node', background: true }
    )
  ]);

  indicesGarantidos = true;
}

async function indexarProduto(produto, opcoes = {}) {
  if (!produto || !produto._id) return { produto_id: null, nodes: 0 };

  const garantir = opcoes.garantir !== false;
  const limparExistentes = opcoes.limparExistentes !== false;
  if (garantir) await garantirIndices();

  const nodes = nodesDoProduto(produto);
  const agora = new Date();

  if (limparExistentes) {
    await ProdutoGrafoEdge.deleteMany({ produto_id: produto._id });
  }

  if (nodes.length === 0) return { produto_id: produto._id, nodes: 0 };

  await ProdutoGrafoNode.bulkWrite(nodes.map((node) => ({
    updateOne: {
      filter: { node_key: node.node_key },
      update: {
        $set: {
          tipo: node.tipo,
          valor: node.valor,
          label: node.label,
          peso_base: node.peso,
          atualizado_em: agora
        },
        $inc: { produto_count: limparExistentes ? 0 : 1 }
      },
      upsert: true
    }
  })));

  await ProdutoGrafoEdge.bulkWrite(nodes.map((node) => ({
    updateOne: {
      filter: { node_key: node.node_key, produto_id: produto._id },
      update: {
        $set: {
          tipo: node.tipo,
          valor: node.valor,
          peso: node.peso,
          atualizado_em: agora
        }
      },
      upsert: true
    }
  })));

  return { produto_id: produto._id, nodes: nodes.length };
}

async function removerProduto(produtoId) {
  if (!produtoId) return { removidas: 0 };
  const resultado = await ProdutoGrafoEdge.deleteMany({ produto_id: produtoId });
  return { removidas: resultado.deletedCount || 0 };
}

function filtrosInferidos(analiseBusca, filtros = {}) {
  return {
    categoria: filtros.categoria || analiseBusca.categoria || undefined,
    tipo: filtros.tipo || analiseBusca.tipo || undefined,
    marca: filtros.marca || analiseBusca.marca || undefined,
    quantidade: filtros.quantidade || analiseBusca.quantidade || undefined
  };
}

async function buscarProdutos(termo, filtros = {}, opcoes = {}) {
  const texto = String(termo || '').trim();
  if (!texto) return [];

  const limite = Math.min(Math.max(Number(opcoes.limite) || LIMITE_BUSCA_PADRAO, 1), LIMITE_BUSCA_PADRAO);
  const { analise, nodes } = nodesDaBusca(texto, filtros);
  if (nodes.length === 0) return [];

  const nodeKeys = nodes.map((node) => node.node_key);
  const agregados = await ProdutoGrafoEdge.aggregate([
    { $match: { node_key: { $in: nodeKeys } } },
    {
      $group: {
        _id: '$produto_id',
        score: { $sum: '$peso' },
        matches: { $sum: 1 }
      }
    },
    { $sort: { score: -1, matches: -1 } },
    { $limit: Math.min(limite * 4, LIMITE_AGREGACAO_MAX) }
  ]);

  if (agregados.length === 0) return [];

  const ids = agregados.map((item) => item._id);
  const produtos = await Produto.find({ _id: { $in: ids } });
  const porId = new Map(produtos.map((produto) => [String(produto._id), produto]));
  const filtrosBusca = filtrosInferidos(analise, filtros);

  return agregados
    .map((item) => porId.get(String(item._id)))
    .filter(Boolean)
    .filter((produto) => productNormalizer.analiseCombinaFiltros(analisarProdutoSalvo(produto), filtrosBusca))
    .slice(0, limite);
}

async function reindexarProdutos({ aplicar = false } = {}) {
  const produtos = await Produto.find().sort({ criado_em: 1 });
  const nodeKeys = new Set();
  let arestasEstimadas = 0;

  for (const produto of produtos) {
    const nodes = nodesDoProduto(produto);
    arestasEstimadas += nodes.length;
    nodes.forEach((node) => nodeKeys.add(node.node_key));
  }

  if (!aplicar) {
    return {
      modo: 'dry-run',
      produtos_lidos: produtos.length,
      nos_estimados: nodeKeys.size,
      arestas_estimadas: arestasEstimadas
    };
  }

  await garantirIndices();
  await Promise.all([
    ProdutoGrafoEdge.deleteMany({}),
    ProdutoGrafoNode.deleteMany({})
  ]);

  for (const produto of produtos) {
    await indexarProduto(produto, { garantir: false, limparExistentes: false });
  }

  const [nos, arestas] = await Promise.all([
    ProdutoGrafoNode.countDocuments(),
    ProdutoGrafoEdge.countDocuments()
  ]);

  cacheService.clear('produtos');

  return {
    modo: 'apply',
    produtos_indexados: produtos.length,
    nos,
    arestas
  };
}

module.exports = {
  buscarProdutos,
  garantirIndices,
  indexarProduto,
  nodesDaBusca,
  nodesDoProduto,
  reindexarProdutos,
  removerProduto
};
