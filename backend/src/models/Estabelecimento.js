const mongoose = require('mongoose');

const estabelecimentoSchema = new mongoose.Schema({
  nome:      { type: String, required: true, trim: true },
  cnpj:      { type: String, required: true, unique: true },
  endereco:  { type: String },
  localizacao: {
    lat: { type: Number },
    lng: { type: Number }
  },
  criado_em: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Estabelecimento', estabelecimentoSchema);
