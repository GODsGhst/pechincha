// Teste do sistema de tratamento de dados (normalização + fuzzy matching).
// Roda com: npm run test:norm  (usa MongoDB em memória).

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { encontrarOuCriarProduto, normalizarTexto, buscarProdutos } = require('../src/services/productNormalizer');

let ok = 0;
let falhou = 0;
function check(cond, nome) {
  if (cond) { ok += 1; console.log('  OK  ', nome); }
  else { falhou += 1; console.log('FALHA ', nome); }
}

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('norm_test'));

  console.log('--- Normalização de texto ---');
  check(normalizarTexto('PÃO  DE Fôrma') === 'pao de forma', 'remove acento, caixa e espaços extras');

  console.log('\n--- Deduplicação por similaridade ---');
  const a = await encontrarOuCriarProduto('ARROZ TIO JOAO 5KG');
  check(a.novo === true, 'cria "ARROZ TIO JOAO 5KG"');

  const b = await encontrarOuCriarProduto('Arroz Tio João 5 Kg');
  check(b.novo === false && String(b.produto._id) === String(a.produto._id),
    'variação de escrita (acento/caixa/espaço) -> MESMO produto');

  const c = await encontrarOuCriarProduto('ARROZ 1KG');
  check(c.novo === true, 'tamanho diferente -> produto NOVO (não junta indevidamente)');

  const d = await encontrarOuCriarProduto('CEBOLA BRANCA kg');
  check(d.novo === true, 'produto SEM marca é aceito normalmente');

  console.log('\n--- Busca tolerante ---');
  const busca = await buscarProdutos('arroz tio joao');
  check(busca.length >= 1 && busca.some((p) => p.nome.includes('ARROZ TIO JOAO')),
    '"arroz tio joao" encontra o produto mesmo sem o tamanho');

  console.log(`\nResultado: ${ok} OK, ${falhou} falhas`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(falhou ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
