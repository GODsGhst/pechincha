const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const Produto = require('../models/Produto');
const Estabelecimento = require('../models/Estabelecimento');
const Compra = require('../models/Compra');
const HistoricoPreco = require('../models/HistoricoPreco');
const ImportacaoNfce = require('../models/ImportacaoNfce');
const AdminAuditLog = require('../models/AdminAuditLog');
const { registrarAdminAudit } = require('../services/adminAuditService');

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

async function resumo(_req, res, next) {
  try {
    const [
      usuarios,
      admins,
      produtos,
      estabelecimentos,
      compras,
      historicos,
      importacoesProcessando
    ] = await Promise.all([
      Usuario.countDocuments(),
      Usuario.countDocuments({ papel: 'admin' }),
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
    if (!idValido(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const papel = String((req.body || {}).papel || '').trim();
    if (!['usuario', 'admin'].includes(papel)) {
      return res.status(400).json({ error: 'papel deve ser usuario ou admin' });
    }

    const usuario = await Usuario.findById(req.params.id).select('nome email papel criado_em');
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (usuario.papel === 'admin' && papel !== 'admin') {
      const outrosAdmins = await Usuario.countDocuments({
        _id: { $ne: usuario._id },
        papel: 'admin'
      });
      if (outrosAdmins === 0) {
        return res.status(400).json({ error: 'Não é possível remover o último administrador' });
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
  auditoria
};
