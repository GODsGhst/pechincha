const mongoose = require('mongoose');

const historicoPrecoSchema = new mongoose.Schema({
  produto_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  estabelecimento_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estabelecimento', required: true },
  compra_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'Compra', required: true },
  valor:              { type: Number, required: true },
  data:               { type: Date, required: true },
  observacoes:        { type: Number, default: 1 }
});

historicoPrecoSchema.index({ produto_id: 1, estabelecimento_id: 1, compra_id: 1, valor: 1 });
historicoPrecoSchema.index({ produto_id: 1, estabelecimento_id: 1, valor: 1 });
historicoPrecoSchema.index({ produto_id: 1, valor: 1, data: -1 });
historicoPrecoSchema.index({ produto_id: 1, data: -1 });
historicoPrecoSchema.index({ estabelecimento_id: 1, produto_id: 1, data: -1 });

module.exports = mongoose.model('HistoricoPreco', historicoPrecoSchema);
