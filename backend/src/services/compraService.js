const Produto = require('../models/Produto');
const HistoricoPreco = require('../models/HistoricoPreco');
const productNormalizer = require('./productNormalizer');
const productGraphService = require('./productGraphService');
const cacheService = require('./cacheService');

// Deduplicação de produtos: delega ao normalizador (fuzzy matching com fuse.js),
// que trata as variações de escrita da notinha antes de salvar.
function criarContextoProdutos() {
  return productNormalizer.criarContextoNormalizacao();
}

async function encontrarOuCriarProduto(nomeItem, contexto = null) {
  const resultado = await productNormalizer.encontrarOuCriarProduto(nomeItem, contexto);
  try {
    await productGraphService.indexarProduto(resultado.produto);
  } catch (err) {
    console.warn('Falha ao indexar produto no grafo:', err.message);
  }
  return resultado;
}

// Registra o preço no histórico e atualiza menor_preco / ultimo_preco do produto
async function registrarPreco({ produto, estabelecimentoId, compraId, valor, data }) {
  await registrarPrecosEmLote([{ produto, estabelecimentoId, compraId, valor, data }]);
}

function chaveHistorico(item) {
  return [
    String(item.produto._id),
    String(item.estabelecimentoId),
    String(item.compraId),
    Number(item.valor).toFixed(2)
  ].join('|');
}

async function registrarPrecosEmLote(itens) {
  if (!Array.isArray(itens) || itens.length === 0) return;

  const porHistorico = new Map();
  for (const item of itens) {
    if (!item || !item.produto || !item.produto._id) continue;
    const valor = Number(item.valor);
    if (!Number.isFinite(valor) || valor <= 0) continue;

    const chave = chaveHistorico({ ...item, valor });
    const atual = porHistorico.get(chave);
    if (atual) {
      atual.observacoes += 1;
      if (item.data && item.data > atual.data) atual.data = item.data;
      continue;
    }

    porHistorico.set(chave, {
      produto: item.produto,
      estabelecimentoId: item.estabelecimentoId,
      compraId: item.compraId,
      valor,
      data: item.data || new Date(),
      observacoes: 1
    });
  }

  const registros = [...porHistorico.values()];
  if (registros.length === 0) return;

  await HistoricoPreco.bulkWrite(registros.map((item) => ({
    updateOne: {
      filter: {
        produto_id: item.produto._id,
        estabelecimento_id: item.estabelecimentoId,
        compra_id: item.compraId,
        valor: item.valor
      },
      update: {
        $setOnInsert: {
          produto_id: item.produto._id,
          estabelecimento_id: item.estabelecimentoId,
          compra_id: item.compraId,
          valor: item.valor
        },
        $max: { data: item.data },
        $inc: { observacoes: item.observacoes }
      },
      upsert: true
    }
  })));
  cacheService.clear('produtos');

  const atualizacoesProduto = new Map();
  for (const item of registros) {
    const id = String(item.produto._id);
    const atual = atualizacoesProduto.get(id) || { produto: item.produto, menor: item.valor, ultimo: item };
    if (item.valor < atual.menor) atual.menor = item.valor;
    if (!atual.ultimo || item.data >= atual.ultimo.data) atual.ultimo = item;
    atualizacoesProduto.set(id, atual);
  }

  const operacoesProduto = [];
  for (const { produto, menor, ultimo } of atualizacoesProduto.values()) {
    const atualizacao = {};
    if (produto.menor_preco === null || produto.menor_preco === undefined || menor < produto.menor_preco) {
      atualizacao.menor_preco = menor;
    }
    if (!produto.ultimo_preco || !produto.ultimo_preco.data || ultimo.data >= produto.ultimo_preco.data) {
      atualizacao.ultimo_preco = {
        valor: ultimo.valor,
        data: ultimo.data,
        estabelecimento_id: ultimo.estabelecimentoId
      };
    }
    if (Object.keys(atualizacao).length > 0) {
      operacoesProduto.push({
        updateOne: {
          filter: { _id: produto._id },
          update: { $set: atualizacao }
        }
      });
    }
  }

  if (operacoesProduto.length > 0) {
    await Produto.bulkWrite(operacoesProduto);
  }
}

// Recalcula menor_preco / ultimo_preco a partir do histórico restante
// (usado após remover uma compra)
async function recalcularPrecos(produtoId) {
  const [menor] = await HistoricoPreco.find({ produto_id: produtoId }).sort({ valor: 1 }).limit(1);
  const [ultimo] = await HistoricoPreco.find({ produto_id: produtoId }).sort({ data: -1 }).limit(1);

  await Produto.updateOne({ _id: produtoId }, {
    $set: {
      menor_preco: menor ? menor.valor : null,
      ultimo_preco: ultimo
        ? { valor: ultimo.valor, data: ultimo.data, estabelecimento_id: ultimo.estabelecimento_id }
      : {}
    }
  });
  cacheService.clear('produtos');
}

// Remove o histórico vinculado a uma compra e recalcula os preços afetados
async function removerHistoricoDaCompra(compra) {
  await HistoricoPreco.deleteMany({ compra_id: compra._id });
  const produtoIds = [...new Set(compra.itens.map((i) => String(i.produto_id)))];
  for (const id of produtoIds) {
    await recalcularPrecos(id);
  }
  cacheService.clear('produtos');
}

module.exports = {
  criarContextoProdutos,
  encontrarOuCriarProduto,
  registrarPreco,
  registrarPrecosEmLote,
  recalcularPrecos,
  removerHistoricoDaCompra
};
