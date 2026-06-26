const mongoose = require('mongoose');
const Produto = require('../models/Produto');
const HistoricoPreco = require('../models/HistoricoPreco');
const productNormalizer = require('../services/productNormalizer');
const productImageService = require('../services/productImageService');
const displayFormatter = require('../services/displayFormatter');
const pricePresentation = require('../services/pricePresentationService');

const CACHE_TTL_MS = 20 * 1000;
const CACHE_MAX = 120;
const LIMITE_FALLBACK_FILTROS = 1000;
const cacheRespostas = new Map();

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
  const item = cacheRespostas.get(chave);
  if (!item) return null;
  if (Date.now() - item.criadoEm > CACHE_TTL_MS) {
    cacheRespostas.delete(chave);
    return null;
  }
  return item.valor;
}

function salvarCache(chave, valor) {
  if (cacheRespostas.size >= CACHE_MAX) {
    const [primeira] = cacheRespostas.keys();
    cacheRespostas.delete(primeira);
  }
  cacheRespostas.set(chave, { valor, criadoEm: Date.now() });
}

function limparCache() {
  cacheRespostas.clear();
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
  ['leite', ['ml']],
  ['detergente', ['ml']],
  ['amaciante', ['ml']],
  ['desinfetante', ['ml']],
  ['agua sanitaria', ['ml']],
  ['limpa aluminio', ['ml']],
  ['limpador', ['ml']],
  ['sabao', ['g', 'ml']],
  ['esponja', ['un']],
  ['papel higienico', ['un']],
  ['sabonete', ['g', 'un']],
  ['shampoo', ['ml']],
  ['condicionador', ['ml']],
  ['creme dental', ['g']],
  ['desodorante', ['ml', 'g']],
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
  ['carne', ['g']],
  ['frango', ['g']],
  ['linguica', ['g']],
  ['banana', ['g', 'un']],
  ['tomate', ['g', 'un']],
  ['cebola', ['g', 'un']],
  ['batata', ['g', 'un']],
  ['alface', ['g', 'un']]
]);

const UNIDADES_POR_CATEGORIA = new Map([
  ['bebidas', ['ml']],
  ['acougue', ['g']]
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

async function estatisticasPreco(produtoId) {
  const pesoObservacoes = { $max: [{ $ifNull: ['$observacoes', 1] }, 1] };
  const valorPonderado = { $multiply: ['$valor', pesoObservacoes] };

  const [geral, porEstabelecimento] = await Promise.all([
    HistoricoPreco.aggregate([
      { $match: { produto_id: produtoId } },
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
      { $match: { produto_id: produtoId } },
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

    const payload = { produtos: produtos.map(formatarProduto) };
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
      { $limit: temFiltros ? Math.min(Math.max(limite * 10, 100), 500) : limite },
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
      ? resultados.filter((r) => combinaFiltrosInferidos(r.produto, filtros)).slice(0, limite)
      : resultados;

    const payload = {
      menores_precos: resultadosFiltrados.map((r) => {
        const produto = produtoComMetadados(r.produto);
        const imagem = productImageService.imagemDoProduto(produto);
        return {
          produto_id: r._id,
          produto: displayFormatter.formatarNomeProduto(produto),
          categoria: produto.categoria,
          tipo: produto.tipo,
          marca: produto.marca,
          quantidade: produto.quantidade,
          imagem_url: imagem.url,
          imagem_credito: imagem.credito,
          valor: r.valor,
          preco_unidade: precoPorMedida(r.valor, produto),
          data: r.data,
          confianca_preco: confiancaPreco(r.data),
          estabelecimento_id: r.estabelecimento ? r.estabelecimento._id : null,
          estabelecimento: r.estabelecimento ? displayFormatter.formatarNomeEstabelecimento(r.estabelecimento.nome) : null,
          localizacao: r.estabelecimento && r.estabelecimento.localizacao &&
            r.estabelecimento.localizacao.lat !== undefined && r.estabelecimento.localizacao.lat !== null
            ? { lat: r.estabelecimento.localizacao.lat, lng: r.estabelecimento.localizacao.lng }
            : null
        };
      })
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
      sugestoes: produtos.slice(0, limite).map(formatarProduto)
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

    const [historico, estatisticas] = await Promise.all([
      HistoricoPreco.find({ produto_id: produto._id })
        .sort({ data: -1 })
        .populate('estabelecimento_id', 'nome'),
      estatisticasPreco(produto._id)
    ]);
    const produtoNormalizado = produtoComMetadados(produto);
    const imagem = productImageService.imagemDoProduto(produtoNormalizado);
    const ultimoPrecoValor = produto.ultimo_preco ? produto.ultimo_preco.valor : null;
    const ultimoPrecoData = produto.ultimo_preco ? produto.ultimo_preco.data : null;

    return res.json({
      id: produto._id,
      nome: displayFormatter.formatarNomeProduto(produtoNormalizado),
      categoria: produtoNormalizado.categoria,
      tipo: produtoNormalizado.tipo,
      marca: produtoNormalizado.marca,
      quantidade: produtoNormalizado.quantidade,
      imagem_url: imagem.url,
      imagem_credito: imagem.credito,
      menor_preco: produto.menor_preco,
      preco_unidade: precoPorMedida(produto.menor_preco, produtoNormalizado),
      confianca_preco: confiancaPreco(ultimoPrecoData),
      ultimo_preco: ultimoPrecoValor,
      ultimo_preco_unidade: precoPorMedida(ultimoPrecoValor, produtoNormalizado),
      ultimo_preco_info: produto.ultimo_preco && produto.ultimo_preco.valor !== undefined && produto.ultimo_preco.valor !== null
        ? {
            valor: produto.ultimo_preco.valor,
            data: produto.ultimo_preco.data,
            preco_unidade: precoPorMedida(produto.ultimo_preco.valor, produtoNormalizado),
            confianca_preco: confiancaPreco(produto.ultimo_preco.data),
            estabelecimento: produto.ultimo_preco.estabelecimento_id
              ? displayFormatter.formatarNomeEstabelecimento(produto.ultimo_preco.estabelecimento_id.nome)
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
      imagem_url: imagem_url || null,
      imagem_credito: imagem_credito || null
    });
    limparCache();
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
    if (imagem_url !== undefined) atualizacao.imagem_url = imagem_url || null;
    if (imagem_credito !== undefined) atualizacao.imagem_credito = imagem_credito || null;

    const produto = await Produto.findByIdAndUpdate(req.params.id, atualizacao, { new: true });
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    limparCache();
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
    return res.json({ message: 'Produto removido' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, menores, filtros, sugestoes, detalhar, criar, atualizar, remover };
