// Organiza produtos já existentes no banco:
// - preenche categoria/tipo/marca quando o normalizador consegue inferir
// - padroniza caixa do nome de exibição
// - junta duplicados com a mesma chave confiável, preservando compras e histórico
//
// Dry-run: npm run organize:products
// Aplicar: npm run organize:products:apply

require('dotenv').config();

const mongoose = require('mongoose');
const Produto = require('../src/models/Produto');
const Compra = require('../src/models/Compra');
const HistoricoPreco = require('../src/models/HistoricoPreco');
const compraService = require('../src/services/compraService');
const { analisarProduto, formatarNomeProduto, normalizarTexto } = require('../src/services/productNormalizer');

const aplicar = process.argv.includes('--apply');

async function contarReferencias(produtoId) {
  const [historicos, compras] = await Promise.all([
    HistoricoPreco.countDocuments({ produto_id: produtoId }),
    Compra.countDocuments({ 'itens.produto_id': produtoId })
  ]);
  return historicos + compras;
}

function escolherPrincipal(grupo) {
  return [...grupo].sort((a, b) => {
    if (b.referencias !== a.referencias) return b.referencias - a.referencias;
    return new Date(a.produto.criado_em || 0) - new Date(b.produto.criado_em || 0);
  })[0];
}

async function atualizarProduto(produto, analise) {
  const nomeExibicao = formatarNomeProduto(produto.nome, analise);
  const atualizacao = {
    nome: nomeExibicao,
    nome_normalizado: normalizarTexto(nomeExibicao),
    categoria: produto.categoria || analise.categoria,
    tipo: produto.tipo || analise.tipo,
    marca: produto.marca || analise.marca
  };

  const mudou = Object.entries(atualizacao).some(([chave, valor]) => {
    const atual = produto[chave] === undefined ? null : produto[chave];
    return String(atual || '') !== String(valor || '');
  });

  if (mudou && aplicar) {
    await Produto.updateOne({ _id: produto._id }, { $set: atualizacao });
  }

  return { mudou, atualizacao };
}

async function mesclarGrupo(grupo) {
  const principal = escolherPrincipal(grupo);
  const duplicados = grupo.filter((item) => String(item.produto._id) !== String(principal.produto._id));

  if (duplicados.length === 0) return { principal, duplicados: [] };

  if (aplicar) {
    for (const item of duplicados) {
      await HistoricoPreco.updateMany(
        { produto_id: item.produto._id },
        { $set: { produto_id: principal.produto._id } }
      );

      await Compra.updateMany(
        { 'itens.produto_id': item.produto._id },
        { $set: { 'itens.$[item].produto_id': principal.produto._id } },
        { arrayFilters: [{ 'item.produto_id': item.produto._id }] }
      );

      await Produto.deleteOne({ _id: item.produto._id });
    }

    await compraService.recalcularPrecos(principal.produto._id);
  }

  return { principal, duplicados };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não configurado');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const produtos = await Produto.find().sort({ criado_em: 1 });
  const analisados = [];

  for (const produto of produtos) {
    const analise = analisarProduto(produto.nome, {
      categoria: produto.categoria || undefined,
      tipo: produto.tipo || undefined,
      marca: produto.marca || undefined
    });
    const referencias = await contarReferencias(produto._id);
    analisados.push({ produto, analise, referencias });
  }

  let atualizados = 0;
  for (const item of analisados) {
    const resultado = await atualizarProduto(item.produto, item.analise);
    if (resultado.mudou) atualizados += 1;
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

  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const { principal, duplicados } = await mesclarGrupo(grupo);
    if (duplicados.length === 0) continue;

    gruposMesclados += 1;
    produtosRemovidos += duplicados.length;
    exemplos.push({
      principal: principal.produto.nome,
      duplicados: duplicados.map((item) => item.produto.nome)
    });
  }

  console.log(JSON.stringify({
    modo: aplicar ? 'apply' : 'dry-run',
    produtos_lidos: produtos.length,
    produtos_com_nome_ou_metadados_para_atualizar: atualizados,
    grupos_duplicados_para_mesclar: gruposMesclados,
    produtos_duplicados_para_remover: produtosRemovidos,
    exemplos: exemplos.slice(0, 10)
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch (_e) {}
  process.exit(1);
});
