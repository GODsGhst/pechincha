// Teste do sistema de tratamento de dados (normalização + fuzzy matching).
// Roda com: npm run test:norm  (usa MongoDB em memória).

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { encontrarOuCriarProduto, normalizarTexto, buscarProdutos, analisarProduto, formatarNomeProduto } = require('../src/services/productNormalizer');

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
  check(b.produto.nome === 'Tio João 5kg', 'nome de exibição fica padronizado');
  check(b.produto.categoria === 'Alimentos' && b.produto.tipo === 'Arroz' && b.produto.marca === 'Tio João',
    'arroz recebe categoria/tipo/marca');
  check(b.produto.quantidade === '5kg', 'arroz recebe quantidade/tamanho');

  const c = await encontrarOuCriarProduto('ARROZ 1KG');
  check(c.novo === true, 'tamanho diferente -> produto NOVO (não junta indevidamente)');

  const d = await encontrarOuCriarProduto('CEBOLA BRANCA kg');
  check(d.novo === true, 'produto SEM marca é aceito normalmente');

  const coca1 = await encontrarOuCriarProduto('REFRI COCA COLA PET 2L');
  const coca2 = await encontrarOuCriarProduto('cocacola2L');
  const coca3 = await encontrarOuCriarProduto('COCA-COLA 2 L');
  const coca4 = await encontrarOuCriarProduto('coca2l');
  const coca200 = await encontrarOuCriarProduto('COCA-COLA CAC ZERO 200ML');
  check([coca2, coca3, coca4].every((r) => !r.novo && String(r.produto._id) === String(coca1.produto._id)),
    'cocacola2L / coca-cola 2L / coca2L -> MESMO produto');
  check(coca200.novo === true && String(coca200.produto._id) !== String(coca1.produto._id),
    'Coca-Cola 200ml não mistura com Coca-Cola 2L');
  check(coca1.produto.nome === 'Coca-Cola 2L', 'Coca-Cola fica com nome organizado');
  check(coca1.produto.categoria === 'Bebidas' && coca1.produto.tipo === 'Refrigerante' && coca1.produto.marca === 'Coca-Cola',
    'Coca-Cola recebe categoria/tipo/marca');
  check(coca1.produto.quantidade === '2L', 'Coca-Cola recebe quantidade/tamanho');

  const det1 = await encontrarOuCriarProduto('DETERGENTE YPE GIRASSOL 500ML');
  const det2 = await encontrarOuCriarProduto('DETERG YPE GIRASSOL 500 ML');
  check(det2.novo === false && String(det2.produto._id) === String(det1.produto._id),
    'detergente Ypê com abreviação -> MESMO produto');
  check(det1.produto.nome === 'Ypê Girassol 500ml', 'detergente fica com nome organizado');
  check(det1.produto.categoria === 'Limpeza' && det1.produto.tipo === 'Detergente' && det1.produto.marca === 'Ypê',
    'detergente recebe categoria/tipo/marca');
  check(det1.produto.quantidade === '500ml', 'detergente recebe quantidade/tamanho');

  const ama1 = await encontrarOuCriarProduto('AMA');
  const ama2 = await encontrarOuCriarProduto('AMACIANTE AMA 2 LT');
  check(ama2.novo === true && String(ama2.produto._id) !== String(ama1.produto._id),
    'nome curto demais "AMA" não engole amaciante completo sem tamanho');
  const ama3 = await encontrarOuCriarProduto('AMA AMACIANTE 2L');
  check(ama3.novo === false && String(ama3.produto._id) === String(ama2.produto._id),
    'amaciantes Ama 2L escritos diferente -> MESMO produto');
  check(ama2.produto.nome === 'Ama 2L', 'amaciante fica com nome organizado');

  const analiseDet = analisarProduto('detengerte ype 500ml girassol');
  check(analiseDet.categoria === 'Limpeza' && analiseDet.marca === 'Ypê',
    'análise identifica marca/categoria em variação próxima');
  check(formatarNomeProduto('DETERGENTE YPE GIRASSOL 500ML') === 'Ypê Girassol 500ml',
    'formatador remove caixa alta inconsistente');

  const analiseAluminio = analisarProduto('ALUM BRILHALUMINIO LIMP TRAD 500ML');
  check(analiseAluminio.categoria === 'Limpeza' &&
    analiseAluminio.tipo === 'Limpa alumínio' &&
    analiseAluminio.marca === 'Brilhalumínio',
    'limpa alumínio recebe categoria/tipo/marca');
  check(formatarNomeProduto('ALUM BRILHALUMINIO LIMP TRAD 500ML') === 'Brilhalumínio Tradicional 500ml',
    'limpa alumínio fica com nome legível');

  const analiseChocolate = analisarProduto('NESTLE AO LEITE CHOC KITKAT 42G');
  check(analiseChocolate.categoria !== 'Bebidas' && analiseChocolate.tipo !== 'Leite',
    '"ao leite" não é classificado como bebida/leite');
  check(formatarNomeProduto('NESTLE AO LEITE CHOC KITKAT 42G') === 'Nestlé Choc Kitkat 42g',
    '"ao leite" não volta como extra no nome formatado');

  const analiseLeite = analisarProduto('LEITE ITAMBE INTEGRAL 1L');
  check(analiseLeite.categoria === 'Bebidas' && analiseLeite.tipo === 'Leite' && analiseLeite.quantidade === '1L',
    'leite líquido continua como Bebidas/Leite');

  const analiseHamburguer = analisarProduto('HAMBURGUER MISTO REZENDE 56G');
  check(analiseHamburguer.categoria === 'Açougue' &&
    analiseHamburguer.tipo === 'Hambúrguer' &&
    analiseHamburguer.marca === 'Rezende' &&
    analiseHamburguer.quantidade === '56g',
    'hambúrguer Rezende recebe categoria/tipo/marca/tamanho');

  const analiseBombom = analisarProduto('ARCOR BEIJINHO BOMBOM BON 15G');
  check(analiseBombom.categoria === 'Alimentos' &&
    analiseBombom.tipo === 'Bombom' &&
    analiseBombom.marca === 'Arcor' &&
    analiseBombom.quantidade === '15g',
    'bombom Arcor recebe categoria/tipo/marca/tamanho');

  const analiseSanitaria = analisarProduto('AGUA CLASSIC SANIT 5L');
  check(analiseSanitaria.categoria === 'Limpeza' &&
    analiseSanitaria.tipo === 'Água sanitária' &&
    analiseSanitaria.quantidade === '5L',
    'água sanitária não entra como bebida');

  const aguaMineral = await encontrarOuCriarProduto('CRYSTAL GAS MIN S 500ML');
  const produtoSanitaria = await encontrarOuCriarProduto('AGUA CLASSIC SANIT 5L');
  const buscaSanitaria = await buscarProdutos('agua sanit');
  check(buscaSanitaria.some((p) => String(p._id) === String(produtoSanitaria.produto._id)) &&
    !buscaSanitaria.some((p) => String(p._id) === String(aguaMineral.produto._id)),
    'busca "agua sanit" não retorna água mineral');

  const analiseCerveja = analisarProduto('BRAHMA CERV LATA 350ML');
  check(analiseCerveja.categoria === 'Bebidas' &&
    analiseCerveja.tipo === 'Cerveja' &&
    analiseCerveja.marca === 'Brahma' &&
    analiseCerveja.quantidade === '350ml',
    'cerveja abreviada recebe categoria/tipo/marca/tamanho');

  const analiseHalls = analisarProduto('DROPS HALLS MENTA 28G');
  check(analiseHalls.categoria === 'Alimentos' &&
    analiseHalls.tipo === 'Bala' &&
    analiseHalls.marca === 'Halls',
    'drops Halls entra como bala com marca');
  const hallsExtra = await encontrarOuCriarProduto('HALLS EXTRA FORTE 28G');
  const hallsExtraMdlz = await encontrarOuCriarProduto('HALLS EXTRA FORTE MDLZ 28G');
  const hallsMentaMdlz = await encontrarOuCriarProduto('HALLS MDLZ MENTA 28G');
  check(hallsExtraMdlz.novo === false && String(hallsExtraMdlz.produto._id) === String(hallsExtra.produto._id),
    'Halls Extra Forte com sigla de fabricante -> MESMO produto');
  check(hallsMentaMdlz.novo === true && String(hallsMentaMdlz.produto._id) !== String(hallsExtra.produto._id),
    'Halls Menta continua separado de Halls Extra Forte');
  check(formatarNomeProduto('HALLS EXTRA FORTE MDLZ 28G') === 'Halls Extra Forte 28g',
    'sigla de fabricante não aparece no nome formatado');

  const analiseDental = analisarProduto('ADVANC FRESH COLGATE CR DENTAL TOTAL 90G');
  check(analiseDental.categoria === 'Higiene' &&
    analiseDental.tipo === 'Creme dental' &&
    analiseDental.marca === 'Colgate',
    'creme dental Colgate entra como higiene');

  console.log('\n--- Busca tolerante ---');
  const busca = await buscarProdutos('arroz tio joao');
  check(busca.length >= 1 && busca.some((p) => p.nome.includes('Tio João')),
    '"arroz tio joao" encontra o produto mesmo sem o tamanho');

  const buscaBebida = await buscarProdutos('coca 2l', { categoria: 'Bebidas', tipo: 'Refrigerante' });
  check(buscaBebida.length === 1 && String(buscaBebida[0]._id) === String(coca1.produto._id),
    'busca aceita filtro por categoria/tipo');

  const buscaCoca2l = await buscarProdutos('coca 2l');
  check(buscaCoca2l.length === 1 && String(buscaCoca2l[0]._id) === String(coca1.produto._id),
    'busca "coca 2l" não retorna embalagem 200ml');

  const buscaQuantidade = await buscarProdutos('coca', { categoria: 'Bebidas', quantidade: '2L' });
  check(buscaQuantidade.length === 1 && String(buscaQuantidade[0]._id) === String(coca1.produto._id),
    'busca aceita filtro por quantidade');

  const buscaPrefixo = await buscarProdutos('coc');
  check(buscaPrefixo.some((p) => String(p._id) === String(coca1.produto._id)),
    'busca por prefixo "coc" encontra Coca-Cola');

  const buscaAlias = await buscarProdutos('cola 2l');
  check(buscaAlias.some((p) => String(p._id) === String(coca1.produto._id)),
    'busca por alias "cola 2l" encontra Coca-Cola');

  const buscaComErro = await buscarProdutos('detengerte girassol');
  check(buscaComErro.some((p) => String(p._id) === String(det1.produto._id)),
    'busca tolera erro de digitação em detergente');

  console.log(`\nResultado: ${ok} OK, ${falhou} falhas`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(falhou ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
