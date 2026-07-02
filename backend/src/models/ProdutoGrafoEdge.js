const mongoose = require('mongoose');

const produtoGrafoEdgeSchema = new mongoose.Schema({
  node_key: { type: String, required: true },
  produto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produto',
    required: true
  },
  tipo: { type: String, required: true },
  valor: { type: String, required: true },
  peso: { type: Number, default: 1 },
  atualizado_em: { type: Date, default: Date.now }
}, {
  collection: 'produto_grafo_edges'
});

produtoGrafoEdgeSchema.index(
  { node_key: 1, produto_id: 1 },
  { unique: true, name: 'uniq_produto_grafo_edge' }
);
produtoGrafoEdgeSchema.index(
  { node_key: 1, peso: -1 },
  { name: 'idx_produto_grafo_edge_node_peso' }
);
produtoGrafoEdgeSchema.index(
  { produto_id: 1, node_key: 1 },
  { name: 'idx_produto_grafo_edge_produto_node' }
);

module.exports = mongoose.model('ProdutoGrafoEdge', produtoGrafoEdgeSchema);
