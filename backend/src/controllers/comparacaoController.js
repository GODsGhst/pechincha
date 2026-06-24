const mongoose = require('mongoose');
const Compra = require('../models/Compra');
const HistoricoPreco = require('../models/HistoricoPreco');
const Produto = require('../models/Produto');

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function localizacaoDoEstabelecimento(estabelecimento) {
  if (
    estabelecimento.localizacao &&
    estabelecimento.localizacao.lat !== undefined &&
    estabelecimento.localizacao.lat !== null
  ) {
    return { lat: estabelecimento.localizacao.lat, lng: estabelecimento.localizacao.lng };
  }
  return null;
}

function moeda(valor) {
  return Number(valor.toFixed(2));
}

// Últimos preços conhecidos de cada produto em cada estabelecimento.
// Retorna também os dados do estabelecimento para montar a resposta.
async function ultimosPrecosPorEstabelecimento(produtoIds) {
  return HistoricoPreco.aggregate([
    { $match: { produto_id: { $in: produtoIds } } },
    { $sort: { data: -1 } },
    {
      $group: {
        _id: { produto: '$produto_id', estabelecimento: '$estabelecimento_id' },
        valor: { $first: '$valor' },
        data: { $first: '$data' }
      }
    },
    {
      $lookup: {
        from: 'estabelecimentos',
        localField: '_id.estabelecimento',
        foreignField: '_id',
        as: 'estabelecimento'
      }
    },
    { $unwind: '$estabelecimento' }
  ]);
}

// GET /api/comparacao/menores
// Menores preços APENAS dos produtos que o usuário já comprou
// (alimenta a barra lateral — não mostra o catálogo inteiro).
async function menoresDoUsuario(req, res, next) {
  try {
    const compras = await Compra.find({ usuario_id: req.usuario.id }, 'itens.produto_id');
    const produtoIds = [...new Set(
      compras.flatMap((c) => c.itens.map((i) => String(i.produto_id)))
    )].map((id) => new mongoose.Types.ObjectId(id));

    if (produtoIds.length === 0) {
      return res.json({ menores_precos: [] });
    }

    const registros = await ultimosPrecosPorEstabelecimento(produtoIds);

    // Menor preço atual de cada produto entre os estabelecimentos
    const menorPorProduto = new Map();
    for (const r of registros) {
      const chave = String(r._id.produto);
      const atual = menorPorProduto.get(chave);
      if (!atual || r.valor < atual.valor) {
        menorPorProduto.set(chave, r);
      }
    }

    const produtos = await Produto.find({ _id: { $in: produtoIds } }, 'nome');
    const nomePorId = new Map(produtos.map((p) => [String(p._id), p.nome]));

    const resultado = [...menorPorProduto.values()]
      .sort((a, b) => a.valor - b.valor)
      .map((r) => ({
        produto_id: r._id.produto,
        produto: nomePorId.get(String(r._id.produto)) || null,
        valor: r.valor,
        data: r.data,
        estabelecimento_id: r.estabelecimento._id,
        estabelecimento: r.estabelecimento.nome,
        localizacao: localizacaoDoEstabelecimento(r.estabelecimento)
      }));

    return res.json({ menores_precos: resultado });
  } catch (err) {
    return next(err);
  }
}

// GET /api/comparacao/compras/:id?visao=total|unitario
// Analisa uma compra do usuário:
//  - visao=total: onde a cesta inteira sairia mais barata (ranking por valor final)
//  - visao=unitario: item por item, menor preço atual e economia de cada produto
async function compararCompra(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const visao = req.query.visao || 'total';
    if (!['total', 'unitario'].includes(visao)) {
      return res.status(400).json({ error: 'visao deve ser "total" ou "unitario"' });
    }

    const compra = await Compra.findOne({ _id: req.params.id, usuario_id: req.usuario.id })
      .populate('estabelecimento_id', 'nome')
      .populate('itens.produto_id', 'nome');

    if (!compra) {
      return res.status(404).json({ error: 'Compra não encontrada' });
    }
    if (!compra.itens || compra.itens.length === 0) {
      return res.status(422).json({ error: 'Compra sem itens para comparar' });
    }

    const produtoIds = compra.itens.map((i) => i.produto_id._id || i.produto_id);
    const registros = await ultimosPrecosPorEstabelecimento(produtoIds);

    const resumoCompra = {
      id: compra._id,
      estabelecimento: compra.estabelecimento_id ? compra.estabelecimento_id.nome : null,
      data_compra: compra.data_compra,
      valor_total: compra.valor_total
    };

    if (visao === 'unitario') {
      // Menor preço atual de cada produto entre todos os estabelecimentos
      const menorPorProduto = new Map();
      for (const r of registros) {
        const chave = String(r._id.produto);
        const atual = menorPorProduto.get(chave);
        if (!atual || r.valor < atual.valor) {
          menorPorProduto.set(chave, r);
        }
      }

      let valorMinimoPossivel = 0;
      const itens = compra.itens.map((item) => {
        const chave = String(item.produto_id._id || item.produto_id);
        const menor = menorPorProduto.get(chave);
        const menorValor = menor ? menor.valor : item.valor_unitario;
        const economiaUnitaria = Number((item.valor_unitario - menorValor).toFixed(2));
        valorMinimoPossivel += menorValor * item.quantidade;

        return {
          produto_id: chave,
          produto: item.produto_id.nome || item.nome_original,
          quantidade: item.quantidade,
          valor_pago_unitario: item.valor_unitario,
          menor_valor: menor
            ? {
                valor: menor.valor,
                estabelecimento_id: menor.estabelecimento._id,
                estabelecimento: menor.estabelecimento.nome,
                data: menor.data
              }
            : null,
          economia_unitaria: economiaUnitaria,
          economia_total: Number((economiaUnitaria * item.quantidade).toFixed(2))
        };
      });

      valorMinimoPossivel = Number(valorMinimoPossivel.toFixed(2));

      return res.json({
        compra: resumoCompra,
        visao: 'unitario',
        itens,
        resumo: {
          valor_pago: compra.valor_total,
          valor_minimo_possivel: valorMinimoPossivel,
          economia_potencial: Number((compra.valor_total - valorMinimoPossivel).toFixed(2))
        }
      });
    }

    // visao === 'total': simula a cesta inteira em cada estabelecimento
    const porEstabelecimento = new Map();
    for (const r of registros) {
      const chave = String(r._id.estabelecimento);
      if (!porEstabelecimento.has(chave)) {
        porEstabelecimento.set(chave, { estabelecimento: r.estabelecimento, precos: new Map() });
      }
      porEstabelecimento.get(chave).precos.set(String(r._id.produto), r.valor);
    }

    const comparacao = [...porEstabelecimento.values()].map(({ estabelecimento, precos }) => {
      let total = 0;
      let cobertos = 0;
      for (const item of compra.itens) {
        const chave = String(item.produto_id._id || item.produto_id);
        const valor = precos.get(chave);
        if (valor !== undefined) {
          total += valor * item.quantidade;
          cobertos += 1;
        }
      }

      const coberturaCompleta = cobertos === compra.itens.length;
      return {
        estabelecimento_id: estabelecimento._id,
        estabelecimento: estabelecimento.nome,
        localizacao: localizacaoDoEstabelecimento(estabelecimento),
        total_estimado: moeda(total),
        produtos_cobertos: cobertos,
        total_produtos: compra.itens.length,
        cobertura_completa: coberturaCompleta,
        economia_vs_pago: coberturaCompleta
          ? moeda(compra.valor_total - total)
          : null
      };
    });

    // Cobertura completa primeiro, depois menor total
    comparacao.sort((a, b) => {
      if (a.cobertura_completa !== b.cobertura_completa) {
        return a.cobertura_completa ? -1 : 1;
      }
      return a.total_estimado - b.total_estimado;
    });

    return res.json({
      compra: resumoCompra,
      visao: 'total',
      comparacao
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/comparacao/cesta
// Compara uma lista livre de produtos, como o carrinho do app.
// Body: { itens: [{ produto_id, quantidade }] }
async function compararCesta(req, res, next) {
  try {
    const itensRecebidos = req.body && req.body.itens;
    if (!Array.isArray(itensRecebidos) || itensRecebidos.length === 0) {
      return res.status(400).json({ error: 'Envie ao menos um item na cesta' });
    }

    const quantidadePorProduto = new Map();
    for (const [indice, item] of itensRecebidos.entries()) {
      const produtoId = item && (item.produto_id || item.id);
      if (!produtoId || !idValido(produtoId)) {
        return res.status(400).json({ error: `Item ${indice + 1}: produto_id inválido` });
      }

      const quantidade = Number(item.quantidade === undefined ? 1 : item.quantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return res.status(400).json({ error: `Item ${indice + 1}: quantidade inválida` });
      }

      const chave = String(produtoId);
      quantidadePorProduto.set(chave, (quantidadePorProduto.get(chave) || 0) + quantidade);
    }

    const produtoIds = [...quantidadePorProduto.keys()].map((id) => new mongoose.Types.ObjectId(id));
    const produtos = await Produto.find({ _id: { $in: produtoIds } }, 'nome');
    if (produtos.length !== produtoIds.length) {
      return res.status(404).json({ error: 'Um ou mais produtos não foram encontrados' });
    }

    const nomePorId = new Map(produtos.map((p) => [String(p._id), p.nome]));
    const itens = produtoIds.map((id) => {
      const chave = String(id);
      return {
        produto_id: id,
        produto: nomePorId.get(chave),
        quantidade: quantidadePorProduto.get(chave)
      };
    });

    const registros = await ultimosPrecosPorEstabelecimento(produtoIds);

    const menorPorProduto = new Map();
    for (const r of registros) {
      const chave = String(r._id.produto);
      const atual = menorPorProduto.get(chave);
      if (!atual || r.valor < atual.valor) {
        menorPorProduto.set(chave, r);
      }
    }

    let totalMelhoresIndividuais = 0;
    let produtosComPreco = 0;
    const melhoresIndividuais = itens.map((item) => {
      const menor = menorPorProduto.get(String(item.produto_id));
      if (!menor) {
        return { ...item, menor_valor: null };
      }

      produtosComPreco += 1;
      const subtotal = menor.valor * item.quantidade;
      totalMelhoresIndividuais += subtotal;

      return {
        ...item,
        menor_valor: {
          valor: menor.valor,
          subtotal: moeda(subtotal),
          data: menor.data,
          estabelecimento_id: menor.estabelecimento._id,
          estabelecimento: menor.estabelecimento.nome,
          localizacao: localizacaoDoEstabelecimento(menor.estabelecimento)
        }
      };
    });

    const porEstabelecimento = new Map();
    for (const r of registros) {
      const chave = String(r._id.estabelecimento);
      if (!porEstabelecimento.has(chave)) {
        porEstabelecimento.set(chave, { estabelecimento: r.estabelecimento, precos: new Map() });
      }
      porEstabelecimento.get(chave).precos.set(String(r._id.produto), {
        valor: r.valor,
        data: r.data
      });
    }

    const comparacao = [...porEstabelecimento.values()].map(({ estabelecimento, precos }) => {
      let total = 0;
      let cobertos = 0;
      const itensComparados = itens.map((item) => {
        const preco = precos.get(String(item.produto_id));
        if (!preco) {
          return {
            ...item,
            encontrado: false,
            valor_unitario: null,
            subtotal: null,
            data: null
          };
        }

        cobertos += 1;
        const subtotal = preco.valor * item.quantidade;
        total += subtotal;
        return {
          ...item,
          encontrado: true,
          valor_unitario: preco.valor,
          subtotal: moeda(subtotal),
          data: preco.data
        };
      });

      const coberturaCompleta = cobertos === itens.length;
      return {
        estabelecimento_id: estabelecimento._id,
        estabelecimento: estabelecimento.nome,
        localizacao: localizacaoDoEstabelecimento(estabelecimento),
        total_estimado: moeda(total),
        produtos_cobertos: cobertos,
        total_produtos: itens.length,
        cobertura_completa: coberturaCompleta,
        itens: itensComparados
      };
    });

    comparacao.sort((a, b) => {
      if (a.cobertura_completa !== b.cobertura_completa) {
        return a.cobertura_completa ? -1 : 1;
      }
      if (a.produtos_cobertos !== b.produtos_cobertos) {
        return b.produtos_cobertos - a.produtos_cobertos;
      }
      return a.total_estimado - b.total_estimado;
    });

    return res.json({
      cesta: {
        itens,
        total_produtos: itens.length
      },
      resumo: {
        total_melhores_individuais: moeda(totalMelhoresIndividuais),
        produtos_com_preco: produtosComPreco,
        total_produtos: itens.length
      },
      melhores_individuais: melhoresIndividuais,
      comparacao
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { menoresDoUsuario, compararCompra, compararCesta };
