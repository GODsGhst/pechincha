const mongoose = require('mongoose');

const itemCompraSchema = new mongoose.Schema({
  produto_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  nome_original:  { type: String }, // nome como consta no cupom
  quantidade:     { type: Number, required: true },
  valor_unitario: { type: Number, required: true },
  valor_total:    { type: Number, required: true }
}, { _id: false });

const compraSchema = new mongoose.Schema({
  usuario_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  estabelecimento_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estabelecimento', required: true },
  data_compra:        { type: Date, required: true },
  valor_total:        { type: Number, required: true },
  nfce_url:           { type: String },
  chave_acesso:       { type: String }, // 44 dígitos — único por NFC-e, usado para evitar reimportação
  itens:              [itemCompraSchema],
  criado_em:          { type: Date, default: Date.now }
});

compraSchema.index(
  { chave_acesso: 1 },
  { unique: true, partialFilterExpression: { chave_acesso: { $type: 'string' } } }
);
compraSchema.index({ usuario_id: 1, data_compra: -1 });

module.exports = mongoose.model('Compra', compraSchema);
