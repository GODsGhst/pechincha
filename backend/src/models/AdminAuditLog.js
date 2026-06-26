const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  acao: { type: String, required: true, trim: true },
  alvo_tipo: { type: String, required: true, trim: true },
  alvo_id: { type: String, default: null, index: true },
  resumo: { type: String, default: null },
  dados: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: null },
  criado_em: { type: Date, default: Date.now, index: true }
});

adminAuditLogSchema.index({ criado_em: -1 });
adminAuditLogSchema.index({ usuario_id: 1, criado_em: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
