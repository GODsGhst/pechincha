const mongoose = require('mongoose');

const produtoSchema = new mongoose.Schema({
  nome:        { type: String, required: true, trim: true },
  categoria:   { type: String },
  menor_preco: { type: Number, default: null },
  ultimo_preco: {
    valor:              { type: Number },
    data:               { type: Date },
    estabelecimento_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estabelecimento' }
  },
  criado_em: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Produto', produtoSchema);
