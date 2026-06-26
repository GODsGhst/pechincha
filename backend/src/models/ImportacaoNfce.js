const mongoose = require('mongoose');

const importacaoNfceSchema = new mongoose.Schema({
  chave_acesso: { type: String, required: true, unique: true },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  compra_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Compra', default: null },
  status: {
    type: String,
    enum: ['processando', 'concluida', 'falhou'],
    default: 'processando'
  },
  recebido_em: { type: Date, default: Date.now },
  processado_em: { type: Date },
  tempo_processamento_ms: { type: Number, default: null },
  erro: { type: String, default: null }
});

importacaoNfceSchema.index({ usuario_id: 1, recebido_em: -1 });

module.exports = mongoose.model('ImportacaoNfce', importacaoNfceSchema);
