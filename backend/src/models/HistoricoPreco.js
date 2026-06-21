const mongoose = require('mongoose');

const historicoPrecoSchema = new mongoose.Schema({
  produto_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  estabelecimento_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estabelecimento', required: true },
  compra_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'Compra', required: true },
  valor:              { type: Number, required: true },
  data:               { type: Date, required: true }
});

module.exports = mongoose.model('HistoricoPreco', historicoPrecoSchema);
