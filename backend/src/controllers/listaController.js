const mongoose = require('mongoose');
const ListaCompra = require('../models/ListaCompra');
const Produto = require('../models/Produto');
const productImageService = require('../services/productImageService');
const displayFormatter = require('../services/displayFormatter');
const { precoPorMedida, confiancaPreco } = require('../services/pricePresentationService');

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

function erroDuplicidadeMongo(err) {
  return err && (err.code === 11000 || err.code === 11001);
}

function populateLista(queryOuDoc) {
  return queryOuDoc.populate({
    path: 'itens.produto_id',
    select: 'nome categoria tipo marca quantidade quantidade_normalizada imagem_url imagem_credito menor_preco ultimo_preco'
  });
}

function formatarItem(item) {
  const produto = item.produto_id;
  if (!produto) return null;
  const imagem = productImageService.imagemDoProduto(produto);

  return {
    id: String(produto._id),
    produto_id: String(produto._id),
    nome: displayFormatter.formatarNomeProduto(produto),
    categoria: produto.categoria || null,
    tipo: produto.tipo || null,
    marca: produto.marca || null,
    quantidade_produto: produto.quantidade || null,
    imagem_url: imagem.url,
    imagem_credito: imagem.credito,
    menor_preco: produto.menor_preco,
    preco_unidade: precoPorMedida(produto.menor_preco, produto),
    confianca_preco: confiancaPreco(produto.ultimo_preco && produto.ultimo_preco.data),
    ultimo_preco: produto.ultimo_preco && produto.ultimo_preco.valor !== undefined && produto.ultimo_preco.valor !== null
      ? {
          valor: produto.ultimo_preco.valor,
          data: produto.ultimo_preco.data,
          preco_unidade: precoPorMedida(produto.ultimo_preco.valor, produto),
          confianca_preco: confiancaPreco(produto.ultimo_preco.data),
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
  try {
    const lista = await ListaCompra.findOneAndUpdate(
      { usuario_id: usuarioId },
      {
        $setOnInsert: {
          usuario_id: usuarioId,
          itens: [],
          atualizado_em: new Date()
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return populateLista(lista);
  } catch (err) {
    if (!erroDuplicidadeMongo(err)) throw err;
    const lista = await ListaCompra.findOne({ usuario_id: usuarioId });
    return populateLista(lista);
  }
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

    const agora = new Date();
    const selecionadoInformado = req.body.selecionado !== undefined;
    const setExistente = {
      'itens.$.quantidade': quantidade,
      'itens.$.atualizado_em': agora,
      atualizado_em: agora
    };
    if (selecionadoInformado) {
      setExistente['itens.$.selecionado'] = boolOuPadrao(req.body.selecionado, true);
    }

    let lista = await ListaCompra.findOneAndUpdate(
      { usuario_id: req.usuario.id, 'itens.produto_id': produto._id },
      { $set: setExistente },
      { new: true }
    );

    if (!lista) {
      const novoItem = {
        produto_id: produto._id,
        quantidade,
        selecionado: boolOuPadrao(req.body.selecionado, true),
        adicionado_em: agora,
        atualizado_em: agora
      };

      try {
        lista = await ListaCompra.findOneAndUpdate(
          { usuario_id: req.usuario.id, 'itens.produto_id': { $ne: produto._id } },
          {
            $setOnInsert: { usuario_id: req.usuario.id },
            $set: { atualizado_em: agora },
            $push: { itens: novoItem }
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (!erroDuplicidadeMongo(err)) throw err;
        lista = await ListaCompra.findOneAndUpdate(
          { usuario_id: req.usuario.id, 'itens.produto_id': { $ne: produto._id } },
          {
            $set: { atualizado_em: agora },
            $push: { itens: novoItem }
          },
          { new: true }
        );
      }
    }

    if (!lista) {
      lista = await ListaCompra.findOneAndUpdate(
        { usuario_id: req.usuario.id, 'itens.produto_id': produto._id },
        { $set: setExistente },
        { new: true }
      );
    }

    if (!lista) {
      lista = await buscarOuCriarLista(req.usuario.id);
    }

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
