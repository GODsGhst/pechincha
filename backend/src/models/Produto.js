const mongoose = require('mongoose');

const produtoSchema = new mongoose.Schema({
  nome:             { type: String, required: true, trim: true },
  nome_normalizado: { type: String, index: true }, // sem acento/caixa, p/ dedup e busca
  marca:            { type: String, default: null }, // opcional — null = sem marca
  categoria:        { type: String },
  tipo:             { type: String, default: null }, // ex.: detergente, refrigerante, arroz
  menor_preco:      { type: Number, default: null },
  ultimo_preco: {
    valor:              { type: Number },
    data:               { type: Date },
    estabelecimento_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estabelecimento' }
  },
  criado_em: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Produto', produtoSchema);
