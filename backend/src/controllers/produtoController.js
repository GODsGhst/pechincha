const mongoose = require('mongoose');
const Produto = require('../models/Produto');
const HistoricoPreco = require('../models/HistoricoPreco');
const productNormalizer = require('../services/productNormalizer');

function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/produtos?nome=arroz
async function listar(req, res, next) {
  try {
    let produtos;
    if (req.query.nome) {
      // Busca tolerante (acentos, caixa, ordem das palavras, tokens faltando)
      const encontrados = await productNormalizer.buscarProdutos(req.query.nome);
      const ids = encontrados.map((p) => p._id);
      const populados = await Produto.find({ _id: { $in: ids } })
        .populate('ultimo_preco.estabelecimento_id', 'nome');
      const porId = new Map(populados.map((p) => [String(p._id), p]));
      produtos = ids.map((id) => porId.get(String(id))).filter(Boolean); // mantém a ordem de relevância
    } else {
      produtos = await Produto.find()
        .sort({ nome: 1 })
        .populate('ultimo_preco.estabelecimento_id', 'nome');
    }

    return res.json({
      produtos: produtos.map((p) => ({
        id: p._id,
        nome: p.nome,
        categoria: p.categoria || null,
        menor_preco: p.menor_preco,
        ultimo_preco: p.ultimo_preco && p.ultimo_preco.valor !== undefined && p.ultimo_preco.valor !== null
          ? {
              valor: p.ultimo_preco.valor,
              data: p.ultimo_preco.data,
              estabelecimento: p.ultimo_preco.estabelecimento_id ? p.ultimo_preco.estabelecimento_id.nome : null
            }
          : null
      }))
    });
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
      menores_precos: resultados.map((r) => ({
        produto_id: r._id,
        produto: r.produto.nome,
        valor: r.valor,
        data: r.data,
        estabelecimento_id: r.estabelecimento ? r.estabelecimento._id : null,
        estabelecimento: r.estabelecimento ? r.estabelecimento.nome : null,
        localizacao: r.estabelecimento && r.estabelecimento.localizacao &&
          r.estabelecimento.localizacao.lat !== undefined && r.estabelecimento.localizacao.lat !== null
          ? { lat: r.estabelecimento.localizacao.lat, lng: r.estabelecimento.localizacao.lng }
          : null
      }))
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

    const historico = await HistoricoPreco.find({ produto_id: produto._id })
      .sort({ data: -1 })
      .populate('estabelecimento_id', 'nome');

    return res.json({
      id: produto._id,
      nome: produto.nome,
      categoria: produto.categoria || null,
      menor_preco: produto.menor_preco,
      ultimo_preco: produto.ultimo_preco ? produto.ultimo_preco.valor : null,
      historico: historico.map((h) => ({
        valor: h.valor,
        estabelecimento: h.estabelecimento_id ? h.estabelecimento_id.nome : null,
        data: h.data
      }))
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/produtos
async function criar(req, res, next) {
  try {
    const { nome, categoria } = req.body || {};
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Campo obrigatório: nome' });
    }

    const produto = await Produto.create({ nome: nome.trim(), categoria });
    return res.status(201).json({ id: produto._id, nome: produto.nome, categoria: produto.categoria || null });
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

    const { nome, categoria } = req.body || {};
    const atualizacao = {};
    if (nome !== undefined) {
      if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome não pode ser vazio' });
      }
      atualizacao.nome = nome.trim();
    }
    if (categoria !== undefined) atualizacao.categoria = categoria;

    const produto = await Produto.findByIdAndUpdate(req.params.id, atualizacao, { new: true });
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    return res.json({ id: produto._id, nome: produto.nome, categoria: produto.categoria || null });
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

module.exports = { listar, menores, detalhar, criar, atualizar, remover };
