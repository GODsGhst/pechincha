const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nome:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha:     { type: String, required: true, select: false }, // armazenada com bcrypt
  papel:     { type: String, enum: ['usuario', 'admin', 'superadmin'], default: 'usuario' },
  email_verificado: { type: Boolean, default: true },
  login: {
    tentativas_falhas: { type: Number, default: 0, select: false },
    bloqueado_ate:    { type: Date, default: null, select: false },
    ultimo_falha_em:  { type: Date, default: null, select: false }
  },
  reset_senha: {
    token_hash:    { type: String, default: null, select: false },
    expira_em:     { type: Date, default: null, select: false },
    solicitado_em: { type: Date, default: null, select: false }
  },
  verificacao_email: {
    token_hash:    { type: String, default: null, select: false },
    expira_em:     { type: Date, default: null, select: false },
    solicitado_em: { type: Date, default: null, select: false }
  },
  admin_2fa: {
    codigo_hash:   { type: String, default: null, select: false },
    expira_em:     { type: Date, default: null, select: false },
    solicitado_em: { type: Date, default: null, select: false },
    tentativas:    { type: Number, default: 0, select: false }
  },
  lgpd: {
    termos_versao:       { type: String, default: null },
    politica_versao:     { type: String, default: null },
    consentido_em:       { type: Date, default: null },
    ip_consentimento:    { type: String, default: null, select: false },
    agente_consentimento:{ type: String, default: null, select: false }
  },
  criado_em: { type: Date, default: Date.now }
});

usuarioSchema.index({ 'reset_senha.expira_em': 1 }, { sparse: true });
usuarioSchema.index({ 'verificacao_email.expira_em': 1 }, { sparse: true });
usuarioSchema.index({ 'admin_2fa.expira_em': 1 }, { sparse: true });

module.exports = mongoose.model('Usuario', usuarioSchema);
