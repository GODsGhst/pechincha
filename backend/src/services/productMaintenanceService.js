const Produto = require('../models/Produto');
const Compra = require('../models/Compra');
const HistoricoPreco = require('../models/HistoricoPreco');
const ListaCompra = require('../models/ListaCompra');
const compraService = require('./compraService');
const cacheService = require('./cacheService');
const {
  analisarProduto,
  formatarNomeProduto,
  normalizarTexto
} = require('./productNormalizer');

function textoAnaliseProduto(produto) {
  return [produto.nome, produto.quantidade].filter(Boolean).join(' ');
}

async function contarReferencias(produtoId) {
  const [historicos, compras, listas] = await Promise.all([
    HistoricoPreco.countDocuments({ produto_id: produtoId }),
    Compra.countDocuments({ 'itens.produto_id': produtoId }),
    ListaCompra.countDocuments({ 'itens.produto_id': produtoId })
  ]);
  return historicos + compras + listas;
}

function escolherPrincipal(grupo) {
  return [...grupo].sort((a, b) => {
    if (b.referencias !== a.referencias) return b.referencias - a.referencias;
    return new Date(a.produto.criado_em || 0) - new Date(b.produto.criado_em || 0);
  })[0];
}

function atualizacaoDoProduto(produto, analise) {
  const nomeExibicao = formatarNomeProduto(produto.nome, analise);
  return {
    nome: nomeExibicao,
    nome_normalizado: normalizarTexto(nomeExibicao),
    chave_dedup: analise.confiavel ? analise.chave : null,
    categoria: produto.categoria || analise.categoria,
    tipo: produto.tipo || analise.tipo,
    marca: produto.marca || analise.marca,
    quantidade: produto.quantidade || analise.quantidade,
    quantidade_normalizada: produto.quantidade_normalizada || analise.quantidade_normalizada
  };
}

function produtoMudaria(produto, atualizacao) {
  return Object.entries(atualizacao).some(([chave, valor]) => {
    const atual = produto[chave] === undefined ? null : produto[chave];
    return String(atual || '') !== String(valor || '');
  });
}

async function atualizarProduto(produto, analise, aplicar) {
  const atualizacao = atualizacaoDoProduto(produto, analise);
  const mudou = produtoMudaria(produto, atualizacao);

  if (mudou && aplicar) {
    await Produto.updateOne({ _id: produto._id }, { $set: atualizacao });
    Object.assign(produto, atualizacao);
  }

  return { mudou, atualizacao };
}

function indiceSimplesChaveDedup(index) {
  return index &&
    index.key &&
    Object.keys(index.key).length === 1 &&
    index.key.chave_dedup === 1;
}

async function garantirIndiceUnicoChaveDedup(aplicar) {
  const nomeIndice = 'uniq_produto_chave_dedup';
  const indexes = await Produto.collection.indexes();
  const indiceUnico = indexes.find((index) => indiceSimplesChaveDedup(index) && index.unique);

  if (indiceUnico) {
    return { status: 'existente', nome: indiceUnico.name };
  }

  const indiceAntigo = indexes.find((index) => index.name !== '_id_' && indiceSimplesChaveDedup(index));
  if (!aplicar) {
    return {
      status: indiceAntigo ? 'dry-run-recriaria' : 'dry-run-criaria',
      nome: indiceAntigo ? indiceAntigo.name : nomeIndice
    };
  }

  if (indiceAntigo) {
    await Produto.collection.dropIndex(indiceAntigo.name);
  }

  await Produto.collection.createIndex(
    { chave_dedup: 1 },
    {
      name: nomeIndice,
      unique: true,
      partialFilterExpression: { chave_dedup: { $type: 'string' } },
      background: true
    }
  );

  return {
    status: indiceAntigo ? 'recriado-como-unico' : 'criado',
    nome: nomeIndice
  };
}

async function garantirIndicesHistorico(aplicar) {
  const nomeIndice = 'idx_historico_produto_data_desc';
  const indexes = await HistoricoPreco.collection.indexes();
  const existente = indexes.find((index) => index.name === nomeIndice);

  if (existente) {
    return { status: 'existente', nome: nomeIndice };
  }

  if (!aplicar) {
    return { status: 'dry-run-criaria', nome: nomeIndice };
  }

  await HistoricoPreco.collection.createIndex(
    { produto_id: 1, data: -1 },
    { name: nomeIndice, background: true }
  );

  return { status: 'criado', nome: nomeIndice };
}

async function mesclarGrupo(grupo, aplicar) {
  const principal = escolherPrincipal(grupo);
  const duplicados = grupo.filter((item) => String(item.produto._id) !== String(principal.produto._id));

  if (duplicados.length === 0) return { principal, duplicados: [] };

  if (aplicar) {
    for (const item of duplicados) {
      await Promise.all([
        HistoricoPreco.updateMany(
          { produto_id: item.produto._id },
          { $set: { produto_id: principal.produto._id } }
        ),
        Compra.updateMany(
          { 'itens.produto_id': item.produto._id },
          { $set: { 'itens.$[linha].produto_id': principal.produto._id } },
          { arrayFilters: [{ 'linha.produto_id': item.produto._id }] }
        ),
        ListaCompra.updateMany(
          { 'itens.produto_id': item.produto._id },
          { $set: { 'itens.$[linha].produto_id': principal.produto._id, atualizado_em: new Date() } },
          { arrayFilters: [{ 'linha.produto_id': item.produto._id }] }
        )
      ]);

      await Produto.deleteOne({ _id: item.produto._id });
    }

    await compraService.recalcularPrecos(principal.produto._id);
  }

  return { principal, duplicados };
}

async function organizarProdutos({ aplicar = false } = {}) {
  const produtos = await Produto.find().sort({ criado_em: 1 });
  const analisados = [];

  for (const produto of produtos) {
    const analise = analisarProduto(textoAnaliseProduto(produto), {
      categoria: produto.categoria || undefined,
      tipo: produto.tipo || undefined,
      marca: produto.marca || undefined
    });
    const referencias = await contarReferencias(produto._id);
    analisados.push({ produto, analise, referencias });
  }

  const grupos = new Map();
  for (const item of analisados) {
    if (!item.analise.confiavel) continue;
    const chave = item.analise.chave;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }

  let gruposMesclados = 0;
  let produtosRemovidos = 0;
  const exemplos = [];
  const produtosRemovidosIds = new Set();

  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const { principal, duplicados } = await mesclarGrupo(grupo, aplicar);
    if (duplicados.length === 0) continue;

    gruposMesclados += 1;
    produtosRemovidos += duplicados.length;
    duplicados.forEach((item) => produtosRemovidosIds.add(String(item.produto._id)));
    exemplos.push({
      principal: principal.produto.nome,
      duplicados: duplicados.map((item) => item.produto.nome)
    });
  }

  let atualizados = 0;
  for (const item of analisados) {
    if (produtosRemovidosIds.has(String(item.produto._id))) continue;
    const resultado = await atualizarProduto(item.produto, item.analise, aplicar);
    if (resultado.mudou) atualizados += 1;
  }

  const indiceChaveDedup = await garantirIndiceUnicoChaveDedup(aplicar);
  const indicesHistorico = await garantirIndicesHistorico(aplicar);
  if (aplicar && (atualizados > 0 || produtosRemovidos > 0)) {
    cacheService.clear('produtos');
  }

  return {
    modo: aplicar ? 'apply' : 'dry-run',
    produtos_lidos: produtos.length,
    produtos_com_nome_ou_metadados_para_atualizar: atualizados,
    grupos_duplicados_para_mesclar: gruposMesclados,
    produtos_duplicados_para_remover: produtosRemovidos,
    indice_chave_dedup: indiceChaveDedup,
    indices_historico: indicesHistorico,
    exemplos: exemplos.slice(0, 10)
  };
}

module.exports = { organizarProdutos };
