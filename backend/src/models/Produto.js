const mongoose = require('mongoose');

const produtoSchema = new mongoose.Schema({
  nome:             { type: String, required: true, trim: true },
  nome_normalizado: { type: String, index: true }, // sem acento/caixa, p/ dedup e busca
  chave_dedup:      { type: String, index: true, default: null }, // categoria|tipo|marca|tamanho|extras
  marca:            { type: String, default: null }, // opcional — null = sem marca
  categoria:        { type: String },
  tipo:             { type: String, default: null }, // ex.: detergente, refrigerante, arroz
  quantidade:       { type: String, default: null }, // ex.: 2L, 500ml, 5kg
  quantidade_normalizada: { type: String, index: true, default: null }, // ex.: 2000ml, 500ml, 5000g
  menor_preco:      { type: Number, default: null },
  ultimo_preco: {
    valor:              { type: Number },
    data:               { type: Date },
    estabelecimento_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estabelecimento' }
  },
  criado_em: { type: Date, default: Date.now }
});

produtoSchema.index({ categoria: 1, tipo: 1, marca: 1, quantidade_normalizada: 1 });

module.exports = mongoose.model('Produto', produtoSchema);
