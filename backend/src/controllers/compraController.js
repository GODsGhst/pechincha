const mongoose = require('mongoose');
const Compra = require('../models/Compra');
const Estabelecimento = require('../models/Estabelecimento');
const Produto = require('../models/Produto');
const compraService = require('../services/compraService');
const displayFormatter = require('../services/displayFormatter');

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function formatar(compra) {
  return {
    id: compra._id,
    estabelecimento: compra.estabelecimento_id && compra.estabelecimento_id.nome
      ? displayFormatter.formatarNomeEstabelecimento(compra.estabelecimento_id.nome)
      : compra.estabelecimento_id,
    data_compra: compra.data_compra,
    valor_total: compra.valor_total,
    nfce_url: compra.nfce_url || null,
    itens: compra.itens.map((i) => ({
      produto_id: i.produto_id && i.produto_id.nome ? i.produto_id._id : i.produto_id,
      produto: i.produto_id && i.produto_id.nome ? displayFormatter.formatarNomeProduto(i.produto_id) : null,
      categoria: i.produto_id && i.produto_id.categoria ? i.produto_id.categoria : null,
      tipo: i.produto_id && i.produto_id.tipo ? i.produto_id.tipo : null,
      marca: i.produto_id && i.produto_id.marca ? i.produto_id.marca : null,
      quantidade_produto: i.produto_id && i.produto_id.quantidade ? i.produto_id.quantidade : null,
      nome_original: i.nome_original ? displayFormatter.formatarNomeProduto(i.nome_original) : null,
      quantidade: i.quantidade,
      valor_unitario: i.valor_unitario,
      valor_total: i.valor_total
    }))
  };
}

// GET /api/compras — compras do usuário autenticado
async function listar(req, res, next) {
  try {
    const compras = await Compra.find({ usuario_id: req.usuario.id })
      .sort({ data_compra: -1 })
      .populate('estabelecimento_id', 'nome')
      .populate('itens.produto_id', 'nome categoria tipo marca quantidade');

    return res.json({ compras: compras.map(formatar) });
  } catch (err) {
    return next(err);
  }
}

// GET /api/compras/:id
async function detalhar(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const compra = await Compra.findOne({ _id: req.params.id, usuario_id: req.usuario.id })
      .populate('estabelecimento_id', 'nome')
      .populate('itens.produto_id', 'nome categoria tipo marca quantidade');

    if (!compra) {
      return res.status(404).json({ error: 'Compra não encontrada' });
    }

    return res.json(formatar(compra));
  } catch (err) {
    return next(err);
  }
}

// POST /api/compras — registro manual de compra
async function criar(req, res, next) {
  try {
    const { estabelecimento_id, data_compra, itens, nfce_url } = req.body || {};

    if (!estabelecimento_id || !data_compra || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Campos obrigatórios: estabelecimento_id, data_compra, itens (não vazio)' });
    }
    if (!idValido(estabelecimento_id)) {
      return res.status(400).json({ error: 'estabelecimento_id inválido' });
    }

    const estabelecimento = await Estabelecimento.findById(estabelecimento_id);
    if (!estabelecimento) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    }

    const data = new Date(data_compra);
    if (Number.isNaN(data.getTime())) {
      return res.status(400).json({ error: 'data_compra inválida' });
    }

    // Cada item precisa de nome (cria/associa produto) ou produto_id direto
    const itensValidados = [];
    const contextoProdutos = compraService.criarContextoProdutos();
    for (const item of itens) {
      const { nome, produto_id, quantidade, valor_unitario } = item || {};
      const qtd = Number(quantidade);
      const unit = Number(valor_unitario);

      if ((!nome && !produto_id) || !qtd || qtd <= 0 || !unit || unit <= 0) {
        return res.status(400).json({
          error: 'Cada item precisa de nome (ou produto_id), quantidade > 0 e valor_unitario > 0'
        });
      }

      let produto;
      let novo = false;
      if (produto_id) {
        if (!idValido(produto_id)) {
          return res.status(400).json({ error: `produto_id inválido: ${produto_id}` });
        }
        produto = await Produto.findById(produto_id);
        if (!produto) {
          return res.status(404).json({ error: `Produto não encontrado: ${produto_id}` });
        }
      } else {
        ({ produto, novo } = await compraService.encontrarOuCriarProduto(nome.trim(), contextoProdutos));
      }

      itensValidados.push({
        produto,
        novo,
        item: {
          produto_id: produto._id,
          nome_original: nome ? nome.trim() : produto.nome,
          quantidade: qtd,
          valor_unitario: unit,
          valor_total: Number((qtd * unit).toFixed(2))
        }
      });
    }

    const valorTotal = Number(itensValidados.reduce((soma, v) => soma + v.item.valor_total, 0).toFixed(2));

    const compra = await Compra.create({
      usuario_id: req.usuario.id,
      estabelecimento_id,
      data_compra: data,
      valor_total: valorTotal,
      nfce_url,
      itens: itensValidados.map((v) => v.item)
    });

    await compraService.registrarPrecosEmLote(itensValidados.map(({ produto, item }) => ({
        produto,
        estabelecimentoId: estabelecimento._id,
        compraId: compra._id,
        valor: item.valor_unitario,
        data
    })));

    return res.status(201).json({
      compra_id: compra._id,
      estabelecimento: displayFormatter.formatarNomeEstabelecimento(estabelecimento.nome),
      data_compra: compra.data_compra,
      valor_total: compra.valor_total,
      itens_processados: itensValidados.length,
      itens_novos: itensValidados.filter((v) => v.novo).length
    });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/compras/:id
async function atualizar(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const compra = await Compra.findOne({ _id: req.params.id, usuario_id: req.usuario.id });
    if (!compra) {
      return res.status(404).json({ error: 'Compra não encontrada' });
    }

    const { data_compra, nfce_url, estabelecimento_id } = req.body || {};

    if (data_compra !== undefined) {
      const data = new Date(data_compra);
      if (Number.isNaN(data.getTime())) {
        return res.status(400).json({ error: 'data_compra inválida' });
      }
      compra.data_compra = data;
    }
    if (nfce_url !== undefined) compra.nfce_url = nfce_url;
    if (estabelecimento_id !== undefined) {
      if (!idValido(estabelecimento_id)) {
        return res.status(400).json({ error: 'estabelecimento_id inválido' });
      }
      const estabelecimento = await Estabelecimento.findById(estabelecimento_id);
      if (!estabelecimento) {
        return res.status(404).json({ error: 'Estabelecimento não encontrado' });
      }
      compra.estabelecimento_id = estabelecimento_id;
    }

    await compra.save();

    const populada = await Compra.findById(compra._id)
      .populate('estabelecimento_id', 'nome')
      .populate('itens.produto_id', 'nome categoria tipo marca quantidade');

    return res.json(formatar(populada));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/compras/:id
async function remover(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const compra = await Compra.findOneAndDelete({ _id: req.params.id, usuario_id: req.usuario.id });
    if (!compra) {
      return res.status(404).json({ error: 'Compra não encontrada' });
    }

    await compraService.removerHistoricoDaCompra(compra);
    return res.json({ message: 'Compra removida' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, detalhar, criar, atualizar, remover };
