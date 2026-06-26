const AdminAuditLog = require('../models/AdminAuditLog');

function ipDaRequisicao(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

async function registrarAdminAudit(req, entrada) {
  try {
    if (!req.usuario || !req.usuario.id) return null;
    return await AdminAuditLog.create({
      usuario_id: req.usuario.id,
      acao: entrada.acao,
      alvo_tipo: entrada.alvo_tipo,
      alvo_id: entrada.alvo_id ? String(entrada.alvo_id) : null,
      resumo: entrada.resumo || null,
      dados: entrada.dados || null,
      ip: ipDaRequisicao(req)
    });
  } catch (err) {
    console.error('Falha ao registrar auditoria admin:', err.message);
    return null;
  }
}

module.exports = { registrarAdminAudit };
