// Popula o banco com dados de exemplo (estabelecimentos, produtos, compras e
// histórico de preços) para demonstração. ATENÇÃO: limpa as coleções antes —
// use apenas em ambiente de demonstração/desenvolvimento, nunca em produção.

const bcrypt = require('bcryptjs');
const Usuario = require('../src/models/Usuario');
const Estabelecimento = require('../src/models/Estabelecimento');
const Produto = require('../src/models/Produto');
const Compra = require('../src/models/Compra');
const HistoricoPreco = require('../src/models/HistoricoPreco');
const compraService = require('../src/services/compraService');

const ESTABELECIMENTOS = [
  { nome: 'Atacadão Nova Serrana', cnpj: '11111111000111', endereco: 'Av. Brasil, 999, Nova Serrana - MG', localizacao: { lat: -19.870, lng: -44.990 } },
  { nome: 'Supermercado BH', cnpj: '22222222000122', endereco: 'Rua São Paulo, 120, Nova Serrana - MG', localizacao: { lat: -19.876, lng: -44.980 } },
  { nome: 'Mercado São José', cnpj: '33333333000133', endereco: 'Rua Minas Gerais, 45, Nova Serrana - MG', localizacao: { lat: -19.882, lng: -44.975 } },
];

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Cada "compra": estabelecimento, data e itens { nome, preco }
const COMPRAS = [
  { loja: 0, dias: 20, itens: [['Arroz Tiojoão 5kg', 22.90], ['Feijão Carioca 1kg', 8.50], ['Café Pilão 500g', 17.99], ['Leite Integral 1L', 4.79], ['Açúcar União 1kg', 4.20], ['Coca-Cola 2L', 8.99], ['Sabão em pó OMO 1kg', 18.90]] },
  { loja: 1, dias: 12, itens: [['Arroz Tiojoão 5kg', 24.50], ['Feijão Carioca 1kg', 9.20], ['Café Pilão 500g', 19.50], ['Leite Integral 1L', 5.10], ['Coca-Cola 2L', 9.99], ['Sabão em pó OMO 1kg', 21.00]] },
  { loja: 2, dias: 5, itens: [['Arroz Tiojoão 5kg', 23.80], ['Feijão Carioca 1kg', 8.90], ['Café Pilão 500g', 18.75], ['Açúcar União 1kg', 4.50], ['Coca-Cola 2L', 9.49]] },
  { loja: 0, dias: 1, itens: [['Arroz Tiojoão 5kg', 22.50], ['Café Pilão 500g', 17.50], ['Leite Integral 1L', 4.59]] },
];

async function seed() {
  await Promise.all([
    Usuario.deleteMany({}),
    Estabelecimento.deleteMany({}),
    Produto.deleteMany({}),
    Compra.deleteMany({}),
    HistoricoPreco.deleteMany({}),
  ]);

  const senhaHash = await bcrypt.hash('senha123', 10);
  const usuario = await Usuario.create({ nome: 'João Demonstração', email: 'demo@consultprice.com', senha: senhaHash });

  const lojas = await Estabelecimento.create(ESTABELECIMENTOS);

  for (const compra of COMPRAS) {
    const loja = lojas[compra.loja];
    const data = diasAtras(compra.dias);

    const itens = [];
    const precos = [];
    for (const [nome, preco] of compra.itens) {
      const { produto } = await compraService.encontrarOuCriarProduto(nome);
      itens.push({ produto_id: produto._id, nome_original: nome, quantidade: 1, valor_unitario: preco, valor_total: preco });
      precos.push({ produto, valor: preco });
    }

    const valorTotal = Number(itens.reduce((s, i) => s + i.valor_total, 0).toFixed(2));
    const doc = await Compra.create({
      usuario_id: usuario._id,
      estabelecimento_id: loja._id,
      data_compra: data,
      valor_total: valorTotal,
      itens,
    });

    for (const { produto, valor } of precos) {
      await compraService.registrarPreco({ produto, estabelecimentoId: loja._id, compraId: doc._id, valor, data });
    }
  }

  return {
    usuarios: await Usuario.countDocuments(),
    estabelecimentos: await Estabelecimento.countDocuments(),
    produtos: await Produto.countDocuments(),
    compras: await Compra.countDocuments(),
    precos: await HistoricoPreco.countDocuments(),
  };
}

module.exports = seed;
