const Produto = require('../models/Produto');
const HistoricoPreco = require('../models/HistoricoPreco');
const productNormalizer = require('./productNormalizer');

// Deduplicação de produtos: delega ao normalizador (fuzzy matching com fuse.js),
// que trata as variações de escrita da notinha antes de salvar.
async function encontrarOuCriarProduto(nomeItem) {
  return productNormalizer.encontrarOuCriarProduto(nomeItem);
}

// Registra o preço no histórico e atualiza menor_preco / ultimo_preco do produto
async function registrarPreco({ produto, estabelecimentoId, compraId, valor, data }) {
  await HistoricoPreco.create({
    produto_id: produto._id,
    estabelecimento_id: estabelecimentoId,
    compra_id: compraId,
    valor,
    data
  });

  const atualizacao = {};
  if (produto.menor_preco === null || produto.menor_preco === undefined || valor < produto.menor_preco) {
    atualizacao.menor_preco = valor;
  }
  if (!produto.ultimo_preco || !produto.ultimo_preco.data || data >= produto.ultimo_preco.data) {
    atualizacao.ultimo_preco = { valor, data, estabelecimento_id: estabelecimentoId };
  }
  if (Object.keys(atualizacao).length > 0) {
    await Produto.updateOne({ _id: produto._id }, { $set: atualizacao });
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
}

// Remove o histórico vinculado a uma compra e recalcula os preços afetados
async function removerHistoricoDaCompra(compra) {
  await HistoricoPreco.deleteMany({ compra_id: compra._id });
  const produtoIds = [...new Set(compra.itens.map((i) => String(i.produto_id)))];
  for (const id of produtoIds) {
    await recalcularPrecos(id);
  }
}

module.exports = {
  encontrarOuCriarProduto,
  registrarPreco,
  recalcularPrecos,
  removerHistoricoDaCompra
};
