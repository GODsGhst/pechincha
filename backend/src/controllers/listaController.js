const mongoose = require('mongoose');
const ListaCompra = require('../models/ListaCompra');
const Produto = require('../models/Produto');

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function boolOuPadrao(valor, padrao) {
  if (valor === undefined || valor === null) return padrao;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') return !['false', '0', 'nao', 'não'].includes(valor.toLowerCase());
  return Boolean(valor);
}

function quantidadeValida(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function populateLista(queryOuDoc) {
  return queryOuDoc.populate({
    path: 'itens.produto_id',
    select: 'nome categoria tipo marca quantidade menor_preco ultimo_preco'
  });
}

function formatarItem(item) {
  const produto = item.produto_id;
  if (!produto) return null;

  return {
    id: String(produto._id),
    produto_id: String(produto._id),
    nome: produto.nome,
    categoria: produto.categoria || null,
    tipo: produto.tipo || null,
    marca: produto.marca || null,
    quantidade_produto: produto.quantidade || null,
    menor_preco: produto.menor_preco,
    ultimo_preco: produto.ultimo_preco && produto.ultimo_preco.valor !== undefined && produto.ultimo_preco.valor !== null
      ? {
          valor: produto.ultimo_preco.valor,
          data: produto.ultimo_preco.data,
          estabelecimento_id: produto.ultimo_preco.estabelecimento_id || null
        }
      : null,
    quantidade: item.quantidade,
    selecionado: item.selecionado !== false,
    adicionado_em: item.adicionado_em,
    atualizado_em: item.atualizado_em
  };
}

function responderLista(res, lista) {
  const itens = (lista.itens || []).map(formatarItem).filter(Boolean);
  return res.json({
    id: String(lista._id),
    atualizado_em: lista.atualizado_em,
    itens
  });
}

async function buscarOuCriarLista(usuarioId) {
  let lista = await ListaCompra.findOne({ usuario_id: usuarioId });
  if (!lista) {
    lista = await ListaCompra.create({ usuario_id: usuarioId, itens: [] });
  }
  return populateLista(lista);
}

async function listar(req, res, next) {
  try {
    const lista = await buscarOuCriarLista(req.usuario.id);
    return responderLista(res, lista);
  } catch (err) {
    return next(err);
  }
}

async function adicionarItem(req, res, next) {
  try {
    const produtoId = req.body && (req.body.produto_id || req.body.id);
    if (!produtoId || !idValido(produtoId)) {
      return res.status(400).json({ error: 'produto_id inválido' });
    }

    const quantidade = quantidadeValida(req.body.quantidade === undefined ? 1 : req.body.quantidade);
    if (!quantidade) {
      return res.status(400).json({ error: 'quantidade inválida' });
    }

    const produto = await Produto.findById(produtoId);
    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    let lista = await ListaCompra.findOne({ usuario_id: req.usuario.id });
    if (!lista) {
      lista = await ListaCompra.create({ usuario_id: req.usuario.id, itens: [] });
    }

    const agora = new Date();
    const indice = lista.itens.findIndex((item) => String(item.produto_id) === String(produto._id));
    if (indice >= 0) {
      lista.itens[indice].quantidade = quantidade;
      lista.itens[indice].selecionado = boolOuPadrao(req.body.selecionado, lista.itens[indice].selecionado);
      lista.itens[indice].atualizado_em = agora;
    } else {
      lista.itens.push({
        produto_id: produto._id,
        quantidade,
        selecionado: boolOuPadrao(req.body.selecionado, true),
        adicionado_em: agora,
        atualizado_em: agora
      });
    }

    lista.atualizado_em = agora;
    await lista.save();
    await populateLista(lista);

    return responderLista(res, lista);
  } catch (err) {
    return next(err);
  }
}

async function atualizarItem(req, res, next) {
  try {
    if (!idValido(req.params.produtoId)) {
      return res.status(400).json({ error: 'produto_id inválido' });
    }

    const lista = await ListaCompra.findOne({ usuario_id: req.usuario.id });
    if (!lista) {
      return res.status(404).json({ error: 'Item não encontrado na lista' });
    }

    const item = lista.itens.find((i) => String(i.produto_id) === String(req.params.produtoId));
    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado na lista' });
    }

    if (req.body.quantidade !== undefined) {
      const quantidade = quantidadeValida(req.body.quantidade);
      if (!quantidade) {
        return res.status(400).json({ error: 'quantidade inválida' });
      }
      item.quantidade = quantidade;
    }

    if (req.body.selecionado !== undefined) {
      item.selecionado = boolOuPadrao(req.body.selecionado, item.selecionado);
    }

    item.atualizado_em = new Date();
    lista.atualizado_em = item.atualizado_em;
    await lista.save();
    await populateLista(lista);

    return responderLista(res, lista);
  } catch (err) {
    return next(err);
  }
}

async function removerItem(req, res, next) {
  try {
    if (!idValido(req.params.produtoId)) {
      return res.status(400).json({ error: 'produto_id inválido' });
    }

    const lista = await ListaCompra.findOne({ usuario_id: req.usuario.id });
    if (!lista) {
      return res.json({ itens: [] });
    }

    lista.itens = lista.itens.filter((item) => String(item.produto_id) !== String(req.params.produtoId));
    lista.atualizado_em = new Date();
    await lista.save();
    await populateLista(lista);

    return responderLista(res, lista);
  } catch (err) {
    return next(err);
  }
}

async function limpar(req, res, next) {
  try {
    let lista = await ListaCompra.findOne({ usuario_id: req.usuario.id });
    if (!lista) {
      lista = await ListaCompra.create({ usuario_id: req.usuario.id, itens: [] });
    } else {
      lista.itens = [];
      lista.atualizado_em = new Date();
      await lista.save();
    }

    await populateLista(lista);
    return responderLista(res, lista);
  } catch (err) {
    return next(err);
  }
}

module.exports = { listar, adicionarItem, atualizarItem, removerItem, limpar };
