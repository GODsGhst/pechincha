const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const Produto = require('../models/Produto');
const Estabelecimento = require('../models/Estabelecimento');
const Compra = require('../models/Compra');
const HistoricoPreco = require('../models/HistoricoPreco');
const ImportacaoNfce = require('../models/ImportacaoNfce');
const ListaCompra = require('../models/ListaCompra');
const AdminAuditLog = require('../models/AdminAuditLog');
const { registrarAdminAudit } = require('../services/adminAuditService');
const compraService = require('../services/compraService');

function idValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function formatarUsuario(usuario) {
  return {
    id: usuario._id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel || 'usuario',
    criado_em: usuario.criado_em
  };
}

function formatarPreco(preco) {
  const produto = preco.produto_id || null;
  const estabelecimento = preco.estabelecimento_id || null;
  return {
    id: preco._id,
    produto_id: produto && produto._id ? produto._id : preco.produto_id,
    produto: produto && produto.nome ? produto.nome : null,
    estabelecimento_id: estabelecimento && estabelecimento._id ? estabelecimento._id : preco.estabelecimento_id,
    estabelecimento: estabelecimento && estabelecimento.nome ? estabelecimento.nome : null,
    compra_id: preco.compra_id || null,
    valor: preco.valor,
    data: preco.data,
    observacoes: preco.observacoes || 1
  };
}

async function resumo(_req, res, next) {
  try {
    const [
      usuarios,
      admins,
      superadmins,
      produtos,
      estabelecimentos,
      compras,
      historicos,
      importacoesProcessando
    ] = await Promise.all([
      Usuario.countDocuments(),
      Usuario.countDocuments({ papel: { $in: ['admin', 'superadmin'] } }),
      Usuario.countDocuments({ papel: 'superadmin' }),
      Produto.countDocuments(),
      Estabelecimento.countDocuments(),
      Compra.countDocuments(),
      HistoricoPreco.countDocuments(),
      ImportacaoNfce.countDocuments({ status: 'processando' })
    ]);

    const ultimasImportacoes = await ImportacaoNfce.find()
      .sort({ recebido_em: -1 })
      .limit(10)
      .populate('usuario_id', 'nome email')
      .select('chave_acesso usuario_id compra_id status recebido_em processado_em tempo_processamento_ms erro')
      .lean();

    return res.json({
      totais: {
        usuarios,
        admins,
        superadmins,
        produtos,
        estabelecimentos,
        compras,
        historicos,
        importacoes_processando: importacoesProcessando
      },
      ultimas_importacoes: ultimasImportacoes.map((item) => ({
        id: item._id,
        chave_acesso: item.chave_acesso,
        usuario: item.usuario_id
          ? {
              id: item.usuario_id._id,
              nome: item.usuario_id.nome,
              email: item.usuario_id.email
            }
          : null,
        compra_id: item.compra_id || null,
        status: item.status,
        recebido_em: item.recebido_em,
        processado_em: item.processado_em || null,
        tempo_processamento_ms: item.tempo_processamento_ms || null,
        erro: item.erro || null
      }))
    });
  } catch (err) {
    return next(err);
  }
}

async function listarUsuarios(_req, res, next) {
  try {
    const usuarios = await Usuario.find()
      .sort({ criado_em: -1 })
      .select('nome email papel criado_em');

    return res.json({ usuarios: usuarios.map(formatarUsuario) });
  } catch (err) {
    return next(err);
  }
}

async function atualizarPapelUsuario(req, res, next) {
  try {
    if (!req.admin || req.admin.papel !== 'superadmin') {
      return res.status(403).json({ error: 'Apenas super administradores podem alterar papéis' });
    }
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const papel = String((req.body || {}).papel || '').trim();
    if (!['usuario', 'admin', 'superadmin'].includes(papel)) {
      return res.status(400).json({ error: 'papel deve ser usuario, admin ou superadmin' });
    }

    const usuario = await Usuario.findById(req.params.id).select('nome email papel criado_em');
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (usuario.papel === 'superadmin' && papel !== 'superadmin') {
      const outrosSuperAdmins = await Usuario.countDocuments({
        _id: { $ne: usuario._id },
        papel: 'superadmin'
      });
      if (outrosSuperAdmins === 0) {
        return res.status(400).json({ error: 'Não é possível remover o último super administrador' });
      }
    }

    usuario.papel = papel;
    await usuario.save();
    await registrarAdminAudit(req, {
      acao: 'usuario.papel_atualizar',
      alvo_tipo: 'usuario',
      alvo_id: usuario._id,
      resumo: `Papel de ${usuario.email} atualizado para ${papel}`,
      dados: { email: usuario.email, papel }
    });

    return res.json(formatarUsuario(usuario));
  } catch (err) {
    return next(err);
  }
}

async function listarPrecos(req, res, next) {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);
    const filtro = {};
    if (req.query.produto_id) {
      if (!idValido(req.query.produto_id)) {
        return res.status(400).json({ error: 'produto_id inválido' });
      }
      filtro.produto_id = req.query.produto_id;
    }
    if (req.query.estabelecimento_id) {
      if (!idValido(req.query.estabelecimento_id)) {
        return res.status(400).json({ error: 'estabelecimento_id inválido' });
      }
      filtro.estabelecimento_id = req.query.estabelecimento_id;
    }

    const precos = await HistoricoPreco.find(filtro)
      .sort({ data: -1 })
      .limit(limite)
      .populate('produto_id', 'nome categoria tipo marca quantidade')
      .populate('estabelecimento_id', 'nome');

    return res.json({ precos: precos.map(formatarPreco) });
  } catch (err) {
    return next(err);
  }
}

async function atualizarPreco(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const preco = await HistoricoPreco.findById(req.params.id);
    if (!preco) {
      return res.status(404).json({ error: 'Preço não encontrado' });
    }

    const atualizacao = {};
    if (req.body.valor !== undefined) {
      const valor = Number(req.body.valor);
      if (!Number.isFinite(valor) || valor <= 0) {
        return res.status(400).json({ error: 'valor inválido' });
      }
      atualizacao.valor = Number(valor.toFixed(2));
    }
    if (req.body.data !== undefined) {
      const data = new Date(req.body.data);
      if (Number.isNaN(data.getTime())) {
        return res.status(400).json({ error: 'data inválida' });
      }
      atualizacao.data = data;
    }
    if (req.body.observacoes !== undefined) {
      const observacoes = Number(req.body.observacoes);
      if (!Number.isFinite(observacoes) || observacoes < 1) {
        return res.status(400).json({ error: 'observacoes inválidas' });
      }
      atualizacao.observacoes = Math.floor(observacoes);
    }

    Object.assign(preco, atualizacao);
    await preco.save();
    await compraService.recalcularPrecos(preco.produto_id);
    await registrarAdminAudit(req, {
      acao: 'preco.atualizar',
      alvo_tipo: 'historico_preco',
      alvo_id: preco._id,
      resumo: `Preço atualizado para R$ ${preco.valor}`,
      dados: atualizacao
    });

    await preco.populate('produto_id', 'nome categoria tipo marca quantidade');
    await preco.populate('estabelecimento_id', 'nome');
    return res.json(formatarPreco(preco));
  } catch (err) {
    return next(err);
  }
}

async function removerPreco(req, res, next) {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const preco = await HistoricoPreco.findByIdAndDelete(req.params.id);
    if (!preco) {
      return res.status(404).json({ error: 'Preço não encontrado' });
    }

    await compraService.recalcularPrecos(preco.produto_id);
    await registrarAdminAudit(req, {
      acao: 'preco.remover',
      alvo_tipo: 'historico_preco',
      alvo_id: preco._id,
      resumo: `Preço removido: R$ ${preco.valor}`,
      dados: { produto_id: preco.produto_id, estabelecimento_id: preco.estabelecimento_id }
    });

    return res.json({ message: 'Preço removido' });
  } catch (err) {
    return next(err);
  }
}

async function juntarProdutos(req, res, next) {
  try {
    const origemId = String((req.body || {}).origem_id || '').trim();
    const destinoId = String((req.body || {}).destino_id || '').trim();
    if (!idValido(origemId) || !idValido(destinoId) || origemId === destinoId) {
      return res.status(400).json({ error: 'origem_id e destino_id devem ser produtos diferentes e válidos' });
    }

    const [origem, destino] = await Promise.all([
      Produto.findById(origemId),
      Produto.findById(destinoId)
    ]);
    if (!origem || !destino) {
      return res.status(404).json({ error: 'Produto de origem ou destino não encontrado' });
    }

    await Promise.all([
      HistoricoPreco.updateMany({ produto_id: origem._id }, { $set: { produto_id: destino._id } }),
      Compra.updateMany({ 'itens.produto_id': origem._id }, { $set: { 'itens.$[item].produto_id': destino._id } }, {
        arrayFilters: [{ 'item.produto_id': origem._id }]
      }),
      ListaCompra.updateMany(
        { 'itens.produto_id': origem._id },
        { $set: { 'itens.$[item].produto_id': destino._id, atualizado_em: new Date() } },
        { arrayFilters: [{ 'item.produto_id': origem._id }] }
      )
    ]);

    await Produto.deleteOne({ _id: origem._id });
    await compraService.recalcularPrecos(destino._id);
    await registrarAdminAudit(req, {
      acao: 'produto.juntar',
      alvo_tipo: 'produto',
      alvo_id: destino._id,
      resumo: `Produto ${origem.nome} juntado em ${destino.nome}`,
      dados: { origem_id: origem._id, destino_id: destino._id }
    });

    return res.json({
      message: 'Produtos juntados',
      destino: {
        id: destino._id,
        nome: destino.nome
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function auditoria(req, res, next) {
  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 100);
    const logs = await AdminAuditLog.find()
      .sort({ criado_em: -1 })
      .limit(limite)
      .populate('usuario_id', 'nome email')
      .lean();

    return res.json({
      logs: logs.map((log) => ({
        id: log._id,
        acao: log.acao,
        alvo_tipo: log.alvo_tipo,
        alvo_id: log.alvo_id,
        resumo: log.resumo,
        dados: log.dados || null,
        ip: log.ip || null,
        criado_em: log.criado_em,
        usuario: log.usuario_id
          ? {
              id: log.usuario_id._id,
              nome: log.usuario_id.nome,
              email: log.usuario_id.email
            }
          : null
      }))
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  resumo,
  listarUsuarios,
  atualizarPapelUsuario,
  auditoria,
  listarPrecos,
  atualizarPreco,
  removerPreco,
  juntarProdutos
};
