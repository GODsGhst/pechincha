const mongoose = require('mongoose');
const Estabelecimento = require('../models/Estabelecimento');
const HistoricoPreco = require('../models/HistoricoPreco');
const { geocodificarEndereco } = require('../services/geoService');
const displayFormatter = require('../services/displayFormatter');

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function formatar(e) {
  return {
    id: e._id,
    nome: displayFormatter.formatarNomeEstabelecimento(e.nome),
    cnpj: e.cnpj,
    endereco: displayFormatter.formatarEndereco(e.endereco),
    localizacao: e.localizacao && e.localizacao.lat !== undefined && e.localizacao.lat !== null
      ? { lat: e.localizacao.lat, lng: e.localizacao.lng }
      : null
  };
}

function temLocalizacao(e) {
  return e.localizacao && e.localizacao.lat !== undefined && e.localizacao.lat !== null;
}

function geocodificarPendentesEmSegundoPlano(estabelecimentos) {
  const pendentes = estabelecimentos
    .filter((e) => e.endereco && !temLocalizacao(e))
    .slice(0, 5);

  if (pendentes.length === 0) return;

  Promise.allSettled(pendentes.map(async (e) => {
    const coords = await geocodificarEndereco(e.endereco);
    if (!coords) return;
    await Estabelecimento.updateOne(
      {
        _id: e._id,
        $or: [
          { 'localizacao.lat': { $exists: false } },
          { 'localizacao.lat': null }
        ]
      },
      { $set: { localizacao: coords } }
    );
  })).catch(() => {});
}

// GET /api/estabelecimentos
async function listar(_req, res, next) {
  try {
    const estabelecimentos = await Estabelecimento.find().sort({ nome: 1 });
    return res.json({ estabelecimentos: estabelecimentos.map(formatar) });
  } catch (err) {
    return next(err);
  }
}

// GET /api/estabelecimentos/mapa
// Estabelecimentos com coordenadas + estatísticas para os marcadores do mapa:
// total de preços registrados, produtos distintos, última atividade e
// quantos produtos têm o MENOR preço naquele local.
async function mapa(_req, res, next) {
  try {
    const estabelecimentos = await Estabelecimento.find();
    geocodificarPendentesEmSegundoPlano(estabelecimentos);

    // Estatísticas gerais por estabelecimento
    const stats = await HistoricoPreco.aggregate([
      {
        $group: {
          _id: '$estabelecimento_id',
          total_registros: { $sum: 1 },
          produtos: { $addToSet: '$produto_id' },
          ultima_atividade: { $max: '$data' }
        }
      }
    ]);

    // Para cada produto, encontra o registro mais barato e conta por estabelecimento
    const menores = await HistoricoPreco.aggregate([
      { $sort: { valor: 1, data: -1 } },
      {
        $group: {
          _id: '$produto_id',
          estabelecimento_id: { $first: '$estabelecimento_id' }
        }
      },
      {
        $group: {
          _id: '$estabelecimento_id',
          produtos_mais_baratos: { $sum: 1 }
        }
      }
    ]);

    const statsPorId = new Map(stats.map((s) => [String(s._id), s]));
    const menoresPorId = new Map(menores.map((m) => [String(m._id), m.produtos_mais_baratos]));

    return res.json({
      estabelecimentos: estabelecimentos.map((e) => {
        const s = statsPorId.get(String(e._id));
        return {
          ...formatar(e),
          total_precos_registrados: s ? s.total_registros : 0,
          produtos_distintos: s ? s.produtos.length : 0,
          produtos_mais_baratos: menoresPorId.get(String(e._id)) || 0,
          ultima_atividade: s ? s.ultima_atividade : null
        };
      })
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/estabelecimentos/:id/historico?produto_id=...
// Série temporal de preços do estabelecimento (para o gráfico de evolução).
async function historico(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const estabelecimento = await Estabelecimento.findById(req.params.id);
    if (!estabelecimento) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    }

    const filtro = { estabelecimento_id: estabelecimento._id };
    if (req.query.produto_id) {
      if (!idValido(req.query.produto_id)) {
        return res.status(400).json({ error: 'produto_id inválido' });
      }
      filtro.produto_id = req.query.produto_id;
    }

    const registros = await HistoricoPreco.find(filtro)
      .sort({ data: 1 })
      .populate('produto_id', 'nome');

    return res.json({
      estabelecimento: formatar(estabelecimento),
      historico: registros.map((r) => ({
        produto_id: r.produto_id ? r.produto_id._id : null,
        produto: r.produto_id ? r.produto_id.nome : null,
        valor: r.valor,
        data: r.data
      }))
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/estabelecimentos/:id
async function detalhar(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const estabelecimento = await Estabelecimento.findById(req.params.id);
    if (!estabelecimento) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    }

    return res.json(formatar(estabelecimento));
  } catch (err) {
    return next(err);
  }
}

// POST /api/estabelecimentos
async function criar(req, res, next) {
  try {
    const { nome, cnpj, endereco, localizacao } = req.body || {};
    if (!nome || !cnpj) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, cnpj' });
    }

    const cnpjLimpo = String(cnpj).replace(/[^\d]/g, '');
    if (cnpjLimpo.length !== 14) {
      return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
    }

    const jaExiste = await Estabelecimento.findOne({ cnpj: cnpjLimpo });
    if (jaExiste) {
      return res.status(409).json({ error: 'CNPJ já cadastrado' });
    }

    // Usa coordenadas enviadas ou tenta geocodificar o endereço
    let coords = null;
    if (localizacao && typeof localizacao.lat === 'number' && typeof localizacao.lng === 'number') {
      coords = { lat: localizacao.lat, lng: localizacao.lng };
    } else if (endereco) {
      coords = await geocodificarEndereco(endereco);
    }

    const estabelecimento = await Estabelecimento.create({
      nome,
      cnpj: cnpjLimpo,
      endereco,
      localizacao: coords || undefined
    });
    return res.status(201).json(formatar(estabelecimento));
  } catch (err) {
    return next(err);
  }
}

// PUT /api/estabelecimentos/:id
async function atualizar(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { nome, endereco, localizacao } = req.body || {};
    const atualizacao = {};
    if (nome !== undefined) {
      if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome não pode ser vazio' });
      }
      atualizacao.nome = nome.trim();
    }
    if (endereco !== undefined) atualizacao.endereco = endereco;
    if (localizacao !== undefined) {
      if (localizacao === null) {
        atualizacao.localizacao = null;
      } else if (typeof localizacao.lat === 'number' && typeof localizacao.lng === 'number') {
        atualizacao.localizacao = { lat: localizacao.lat, lng: localizacao.lng };
      } else {
        return res.status(400).json({ error: 'localizacao deve ter lat e lng numéricos' });
      }
    }

    const estabelecimento = await Estabelecimento.findByIdAndUpdate(req.params.id, atualizacao, { new: true });
    if (!estabelecimento) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    }

    return res.json(formatar(estabelecimento));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/estabelecimentos/:id
async function remover(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const estabelecimento = await Estabelecimento.findByIdAndDelete(req.params.id);
    if (!estabelecimento) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    }

    return res.json({ message: 'Estabelecimento removido' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, mapa, historico, detalhar, criar, atualizar, remover };
