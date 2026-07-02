const mongoose = require('mongoose');

const produtoGrafoNodeSchema = new mongoose.Schema({
  node_key: { type: String, required: true },
  tipo: { type: String, required: true },
  valor: { type: String, required: true },
  label: { type: String, default: null },
  peso_base: { type: Number, default: 1 },
  produto_count: { type: Number, default: 0 },
  atualizado_em: { type: Date, default: Date.now }
}, {
  collection: 'produto_grafo_nodes'
});

produtoGrafoNodeSchema.index(
  { node_key: 1 },
  { unique: true, name: 'uniq_produto_grafo_node_key' }
);
produtoGrafoNodeSchema.index(
  { tipo: 1, valor: 1 },
  { unique: true, name: 'uniq_produto_grafo_node_tipo_valor' }
);

module.exports = mongoose.model('ProdutoGrafoNode', produtoGrafoNodeSchema);
