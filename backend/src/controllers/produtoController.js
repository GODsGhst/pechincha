const mongoose = require('mongoose');
const Produto = require('../models/Produto');
const HistoricoPreco = require('../models/HistoricoPreco');
const productNormalizer = require('../services/productNormalizer');
const productImageService = require('../services/productImageService');
const displayFormatter = require('../services/displayFormatter');
const pricePresentation = require('../services/pricePresentationService');
const cacheService = require('../services/cacheService');
const { registrarAdminAudit } = require('../services/adminAuditService');

const CACHE_TTL_MS = 20 * 1000;
const CACHE_MAX = 120;
const LIMITE_FALLBACK_FILTROS = 1000;

function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function regexExato(valor) {
  return new RegExp(`^${escapeRegex(String(valor).trim())}$`, 'i');
}

function montarFiltros(query) {
  const filtros = {};
  if (query.categoria) filtros.categoria = String(query.categoria).trim();
  if (query.tipo) filtros.tipo = String(query.tipo).trim();
  if (query.marca) filtros.marca = String(query.marca).trim();
  if (query.quantidade) filtros.quantidade = String(query.quantidade).trim();
  return filtros;
}

function montarQueryProduto(filtros = {}) {
  const query = {};
  if (filtros.categoria) query.categoria = regexExato(filtros.categoria);
  if (filtros.tipo) query.tipo = regexExato(filtros.tipo);
  if (filtros.marca) query.marca = regexExato(filtros.marca);
  if (filtros.quantidade) query.quantidade = regexExato(filtros.quantidade);
  return query;
}

function chaveCache(prefixo, query = {}) {
  const partes = Object.entries(query)
    .filter(([, valor]) => valor !== undefined && valor !== null && String(valor).trim() !== '')
    .map(([chave, valor]) => [chave, String(valor).trim()])
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefixo}:${JSON.stringify(partes)}`;
}

function obterCache(chave) {
  return cacheService.get('produtos', chave);
}

function salvarCache(chave, valor) {
  cacheService.set('produtos', chave, valor, { ttlMs: CACHE_TTL_MS, max: CACHE_MAX });
}

function limparCache() {
  cacheService.clear('produtos');
}

function imagemUrlSegura(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;
  if (texto.length > 700) return null;
  try {
    const url = new URL(texto);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch (_e) {
    return null;
  }
}

const { arredondar, precoPorMedida, confiancaPreco } = pricePresentation;

function plano(produto) {
  if (!produto) return {};
  if (typeof produto.toObject === 'function') return produto.toObject();
  return produto;
}

function metadadosProduto(produto) {
  const base = plano(produto);
  const texto = [base.nome, base.quantidade].filter(Boolean).join(' ');
  const analiseInferida = productNormalizer.analisarProduto(texto || base.nome || '');
  const tipoSalvoSuspeito = textoIgual(base.tipo, 'Leite') && !textoIgual(analiseInferida.tipo, 'Leite');
  const analise = tipoSalvoSuspeito
    ? analiseInferida
    : productNormalizer.analisarProduto(texto || base.nome || '', {
        categoria: base.categoria || undefined,
        tipo: base.tipo || undefined,
        marca: base.marca || undefined
      });

  return {
    categoria: tipoSalvoSuspeito ? (analise.categoria || null) : (base.categoria || analise.categoria || null),
    tipo: tipoSalvoSuspeito ? (analise.tipo || null) : (base.tipo || analise.tipo || null),
    marca: base.marca || analise.marca || null,
    quantidade: base.quantidade || analise.quantidade || null,
    quantidade_normalizada: base.quantidade_normalizada || analise.quantidade_normalizada || null
  };
}

function produtoComMetadados(produto) {
  const base = plano(produto);
  return { ...base, ...metadadosProduto(base) };
}

function analiseCanonicaProduto(produto) {
  const base = produtoComMetadados(produto);
  const texto = [base.nome, base.quantidade].filter(Boolean).join(' ');
  return productNormalizer.analisarProduto(texto || base.nome || '', {
    categoria: base.categoria || undefined,
    tipo: base.tipo || undefined,
    marca: base.marca || undefined
  });
}

function chaveCanonicaProduto(produto) {
  const analise = analiseCanonicaProduto(produto);
  return analise.confiavel ? analise.chave : null;
}

function combinaFiltrosInferidos(produto, filtros, ignorarCampo = null) {
  const efetivos = { ...filtros };
  if (ignorarCampo) delete efetivos[ignorarCampo];
  const meta = metadadosProduto(produto);
  return productNormalizer.analiseCombinaFiltros(meta, efetivos) &&
    quantidadeCompativelComFiltros(meta, efetivos);
}

function ordenarTexto(lista) {
  return [...new Set(lista.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

function textoIgual(a, b) {
  return productNormalizer.normalizarTexto(a || '') === productNormalizer.normalizarTexto(b || '');
}

const UNIDADES_POR_TIPO = new Map([
  ['refrigerante', ['ml']],
  ['agua', ['ml']],
  ['suco', ['ml']],
  ['cerveja', ['ml']],
  ['isotonico', ['ml']],
  ['leite', ['ml']],
  ['detergente', ['ml']],
  ['amaciante', ['ml']],
  ['desinfetante', ['ml']],
  ['agua sanitaria', ['ml']],
  ['alcool', ['ml']],
  ['limpa aluminio', ['ml']],
  ['limpador', ['ml']],
  ['sabao', ['g', 'ml']],
  ['esponja', ['un']],
  ['guardanapo', ['un']],
  ['papel higienico', ['un']],
  ['sabonete', ['g', 'un']],
  ['shampoo', ['ml']],
  ['condicionador', ['ml']],
  ['creme dental', ['g']],
  ['desodorante', ['ml', 'g']],
  ['barbeador', ['un']],
  ['hidratante', ['ml', 'g']],
  ['absorvente', ['un']],
  ['arroz', ['g']],
  ['feijao', ['g']],
  ['cafe', ['g']],
  ['acucar', ['g']],
  ['oleo', ['ml']],
  ['macarrao', ['g']],
  ['farinha', ['g']],
  ['biscoito', ['g']],
  ['molho', ['g', 'ml']],
  ['sal', ['g']],
  ['iogurte', ['g', 'ml']],
  ['bala', ['g']],
  ['goma', ['g', 'un']],
  ['chocolate', ['g']],
  ['bolo', ['g']],
  ['cha', ['g']],
  ['bombom', ['g']],
  ['carne', ['g']],
  ['frango', ['g']],
  ['linguica', ['g']],
  ['hamburguer', ['g']],
  ['banana', ['g', 'un']],
  ['tomate', ['g', 'un']],
  ['cebola', ['g', 'un']],
  ['batata', ['g', 'un']],
  ['alface', ['g', 'un']],
  ['abobora', ['g', 'un']],
  ['beterraba', ['g', 'un']],
  ['chuchu', ['g', 'un']],
  ['laranja', ['g', 'un']],
  ['couve', ['g', 'un']],
  ['cenoura', ['g', 'un']],
  ['abacate', ['g', 'un']],
  ['alho', ['g', 'un']]
]);

const UNIDADES_POR_CATEGORIA = new Map([
  ['bebidas', ['ml']],
  ['acougue', ['g']],
  ['hortifruti', ['g', 'un']]
]);

function chaveUnidade(texto) {
  return productNormalizer.normalizarTexto(texto || '');
}

function unidadeDaQuantidade(meta) {
  const quantidadeNormalizada = String(meta.quantidade_normalizada || '');
  if (quantidadeNormalizada.endsWith('ml')) return 'ml';
  if (quantidadeNormalizada.endsWith('g')) return 'g';
  if (quantidadeNormalizada.endsWith('un')) return 'un';
  return null;
}

function quantidadeCompativelComFiltros(meta, filtros = {}) {
  const unidade = unidadeDaQuantidade(meta);
  if (!unidade) return true;

  const tipo = filtros.tipo || meta.tipo;
  const unidadesDoTipo = UNIDADES_POR_TIPO.get(chaveUnidade(tipo));
  if (unidadesDoTipo) return unidadesDoTipo.includes(unidade);

  const categoria = filtros.categoria || meta.categoria;
  const unidadesDaCategoria = UNIDADES_POR_CATEGORIA.get(chaveUnidade(categoria));
  return unidadesDaCategoria ? unidadesDaCategoria.includes(unidade) : true;
}

function mesclarProdutos(...listas) {
  const porId = new Map();
  for (const lista of listas) {
    for (const produto of lista || []) {
      if (produto && produto._id && !porId.has(String(produto._id))) {
        porId.set(String(produto._id), produto);
      }
    }
  }
  return [...porId.values()];
}

function formatarProduto(p) {
  const produto = produtoComMetadados(p);
  const imagem = productImageService.imagemDoProduto(produto);
  const ultimoPreco = produto.ultimo_preco;
  const precoUnidade = precoPorMedida(produto.menor_preco, produto);
  return {
    id: produto._id,
    nome: displayFormatter.formatarNomeProduto(produto),
    categoria: produto.categoria,
    tipo: produto.tipo,
    marca: produto.marca,
    quantidade: produto.quantidade,
    imagem_url: imagem.url,
    imagem_credito: imagem.credito,
    menor_preco: produto.menor_preco,
    preco_unidade: precoUnidade,
    confianca_preco: confiancaPreco(ultimoPreco && ultimoPreco.data),
    ultimo_preco: ultimoPreco && ultimoPreco.valor !== undefined && ultimoPreco.valor !== null
      ? {
          valor: ultimoPreco.valor,
          data: ultimoPreco.data,
          preco_unidade: precoPorMedida(ultimoPreco.valor, produto),
          confianca_preco: confiancaPreco(ultimoPreco.data),
          estabelecimento: ultimoPreco.estabelecimento_id && ultimoPreco.estabelecimento_id.nome
            ? displayFormatter.formatarNomeEstabelecimento(ultimoPreco.estabelecimento_id.nome)
            : null
        }
      : null
  };
}

function dataTimestamp(valor) {
  if (!valor) return 0;
  const tempo = new Date(valor).getTime();
  return Number.isFinite(tempo) ? tempo : 0;
}

function melhorPorPreco(a, b) {
  const precoA = Number(a.menor_preco);
  const precoB = Number(b.menor_preco);
  const temA = Number.isFinite(precoA);
  const temB = Number.isFinite(precoB);
  if (temA && temB && precoA !== precoB) return precoA - precoB;
  if (temA !== temB) return temA ? -1 : 1;
  return dataTimestamp(b.ultimo_preco && b.ultimo_preco.data) - dataTimestamp(a.ultimo_preco && a.ultimo_preco.data);
}

function juntarResultadosDuplicados(produtos) {
  const grupos = new Map();

  for (const produto of produtos || []) {
    const chave = chaveCanonicaProduto(produto) || `id:${produto._id || produto.id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(produto);
  }

  return [...grupos.values()].map((grupo) => {
    if (grupo.length === 1) return formatarProduto(grupo[0]);

    const ordenados = [...grupo].sort(melhorPorPreco);
    const baseProduto = produtoComMetadados(ordenados[0]);
    const formatados = grupo.map(formatarProduto);
    const menor = formatados
      .map((item) => Number(item.menor_preco))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    const ultimo = formatados
      .map((item) => item.ultimo_preco)
      .filter(Boolean)
      .sort((a, b) => dataTimestamp(b.data) - dataTimestamp(a.data))[0] || null;
    const imagem = productImageService.imagemDoProduto(baseProduto);

    return {
      ...formatarProduto(baseProduto),
      menor_preco: Number.isFinite(menor) ? menor : null,
      preco_unidade: precoPorMedida(Number.isFinite(menor) ? menor : null, baseProduto),
      confianca_preco: confiancaPreco(ultimo && ultimo.data),
      ultimo_preco: ultimo,
      imagem_url: imagem.url,
      imagem_credito: imagem.credito,
      duplicados_mesclados: grupo.length
    };
  }).sort((a, b) => melhorPorPreco(a, b));
}

function melhorLinhaMenorPreco(a, b) {
  const precoA = Number(a.valor);
  const precoB = Number(b.valor);
  const temA = Number.isFinite(precoA);
  const temB = Number.isFinite(precoB);
  if (temA && temB && precoA !== precoB) return precoA - precoB;
  if (temA !== temB) return temA ? -1 : 1;
  return dataTimestamp(b.data) - dataTimestamp(a.data);
}

function deduplicarLinhasMenoresPrecos(resultados) {
  const grupos = new Map();

  for (const resultado of resultados || []) {
    const chave = chaveCanonicaProduto(resultado.produto) || `id:${resultado._id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(resultado);
  }

  return [...grupos.values()]
    .map((grupo) => {
      const melhor = [...grupo].sort(melhorLinhaMenorPreco)[0];
      return { ...melhor, duplicados_mesclados: grupo.length };
    })
    .sort(melhorLinhaMenorPreco);
}

function formatarLinhaMenorPreco(resultado) {
  const produto = produtoComMetadados(resultado.produto);
  const imagem = productImageService.imagemDoProduto(produto);
  const estabelecimento = resultado.estabelecimento || null;

  return {
    produto_id: resultado._id,
    produto: displayFormatter.formatarNomeProduto(produto),
    categoria: produto.categoria,
    tipo: produto.tipo,
    marca: produto.marca,
    quantidade: produto.quantidade,
    imagem_url: imagem.url,
    imagem_credito: imagem.credito,
    valor: resultado.valor,
    preco_unidade: precoPorMedida(resultado.valor, produto),
    data: resultado.data,
    confianca_preco: confiancaPreco(resultado.data),
    duplicados_mesclados: resultado.duplicados_mesclados,
    estabelecimento_id: estabelecimento ? estabelecimento._id : null,
    estabelecimento: estabelecimento ? displayFormatter.formatarNomeEstabelecimento(estabelecimento.nome) : null,
    localizacao: estabelecimento &&
      estabelecimento.localizacao &&
      estabelecimento.localizacao.lat !== undefined &&
      estabelecimento.localizacao.lat !== null
      ? {
          lat: estabelecimento.localizacao.lat,
          lng: estabelecimento.localizacao.lng
        }
      : null
  };
}

function compactarHistoricoPreco(historico) {
  const porLocalEValor = new Map();

  for (const h of historico) {
    const estabelecimentoId = h.estabelecimento_id && h.estabelecimento_id._id
      ? String(h.estabelecimento_id._id)
      : String(h.estabelecimento_id || 'sem-local');
    const chave = `${estabelecimentoId}:${Number(h.valor).toFixed(2)}`;
    const observacoes = Number(h.observacoes) || 1;

    if (!porLocalEValor.has(chave)) {
      porLocalEValor.set(chave, {
        valor: h.valor,
        estabelecimento_id: estabelecimentoId === 'sem-local' ? null : estabelecimentoId,
        estabelecimento: h.estabelecimento_id && h.estabelecimento_id.nome
          ? displayFormatter.formatarNomeEstabelecimento(h.estabelecimento_id.nome)
          : null,
        data: h.data,
        observacoes
      });
      continue;
    }

    const atual = porLocalEValor.get(chave);
    atual.observacoes += observacoes;
    if (h.data && (!atual.data || h.data > atual.data)) {
      atual.data = h.data;
    }
  }

  return [...porLocalEValor.values()].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
}

function formatarAgregadoPreco(r) {
  if (!r) {
    return {
      media_preco: null,
      menor_preco: null,
      maior_preco: null,
      registros: 0,
      observacoes: 0
    };
  }

  return {
    media_preco: r.observacoes > 0 ? arredondar(r.soma_valor / r.observacoes) : null,
    menor_preco: arredondar(r.menor_preco),
    maior_preco: arredondar(r.maior_preco),
    registros: r.registros || 0,
    observacoes: r.observacoes || 0
  };
}

async function estatisticasPreco(produtoIds) {
  const ids = Array.isArray(produtoIds) ? produtoIds : [produtoIds];
  const filtroProduto = { produto_id: { $in: ids } };
  const pesoObservacoes = { $max: [{ $ifNull: ['$observacoes', 1] }, 1] };
  const valorPonderado = { $multiply: ['$valor', pesoObservacoes] };

  const [geral, porEstabelecimento] = await Promise.all([
    HistoricoPreco.aggregate([
      { $match: filtroProduto },
      {
        $group: {
          _id: null,
          soma_valor: { $sum: valorPonderado },
          observacoes: { $sum: pesoObservacoes },
          registros: { $sum: 1 },
          menor_preco: { $min: '$valor' },
          maior_preco: { $max: '$valor' }
        }
      }
    ]),
    HistoricoPreco.aggregate([
      { $match: filtroProduto },
      { $sort: { data: -1 } },
      {
        $group: {
          _id: '$estabelecimento_id',
          soma_valor: { $sum: valorPonderado },
          observacoes: { $sum: pesoObservacoes },
          registros: { $sum: 1 },
          menor_preco: { $min: '$valor' },
          maior_preco: { $max: '$valor' },
          ultimo_preco: { $first: '$valor' },
          ultima_data: { $first: '$data' }
        }
      },
      {
        $lookup: {
          from: 'estabelecimentos',
          localField: '_id',
          foreignField: '_id',
          as: 'estabelecimento'
        }
      },
      { $unwind: { path: '$estabelecimento', preserveNullAndEmptyArrays: true } },
      { $sort: { menor_preco: 1, ultima_data: -1 } },
      { $limit: 20 }
    ])
  ]);

  return {
    geral: formatarAgregadoPreco(geral[0]),
    por_estabelecimento: porEstabelecimento.map((r) => ({
      estabelecimento_id: r._id || null,
      estabelecimento: r.estabelecimento ? displayFormatter.formatarNomeEstabelecimento(r.estabelecimento.nome) : null,
      ...formatarAgregadoPreco(r),
      ultimo_preco: arredondar(r.ultimo_preco),
      ultima_data: r.ultima_data || null
    }))
  };
}

async function idsProdutosDuplicadosCanonicos(produto) {
  const chave = chaveCanonicaProduto(produto);
  if (!chave) return [produto._id];

  const meta = produtoComMetadados(produto);
  const query = {};
  if (meta.categoria) query.categoria = regexExato(meta.categoria);
  if (meta.tipo) query.tipo = regexExato(meta.tipo);
  if (meta.marca) query.marca = regexExato(meta.marca);
  if (meta.quantidade_normalizada) query.quantidade_normalizada = meta.quantidade_normalizada;

  const campos = 'nome nome_normalizado chave_dedup categoria tipo marca quantidade quantidade_normalizada menor_preco ultimo_preco criado_em';
  const consultas = [
    Produto.find({ chave_dedup: chave }).select(campos).limit(LIMITE_FALLBACK_FILTROS)
  ];

  if (Object.keys(query).length) {
    consultas.push(Produto.find(query).select(campos).limit(LIMITE_FALLBACK_FILTROS));
  }

  // Janela de compatibilidade para produtos antigos, antes de chave_dedup/metadados.
  consultas.push(
    Produto.find()
      .select(campos)
      .sort({ criado_em: -1 })
      .limit(LIMITE_FALLBACK_FILTROS)
  );

  const candidatos = mesclarProdutos(...(await Promise.all(consultas)));

  const ids = candidatos
    .filter((candidato) => chaveCanonicaProduto(candidato) === chave)
    .map((candidato) => candidato._id);

  return ids.length > 0 ? ids : [produto._id];
}

async function buscarProdutosSemNome(filtros) {
  const temFiltros = Object.keys(filtros).length > 0;
  if (!temFiltros) {
    return Produto.find()
      .sort({ nome: 1 })
      .limit(100)
      .populate('ultimo_preco.estabelecimento_id', 'nome');
  }

  const [diretos, candidatos] = await Promise.all([
    Produto.find(montarQueryProduto(filtros))
      .sort({ nome: 1 })
      .limit(100)
      .populate('ultimo_preco.estabelecimento_id', 'nome'),
    Produto.find()
      .sort({ criado_em: -1 })
      .limit(LIMITE_FALLBACK_FILTROS)
      .populate('ultimo_preco.estabelecimento_id', 'nome')
  ]);

  const inferidos = candidatos.filter((produto) => combinaFiltrosInferidos(produto, filtros));
  return mesclarProdutos(diretos, inferidos)
    .filter((produto) => combinaFiltrosInferidos(produto, filtros))
    .slice(0, 100);
}

// GET /api/produtos?nome=arroz&categoria=Alimentos&tipo=Arroz&marca=Tio%20João&quantidade=5kg
async function listar(req, res, next) {
  try {
    const cacheKey = chaveCache('produtos', req.query);
    const cached = obterCache(cacheKey);
    if (cached) return res.json(cached);

    const filtros = montarFiltros(req.query);
    let produtos;
    if (req.query.nome) {
      // Busca tolerante (acentos, caixa, ordem das palavras, tokens faltando)
      const encontrados = await productNormalizer.buscarProdutos(req.query.nome, filtros);
      const ids = encontrados.map((p) => p._id);
      const populados = await Produto.find({ _id: { $in: ids } })
        .populate('ultimo_preco.estabelecimento_id', 'nome');
      const porId = new Map(populados.map((p) => [String(p._id), p]));
      produtos = ids.map((id) => porId.get(String(id))).filter(Boolean); // mantém a ordem de relevância
    } else {
      produtos = await buscarProdutosSemNome(filtros);
    }

    const payload = { produtos: juntarResultadosDuplicados(produtos) };
    salvarCache(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/menores?limite=20&nome=arroz
// Ranking dos menores preços registrados, com o estabelecimento onde
// cada um foi encontrado (alimenta a barra lateral do mapa).
async function menores(req, res, next) {
  try {
    const cacheKey = chaveCache('produtos:menores', req.query);
    const cached = obterCache(cacheKey);
    if (cached) return res.json(cached);

    const limite = Math.min(Number(req.query.limite) || 20, 100);
    const filtros = montarFiltros(req.query);
    const temFiltros = Object.keys(filtros).length > 0;

    const pipeline = [
      { $sort: { valor: 1, data: -1 } },
      {
        $group: {
          _id: '$produto_id',
          valor: { $first: '$valor' },
          estabelecimento_id: { $first: '$estabelecimento_id' },
          data: { $first: '$data' }
        }
      },
      { $sort: { valor: 1 } },
      {
        $lookup: {
          from: 'produtos',
          localField: '_id',
          foreignField: '_id',
          as: 'produto'
        }
      },
      { $unwind: '$produto' }
    ];

    if (req.query.nome) {
      pipeline.push({
        $match: { 'produto.nome': { $regex: escapeRegex(req.query.nome), $options: 'i' } }
      });
    }
    const matchProduto = {};
    if (filtros.categoria) matchProduto['produto.categoria'] = regexExato(filtros.categoria);
    if (filtros.tipo) matchProduto['produto.tipo'] = regexExato(filtros.tipo);
    if (filtros.marca) matchProduto['produto.marca'] = regexExato(filtros.marca);
    if (filtros.quantidade) matchProduto['produto.quantidade'] = regexExato(filtros.quantidade);
    if (Object.keys(matchProduto).length > 0 && !temFiltros) pipeline.push({ $match: matchProduto });

    pipeline.push(
      { $limit: Math.min(Math.max(limite * 10, 100), 500) },
      {
        $lookup: {
          from: 'estabelecimentos',
          localField: 'estabelecimento_id',
          foreignField: '_id',
          as: 'estabelecimento'
        }
      },
      { $unwind: { path: '$estabelecimento', preserveNullAndEmptyArrays: true } }
    );

    const resultados = await HistoricoPreco.aggregate(pipeline);
    const resultadosFiltrados = temFiltros
      ? resultados.filter((r) => combinaFiltrosInferidos(r.produto, filtros))
      : resultados;
    const resultadosDeduplicados = deduplicarLinhasMenoresPrecos(resultadosFiltrados).slice(0, limite);

    const payload = {
      menores_precos: resultadosDeduplicados.map(formatarLinhaMenorPreco)
    };
    salvarCache(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/filtros?categoria=Limpeza&tipo=Detergente&marca=Ypê
async function filtros(req, res, next) {
  try {
    const cacheKey = chaveCache('produtos:filtros', req.query);
    const cached = obterCache(cacheKey);
    if (cached) return res.json(cached);

    const filtrosAtuais = montarFiltros(req.query);
    const produtos = await Produto.find()
      .select('nome nome_normalizado chave_dedup categoria tipo marca quantidade quantidade_normalizada criado_em')
      .sort({ criado_em: -1 })
      .limit(LIMITE_FALLBACK_FILTROS)
      .lean();
    const metas = produtos.map(metadadosProduto);

    const categorias = ordenarTexto([
      ...productNormalizer.CATEGORIAS.map((item) => item.categoria),
      ...metas.map((meta) => meta.categoria)
    ]);

    const tiposConhecidos = productNormalizer.TIPOS
      .filter((item) => !filtrosAtuais.categoria || textoIgual(item.categoria, filtrosAtuais.categoria))
      .map((item) => item.tipo);

    const tipos = ordenarTexto([
      ...tiposConhecidos,
      ...metas
        .filter((meta) => combinaFiltrosInferidos(meta, filtrosAtuais, 'tipo'))
        .map((meta) => meta.tipo)
    ]);

    const marcas = ordenarTexto(metas
      .filter((meta) => combinaFiltrosInferidos(meta, filtrosAtuais, 'marca'))
      .map((meta) => meta.marca));

    const quantidades = ordenarTexto(metas
      .filter((meta) => combinaFiltrosInferidos(meta, filtrosAtuais, 'quantidade'))
      .filter((meta) => meta.quantidade && quantidadeCompativelComFiltros(meta, filtrosAtuais))
      .map((meta) => meta.quantidade));

    const payload = { categorias, tipos, marcas, quantidades };
    salvarCache(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/sugestoes?termo=coca&categoria=Bebidas
async function sugestoes(req, res, next) {
  try {
    const cacheKey = chaveCache('produtos:sugestoes', req.query);
    const cached = obterCache(cacheKey);
    if (cached) return res.json(cached);

    const limite = Math.min(Number(req.query.limite) || 8, 20);
    const termo = String(req.query.termo || '').trim();
    const filtros = montarFiltros(req.query);

    let produtos = [];
    if (termo) {
      produtos = await productNormalizer.buscarProdutos(termo, filtros);
    } else {
      produtos = await buscarProdutosSemNome(filtros);
    }

    const payload = {
      sugestoes: juntarResultadosDuplicados(produtos).slice(0, limite)
    };
    salvarCache(cacheKey, payload);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/:id — detalhes + histórico completo de preços
async function detalhar(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const produto = await Produto.findById(req.params.id)
      .populate('ultimo_preco.estabelecimento_id', 'nome');
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const idsCanonicos = await idsProdutosDuplicadosCanonicos(produto);
    const produtosCanonicos = await Produto.find({ _id: { $in: idsCanonicos } });
    const [historico, estatisticas] = await Promise.all([
      HistoricoPreco.find({ produto_id: { $in: idsCanonicos } })
        .sort({ data: -1 })
        .populate('estabelecimento_id', 'nome'),
      estatisticasPreco(idsCanonicos)
    ]);
    const produtoNormalizado = produtoComMetadados(produto);
    const imagem = productImageService.imagemDoProduto(produtoNormalizado);
    const menorPrecoCanonico = produtosCanonicos
      .map((p) => Number(p.menor_preco))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    const ultimoProduto = produtosCanonicos
      .filter((p) => p.ultimo_preco && p.ultimo_preco.valor !== undefined && p.ultimo_preco.valor !== null)
      .sort((a, b) => dataTimestamp(b.ultimo_preco.data) - dataTimestamp(a.ultimo_preco.data))[0] || produto;
    if (ultimoProduto.ultimo_preco && ultimoProduto.ultimo_preco.estabelecimento_id) {
      await ultimoProduto.populate('ultimo_preco.estabelecimento_id', 'nome');
    }
    const ultimoPrecoValor = ultimoProduto.ultimo_preco ? ultimoProduto.ultimo_preco.valor : null;
    const ultimoPrecoData = ultimoProduto.ultimo_preco ? ultimoProduto.ultimo_preco.data : null;

    return res.json({
      id: produto._id,
      nome: displayFormatter.formatarNomeProduto(produtoNormalizado),
      categoria: produtoNormalizado.categoria,
      tipo: produtoNormalizado.tipo,
      marca: produtoNormalizado.marca,
      quantidade: produtoNormalizado.quantidade,
      imagem_url: imagem.url,
      imagem_credito: imagem.credito,
      menor_preco: Number.isFinite(menorPrecoCanonico) ? menorPrecoCanonico : produto.menor_preco,
      preco_unidade: precoPorMedida(Number.isFinite(menorPrecoCanonico) ? menorPrecoCanonico : produto.menor_preco, produtoNormalizado),
      confianca_preco: confiancaPreco(ultimoPrecoData),
      ultimo_preco: ultimoPrecoValor,
      ultimo_preco_unidade: precoPorMedida(ultimoPrecoValor, produtoNormalizado),
      duplicados_mesclados: idsCanonicos.length,
      ultimo_preco_info: ultimoProduto.ultimo_preco && ultimoProduto.ultimo_preco.valor !== undefined && ultimoProduto.ultimo_preco.valor !== null
        ? {
            valor: ultimoProduto.ultimo_preco.valor,
            data: ultimoProduto.ultimo_preco.data,
            preco_unidade: precoPorMedida(ultimoProduto.ultimo_preco.valor, produtoNormalizado),
            confianca_preco: confiancaPreco(ultimoProduto.ultimo_preco.data),
            estabelecimento: ultimoProduto.ultimo_preco.estabelecimento_id
              ? displayFormatter.formatarNomeEstabelecimento(ultimoProduto.ultimo_preco.estabelecimento_id.nome)
              : null
          }
        : null,
      estatisticas,
      historico: compactarHistoricoPreco(historico)
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/produtos
async function criar(req, res, next) {
  try {
    const { nome, categoria, tipo, marca, quantidade, imagem_url, imagem_credito } = req.body || {};
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Campo obrigatório: nome' });
    }

    const quantidadeLimpa = quantidade !== undefined ? String(quantidade || '').trim() || null : null;
    const textoAnalise = quantidadeLimpa ? `${nome} ${quantidadeLimpa}` : nome;
    const analise = productNormalizer.analisarProduto(textoAnalise, { categoria, tipo, marca });
    const nomeExibicao = productNormalizer.formatarNomeProduto(nome, analise);
    const produto = await Produto.create({
      nome: nomeExibicao,
      nome_normalizado: productNormalizer.normalizarTexto(nomeExibicao),
      chave_dedup: analise.confiavel ? analise.chave : null,
      categoria: analise.categoria,
      tipo: analise.tipo,
      marca: analise.marca,
      quantidade: quantidadeLimpa || analise.quantidade,
      quantidade_normalizada: analise.quantidade_normalizada,
      imagem_url: imagemUrlSegura(imagem_url),
      imagem_credito: imagem_credito || null
    });
    limparCache();
    await registrarAdminAudit(req, {
      acao: 'produto.criar',
      alvo_tipo: 'produto',
      alvo_id: produto._id,
      resumo: `Produto criado: ${produto.nome}`,
      dados: { nome: produto.nome, categoria: produto.categoria, tipo: produto.tipo, marca: produto.marca }
    });
    return res.status(201).json(formatarProduto(produto));
  } catch (err) {
    return next(err);
  }
}

// PUT /api/produtos/:id
async function atualizar(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const produtoAtual = await Produto.findById(req.params.id);
    if (!produtoAtual) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const { nome, categoria, tipo, marca, quantidade, imagem_url, imagem_credito } = req.body || {};
    const atualizacao = {};
    if (nome !== undefined || quantidade !== undefined) {
      const nomeBase = nome !== undefined ? nome : produtoAtual.nome;
      if (!nomeBase || !String(nomeBase).trim()) {
        return res.status(400).json({ error: 'Nome não pode ser vazio' });
      }

      const quantidadeLimpa = quantidade !== undefined ? String(quantidade || '').trim() || null : produtoAtual.quantidade;
      const textoAnalise = quantidadeLimpa ? `${nomeBase} ${quantidadeLimpa}` : nomeBase;
      const analise = productNormalizer.analisarProduto(textoAnalise, {
        categoria: categoria !== undefined ? categoria : produtoAtual.categoria,
        tipo: tipo !== undefined ? tipo : produtoAtual.tipo,
        marca: marca !== undefined ? marca : produtoAtual.marca
      });
      const nomeExibicao = productNormalizer.formatarNomeProduto(nomeBase, analise);
      atualizacao.nome = nomeExibicao;
      atualizacao.nome_normalizado = productNormalizer.normalizarTexto(nomeExibicao);
      atualizacao.chave_dedup = analise.confiavel ? analise.chave : null;
      if (categoria === undefined) atualizacao.categoria = analise.categoria;
      if (tipo === undefined) atualizacao.tipo = analise.tipo;
      if (marca === undefined) atualizacao.marca = analise.marca;
      atualizacao.quantidade = quantidadeLimpa || analise.quantidade;
      atualizacao.quantidade_normalizada = analise.quantidade_normalizada;
    }
    if (categoria !== undefined) atualizacao.categoria = categoria || null;
    if (tipo !== undefined) atualizacao.tipo = tipo || null;
    if (marca !== undefined) atualizacao.marca = marca || null;
    if (imagem_url !== undefined) atualizacao.imagem_url = imagemUrlSegura(imagem_url);
    if (imagem_credito !== undefined) atualizacao.imagem_credito = imagem_credito || null;

    const produto = await Produto.findByIdAndUpdate(req.params.id, atualizacao, { new: true });
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    limparCache();
    await registrarAdminAudit(req, {
      acao: 'produto.atualizar',
      alvo_tipo: 'produto',
      alvo_id: produto._id,
      resumo: `Produto atualizado: ${produto.nome}`,
      dados: { campos: Object.keys(atualizacao) }
    });
    return res.json(formatarProduto(produto));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/produtos/:id
async function remover(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const produto = await Produto.findByIdAndDelete(req.params.id);
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    await HistoricoPreco.deleteMany({ produto_id: produto._id });
    limparCache();
    await registrarAdminAudit(req, {
      acao: 'produto.remover',
      alvo_tipo: 'produto',
      alvo_id: produto._id,
      resumo: `Produto removido: ${produto.nome}`,
      dados: { nome: produto.nome }
    });
    return res.json({ message: 'Produto removido' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, menores, filtros, sugestoes, detalhar, criar, atualizar, remover, limparCache };
