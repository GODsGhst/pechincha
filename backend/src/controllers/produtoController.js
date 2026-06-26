const mongoose = require('mongoose');
const Produto = require('../models/Produto');
const HistoricoPreco = require('../models/HistoricoPreco');
const productNormalizer = require('../services/productNormalizer');
const productImageService = require('../services/productImageService');

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

function arredondar(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
  return Number(Number(valor).toFixed(2));
}

function formatarProduto(p) {
  const imagem = productImageService.imagemDoProduto(p);
  return {
    id: p._id,
    nome: p.nome,
    categoria: p.categoria || null,
    tipo: p.tipo || null,
    marca: p.marca || null,
    quantidade: p.quantidade || null,
    imagem_url: imagem.url,
    imagem_credito: imagem.credito,
    menor_preco: p.menor_preco,
    ultimo_preco: p.ultimo_preco && p.ultimo_preco.valor !== undefined && p.ultimo_preco.valor !== null
      ? {
          valor: p.ultimo_preco.valor,
          data: p.ultimo_preco.data,
          estabelecimento: p.ultimo_preco.estabelecimento_id ? p.ultimo_preco.estabelecimento_id.nome : null
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
        estabelecimento: h.estabelecimento_id && h.estabelecimento_id.nome ? h.estabelecimento_id.nome : null,
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
      estabelecimento: r.estabelecimento ? r.estabelecimento.nome : null,
      ...formatarAgregadoPreco(r),
      ultimo_preco: arredondar(r.ultimo_preco),
      ultima_data: r.ultima_data || null
    }))
  };
}

// GET /api/produtos?nome=arroz&categoria=Alimentos&tipo=Arroz&marca=Tio%20João&quantidade=5kg
async function listar(req, res, next) {
  try {
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
      produtos = await Produto.find(montarQueryProduto(filtros))
        .sort({ nome: 1 })
        .limit(100)
        .populate('ultimo_preco.estabelecimento_id', 'nome');
    }

    return res.json({ produtos: produtos.map(formatarProduto) });
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/menores?limite=20&nome=arroz
// Ranking dos menores preços registrados, com o estabelecimento onde
// cada um foi encontrado (alimenta a barra lateral do mapa).
async function menores(req, res, next) {
  try {
    const limite = Math.min(Number(req.query.limite) || 20, 100);
    const filtros = montarFiltros(req.query);

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
    if (Object.keys(matchProduto).length > 0) pipeline.push({ $match: matchProduto });

    pipeline.push(
      { $limit: limite },
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

    return res.json({
      menores_precos: resultados.map((r) => {
        const imagem = productImageService.imagemDoProduto(r.produto);
        return {
          produto_id: r._id,
          produto: r.produto.nome,
          categoria: r.produto.categoria || null,
          tipo: r.produto.tipo || null,
          marca: r.produto.marca || null,
          quantidade: r.produto.quantidade || null,
          imagem_url: imagem.url,
          imagem_credito: imagem.credito,
          valor: r.valor,
          data: r.data,
          estabelecimento_id: r.estabelecimento ? r.estabelecimento._id : null,
          estabelecimento: r.estabelecimento ? r.estabelecimento.nome : null,
          localizacao: r.estabelecimento && r.estabelecimento.localizacao &&
            r.estabelecimento.localizacao.lat !== undefined && r.estabelecimento.localizacao.lat !== null
            ? { lat: r.estabelecimento.localizacao.lat, lng: r.estabelecimento.localizacao.lng }
            : null
        };
      })
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/filtros?categoria=Limpeza&tipo=Detergente&marca=Ypê
async function filtros(req, res, next) {
  try {
    const filtrosAtuais = montarFiltros(req.query);
    const base = montarQueryProduto(filtrosAtuais);
    const baseSemQuantidade = { ...base };
    delete baseSemQuantidade.quantidade;

    const [categorias, tipos, marcas, quantidades] = await Promise.all([
      Produto.distinct('categoria', { categoria: { $nin: [null, ''] } }),
      Produto.distinct('tipo', { ...base, tipo: { $nin: [null, ''] } }),
      Produto.distinct('marca', { ...base, marca: { $nin: [null, ''] } }),
      Produto.distinct('quantidade', { ...baseSemQuantidade, quantidade: { $nin: [null, ''] } })
    ]);

    return res.json({
      categorias: categorias.filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      tipos: tipos.filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      marcas: marcas.filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      quantidades: quantidades.filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/produtos/sugestoes?termo=coca&categoria=Bebidas
async function sugestoes(req, res, next) {
  try {
    const limite = Math.min(Number(req.query.limite) || 8, 20);
    const termo = String(req.query.termo || '').trim();
    const filtros = montarFiltros(req.query);

    let produtos = [];
    if (termo) {
      produtos = await productNormalizer.buscarProdutos(termo, filtros);
    } else {
      produtos = await Produto.find(montarQueryProduto(filtros)).sort({ nome: 1 }).limit(limite);
    }

    return res.json({
      sugestoes: produtos.slice(0, limite).map(formatarProduto)
    });
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

    const produto = await Produto.findById(req.params.id);
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const [historico, estatisticas] = await Promise.all([
      HistoricoPreco.find({ produto_id: produto._id })
        .sort({ data: -1 })
        .populate('estabelecimento_id', 'nome'),
      estatisticasPreco(produto._id)
    ]);
    const imagem = productImageService.imagemDoProduto(produto);

    return res.json({
      id: produto._id,
      nome: produto.nome,
      categoria: produto.categoria || null,
      tipo: produto.tipo || null,
      marca: produto.marca || null,
      quantidade: produto.quantidade || null,
      imagem_url: imagem.url,
      imagem_credito: imagem.credito,
      menor_preco: produto.menor_preco,
      ultimo_preco: produto.ultimo_preco ? produto.ultimo_preco.valor : null,
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
    const { nome, categoria, tipo, marca, imagem_url, imagem_credito } = req.body || {};
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Campo obrigatório: nome' });
    }

    const analise = productNormalizer.analisarProduto(nome, { categoria, tipo, marca });
    const nomeExibicao = productNormalizer.formatarNomeProduto(nome, analise);
    const produto = await Produto.create({
      nome: nomeExibicao,
      nome_normalizado: productNormalizer.normalizarTexto(nomeExibicao),
      chave_dedup: analise.confiavel ? analise.chave : null,
      categoria: analise.categoria,
      tipo: analise.tipo,
      marca: analise.marca,
      quantidade: analise.quantidade,
      quantidade_normalizada: analise.quantidade_normalizada,
      imagem_url: imagem_url || null,
      imagem_credito: imagem_credito || null
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

    const { nome, categoria, tipo, marca, imagem_url, imagem_credito } = req.body || {};
    const atualizacao = {};
    if (nome !== undefined) {
      if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome não pode ser vazio' });
      }
      const analise = productNormalizer.analisarProduto(nome, { categoria, tipo, marca });
      const nomeExibicao = productNormalizer.formatarNomeProduto(nome, analise);
      atualizacao.nome = nomeExibicao;
      atualizacao.nome_normalizado = productNormalizer.normalizarTexto(nomeExibicao);
      atualizacao.chave_dedup = analise.confiavel ? analise.chave : null;
      if (categoria === undefined) atualizacao.categoria = analise.categoria;
      if (tipo === undefined) atualizacao.tipo = analise.tipo;
      if (marca === undefined) atualizacao.marca = analise.marca;
      atualizacao.quantidade = analise.quantidade;
      atualizacao.quantidade_normalizada = analise.quantidade_normalizada;
    }
    if (categoria !== undefined) atualizacao.categoria = categoria;
    if (tipo !== undefined) atualizacao.tipo = tipo;
    if (marca !== undefined) atualizacao.marca = marca;
    if (imagem_url !== undefined) atualizacao.imagem_url = imagem_url || null;
    if (imagem_credito !== undefined) atualizacao.imagem_credito = imagem_credito || null;

    const produto = await Produto.findByIdAndUpdate(req.params.id, atualizacao, { new: true });
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

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
    return res.json({ message: 'Produto removido' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, menores, filtros, sugestoes, detalhar, criar, atualizar, remover };
