const mongoose = require('mongoose');

const itemListaSchema = new mongoose.Schema({
  produto_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  quantidade:    { type: Number, default: 1, min: 0.001 },
  selecionado:   { type: Boolean, default: true },
  adicionado_em: { type: Date, default: Date.now },
  atualizado_em: { type: Date, default: Date.now }
}, { _id: false });

const listaCompraSchema = new mongoose.Schema({
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true, index: true },
  itens:      [itemListaSchema],
  atualizado_em: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ListaCompra', listaCompraSchema);
