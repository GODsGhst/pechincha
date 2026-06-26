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

estabelecimentoSchema.index({ nome: 1 });
estabelecimentoSchema.index({ 'localizacao.lat': 1, 'localizacao.lng': 1 });

module.exports = mongoose.model('Estabelecimento', estabelecimentoSchema);
