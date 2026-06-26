// Teste de ponta a ponta da API usando um MongoDB em memória.
// Roda com: npm run test:api
// Não precisa de MongoDB instalado — o mongodb-memory-server baixa um
// binário temporário na primeira execução.

const { MongoMemoryServer } = require('mongodb-memory-server');

const HTML_SUPERMERCADO_ABC = `
<html><body>
<div class="txtCenter">
  <div class="txtTopo">SUPERMERCADO ABC LTDA</div>
  <div class="text">CNPJ: 12.345.678/0001-90</div>
  <div class="text">RUA DAS FLORES, 123, CENTRO, BELO HORIZONTE, MG</div>
</div>
<table id="tabResult">
  <tr><td><span class="txtTit2">ARROZ TIOJOAO 5KG</span><span class="Rqtd">Qtde.:1</span><span class="RvlUnit">Vl. Unit.: 24,50</span></td><td><span class="valor">24,50</span></td></tr>
  <tr><td><span class="txtTit2">FEIJAO CARIOCA 1KG</span><span class="Rqtd">Qtde.:2</span><span class="RvlUnit">Vl. Unit.: 8,90</span></td><td><span class="valor">17,80</span></td></tr>
  <tr><td><span class="txtTit2">CAFE PILAO 500G</span><span class="Rqtd">Qtde.:1</span><span class="RvlUnit">Vl. Unit.: 18,75</span></td><td><span class="valor">18,75</span></td></tr>
</table>
<div><span class="totalNumb txtMax">61,05</span></div>
<ul><li>Emissão: 01/06/2025 14:30:00</li></ul>
</body></html>`;

const HTML_ATACADAO_XYZ = `
<html><body>
<div class="txtCenter">
  <div class="txtTopo">ATACADAO XYZ LTDA</div>
  <div class="text">CNPJ: 98.765.432/0001-10</div>
  <div class="text">AV BRASIL, 999, SAVASSI, BELO HORIZONTE, MG</div>
</div>
<table id="tabResult">
  <tr><td><span class="txtTit2">ARROZ TIOJOAO 5KG</span><span class="Rqtd">Qtde.:1</span><span class="RvlUnit">Vl. Unit.: 22,90</span></td><td><span class="valor">22,90</span></td></tr>
  <tr><td><span class="txtTit2">FEIJAO CARIOCA 1KG</span><span class="Rqtd">Qtde.:2</span><span class="RvlUnit">Vl. Unit.: 8,50</span></td><td><span class="valor">17,00</span></td></tr>
  <tr><td><span class="txtTit2">CAFE PILAO 500G</span><span class="Rqtd">Qtde.:1</span><span class="RvlUnit">Vl. Unit.: 17,99</span></td><td><span class="valor">17,99</span></td></tr>
</table>
<div><span class="totalNumb txtMax">57,89</span></div>
<ul><li>Emissão: 05/06/2025 10:15:00</li></ul>
</body></html>`;

// Cupom com chave de acesso (44 dígitos, exibida agrupada com espaços a cada 4)
const HTML_COM_CHAVE = `
<html><body>
<div class="txtCenter">
  <div class="txtTopo">MERCADO CENTRAL LTDA</div>
  <div class="text">CNPJ: 11.222.333/0001-44</div>
  <div class="text">RUA NOVA, 50, CENTRO, BELO HORIZONTE, MG</div>
</div>
<table id="tabResult">
  <tr><td><span class="txtTit2">ACUCAR UNIAO 1KG</span><span class="Rqtd">Qtde.:1</span><span class="RvlUnit">Vl. Unit.: 4,50</span></td><td><span class="valor">4,50</span></td></tr>
</table>
<div><span class="totalNumb txtMax">4,50</span></div>
<ul><li>Emissão: 10/06/2025 09:00:00</li></ul>
<div class="chave">Chave de acesso 3125 0612 3456 7800 0190 6500 1000 0012 3410 0001 2345</div>
</body></html>`;

const HTML_CONCORRENTE = `
<html><body>
<div class="txtCenter">
  <div class="txtTopo">MERCADO CONCORRENTE LTDA</div>
  <div class="text">CNPJ: 55.666.777/0001-88</div>
  <div class="text">AV TESTE, 777, CENTRO, BELO HORIZONTE, MG</div>
</div>
<table id="tabResult">
  <tr><td><span class="txtTit2">MACARRAO DONA BENTA 500G</span><span class="Rqtd">Qtde.:1</span><span class="RvlUnit">Vl. Unit.: 6,00</span></td><td><span class="valor">6,00</span></td></tr>
</table>
<div><span class="totalNumb txtMax">6,00</span></div>
<ul><li>Emissão: 11/06/2025 11:00:00</li></ul>
<div class="chave">Chave de acesso 3125 0698 7654 3200 0110 6500 1000 0056 7810 0005 6789</div>
</body></html>`;

let passou = 0;
let falhou = 0;

function verificar(condicao, nome, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`  OK  ${nome}`);
  } else {
    falhou += 1;
    console.log(`FALHA ${nome} ${detalhe}`);
  }
}

async function main() {
  console.log('Iniciando MongoDB em memória...');
  const mongod = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongod.getUri('comparador_precos_teste');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo_de_teste';
  process.env.CORS_ORIGIN = 'https://pechincha-web.onrender.com';

  const app = require('../src/app');
  const connectDB = require('../src/config/database');
  const Usuario = require('../src/models/Usuario');
  const Compra = require('../src/models/Compra');
  const Produto = require('../src/models/Produto');
  const HistoricoPreco = require('../src/models/HistoricoPreco');
  const ImportacaoNfce = require('../src/models/ImportacaoNfce');
  const ListaCompra = require('../src/models/ListaCompra');
  const compraService = require('../src/services/compraService');
  await connectDB();

  const PORTA = 3210;
  const servidor = app.listen(PORTA);
  const base = `http://localhost:${PORTA}/api`;

  const req = async (metodo, rota, corpo, token, headersExtras = {}) => {
    const resposta = await fetch(base + rota, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headersExtras
      },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    let json = null;
    try { json = await resposta.json(); } catch (_e) { /* sem corpo */ }
    return { status: resposta.status, json, headers: resposta.headers };
  };

  console.log('\n--- Autenticação ---');
  const corsPermitido = await req('GET', '/produtos', null, null, { Origin: 'https://pechincha-web.onrender.com' });
  verificar(corsPermitido.status === 200 &&
    corsPermitido.headers.get('access-control-allow-origin') === 'https://pechincha-web.onrender.com',
    'CORS permite apenas origem web configurada');

  const corsBloqueado = await req('GET', '/produtos', null, null, { Origin: 'https://site-estranho.example' });
  verificar(corsBloqueado.status === 200 && !corsBloqueado.headers.get('access-control-allow-origin'),
    'CORS não libera origem desconhecida');

  const reg = await req('POST', '/auth/register', { nome: 'João Silva', email: 'joao@email.com', senha: 'senha123' });
  verificar(reg.status === 201 && !!reg.json.token, 'register retorna 201 + token');
  verificar(reg.json.usuario.papel === 'usuario', 'register retorna papel usuario');

  const usuarioSemSenha = await Usuario.findOne({ email: 'joao@email.com' });
  verificar(usuarioSemSenha && !usuarioSemSenha.senha, 'senha não é selecionada por padrão no Mongo');

  const regDup = await req('POST', '/auth/register', { nome: 'João Silva', email: 'joao@email.com', senha: 'senha123' });
  verificar(regDup.status === 409, 'register duplicado retorna 409');

  const login = await req('POST', '/auth/login', { email: 'joao@email.com', senha: 'senha123' });
  verificar(login.status === 200 && !!login.json.token, 'login retorna 200 + token');
  const token = login.json.token;

  const loginErrado = await req('POST', '/auth/login', { email: 'joao@email.com', senha: 'errada' });
  verificar(loginErrado.status === 401, 'login com senha errada retorna 401');

  const produtoDireto = await req('POST', '/produtos', { nome: 'PRODUTO DIRETO 1UN' }, token);
  verificar(produtoDireto.status === 403, 'usuário comum não cria produto direto');

  const estabelecimentoDireto = await req('POST', '/estabelecimentos', {
    nome: 'LOJA DIRETA',
    cnpj: '00.000.000/0001-00'
  }, token);
  verificar(estabelecimentoDireto.status === 403, 'usuário comum não cria estabelecimento direto');

  console.log('\n--- Administração ---');
  const adminReg = await req('POST', '/auth/register', { nome: 'Admin Geral', email: 'admin@email.com', senha: 'senha123' });
  verificar(adminReg.status === 201, 'cria usuário que será promovido a admin');
  await Usuario.updateOne({ email: 'admin@email.com' }, { $set: { papel: 'admin' } });
  const adminLogin = await req('POST', '/auth/login', { email: 'admin@email.com', senha: 'senha123' });
  verificar(adminLogin.status === 200 && adminLogin.json.usuario.papel === 'admin', 'login admin retorna papel admin');
  const adminToken = adminLogin.json.token;

  const resumoUsuario = await req('GET', '/admin/resumo', null, token);
  verificar(resumoUsuario.status === 403, 'usuário comum não acessa painel admin');

  const resumoAdmin = await req('GET', '/admin/resumo', null, adminToken);
  verificar(resumoAdmin.status === 200 && resumoAdmin.json.totais.usuarios >= 2,
    'admin acessa resumo administrativo');

  const usuariosAdmin = await req('GET', '/admin/usuarios', null, adminToken);
  verificar(usuariosAdmin.status === 200 && usuariosAdmin.json.usuarios.some((u) => u.email === 'admin@email.com'),
    'admin lista usuários');

  const adminUser = usuariosAdmin.json.usuarios.find((u) => u.email === 'admin@email.com');
  const removerUltimoAdmin = await req('PUT', `/admin/usuarios/${adminUser.id}/papel`, { papel: 'usuario' }, adminToken);
  verificar(removerUltimoAdmin.status === 400, 'não remove o último administrador');

  console.log('\n--- Processamento de NFC-e ---');
  const semToken = await req('POST', '/nfce/processar', { html: HTML_SUPERMERCADO_ABC });
  verificar(semToken.status === 401, 'processar sem token retorna 401');

  const urlLocalBloqueada = await req('POST', '/nfce/processar', { url_origem: 'http://127.0.0.1/notinha' }, token);
  verificar(urlLocalBloqueada.status === 422, 'NFC-e bloqueia URL local/privada');

  const nfce1 = await req('POST', '/nfce/processar', { html: HTML_SUPERMERCADO_ABC }, token);
  verificar(nfce1.status === 201, 'NFC-e 1 retorna 201', JSON.stringify(nfce1.json));
  verificar(nfce1.json.itens_processados === 3 && nfce1.json.itens_novos === 3, 'NFC-e 1: 3 itens, 3 novos');
  verificar(nfce1.json.valor_total === 61.05, 'NFC-e 1: valor_total 61.05');
  verificar(nfce1.json.estabelecimento === 'Supermercado ABC Ltda', 'NFC-e 1: estabelecimento extraído e formatado');
  const compraId = nfce1.json.compra_id;

  const nfce2 = await req('POST', '/nfce/processar', { html: HTML_ATACADAO_XYZ }, token);
  verificar(nfce2.status === 201, 'NFC-e 2 retorna 201');
  verificar(nfce2.json.itens_novos === 0, 'Deduplicação: mesmos produtos não duplicam (itens_novos = 0)', JSON.stringify(nfce2.json));

  console.log('\n--- Produtos e histórico ---');
  const busca = await req('GET', '/produtos?nome=arroz');
  verificar(busca.status === 200 && busca.json.produtos.length === 1, 'busca por nome acha 1 produto');
  const arroz = busca.json.produtos[0];
  verificar(arroz.menor_preco === 22.9, 'menor_preco do arroz é 22.90', `obtido: ${arroz.menor_preco}`);
  verificar(arroz.ultimo_preco && arroz.ultimo_preco.valor === 22.9, 'ultimo_preco do arroz é 22.90 (compra mais recente)');
  verificar(arroz.categoria === 'Alimentos' && arroz.tipo === 'Arroz' && arroz.marca === 'Tio João',
    'produto retorna categoria/tipo/marca');
  verificar(arroz.quantidade === '5kg', 'produto retorna quantidade/tamanho');
  verificar(typeof arroz.imagem_url === 'string' && arroz.imagem_url.includes('Golden%20Rice'),
    'produto retorna imagem pública quando conhecida');

  const adminAtualizaProduto = await req('PUT', `/produtos/${arroz.id}`, {
    categoria: 'Alimentos',
    tipo: 'Arroz',
    marca: 'Tio João'
  }, adminToken);
  verificar(adminAtualizaProduto.status === 200 && adminAtualizaProduto.json.marca === 'Tio João',
    'admin atualiza produto');

  const buscaPrefixo = await req('GET', '/produtos?nome=arr');
  verificar(buscaPrefixo.status === 200 && buscaPrefixo.json.produtos.some((p) => p.id === arroz.id),
    'busca por prefixo não exige nome exato');

  const filtroArroz = await req('GET', '/produtos?categoria=Alimentos&tipo=Arroz&quantidade=5kg');
  verificar(filtroArroz.status === 200 && filtroArroz.json.produtos.length === 1,
    'filtro por categoria/tipo/quantidade retorna arroz');

  const filtrosProdutos = await req('GET', '/produtos/filtros?categoria=Alimentos');
  verificar(filtrosProdutos.status === 200 && filtrosProdutos.json.tipos.includes('Arroz') && filtrosProdutos.json.quantidades.includes('5kg'),
    'endpoint de filtros retorna tipos e quantidades');

  const detalhe = await req('GET', `/produtos/${arroz.id}`);
  verificar(detalhe.status === 200 && detalhe.json.historico.length === 2, 'histórico do arroz tem 2 registros');
  verificar(detalhe.json.estatisticas.geral.media_preco === 23.7 &&
    detalhe.json.estatisticas.por_estabelecimento.length === 2,
    'detalhe retorna média geral e por estabelecimento');

  console.log('\n--- Lista sincronizada ---');
  const listaVazia = await req('GET', '/lista', null, token);
  verificar(listaVazia.status === 200 && listaVazia.json.itens.length === 0,
    'lista do usuário começa vazia');

  const listaComArroz = await req('POST', '/lista/itens', { produto_id: arroz.id, quantidade: 2 }, token);
  verificar(listaComArroz.status === 200 && listaComArroz.json.itens.length === 1,
    'adiciona produto na lista sincronizada');
  verificar(listaComArroz.json.itens[0].quantidade === 2 && listaComArroz.json.itens[0].quantidade_produto === '5kg',
    'lista separa quantidade desejada do tamanho do produto');

  const listaAtualizada = await req('PUT', `/lista/itens/${arroz.id}`, { quantidade: 3, selecionado: false }, token);
  verificar(listaAtualizada.status === 200 &&
    listaAtualizada.json.itens[0].quantidade === 3 &&
    listaAtualizada.json.itens[0].selecionado === false,
    'atualiza quantidade e seleção do item da lista');

  const listaRemovida = await req('DELETE', `/lista/itens/${arroz.id}`, null, token);
  verificar(listaRemovida.status === 200 && listaRemovida.json.itens.length === 0,
    'remove produto da lista sincronizada');

  const compraOriginal = await Compra.findById(compraId);
  const produtoArroz = await Produto.findById(arroz.id);
  const totalHistoricoAntes = await HistoricoPreco.countDocuments({ produto_id: produtoArroz._id });
  await compraService.registrarPreco({
    produto: produtoArroz,
    estabelecimentoId: compraOriginal.estabelecimento_id,
    compraId: compraOriginal._id,
    valor: 24.5,
    data: compraOriginal.data_compra
  });
  const totalHistoricoDepois = await HistoricoPreco.countDocuments({ produto_id: produtoArroz._id });
  verificar(totalHistoricoDepois === totalHistoricoAntes,
    'registrarPreco não cria duplicata na mesma compra/local/valor');

  const duplicadoManual = await HistoricoPreco.create({
    produto_id: produtoArroz._id,
    estabelecimento_id: compraOriginal.estabelecimento_id,
    compra_id: compraOriginal._id,
    valor: 24.5,
    data: new Date('2025-06-02T10:00:00Z')
  });
  const detalheCompactado = await req('GET', `/produtos/${arroz.id}`);
  const registroAbc = detalheCompactado.json.historico.find((h) => h.valor === 24.5);
  verificar(detalheCompactado.status === 200 && detalheCompactado.json.historico.length === 2 && registroAbc.observacoes >= 2,
    'detalhe do produto compacta preço repetido do mesmo local e valor');
  await HistoricoPreco.deleteOne({ _id: duplicadoManual._id });

  console.log('\n--- Compras ---');
  const compras = await req('GET', '/compras', null, token);
  verificar(compras.status === 200 && compras.json.compras.length === 2, 'usuário tem 2 compras');
  const compraDetalhe = await req('GET', `/compras/${compraId}`, null, token);
  verificar(compraDetalhe.status === 200 && compraDetalhe.json.itens.length === 3,
    'detalhe da compra abre a notinha com 3 itens');
  verificar(compraDetalhe.json.itens[0].quantidade === 1 && compraDetalhe.json.itens[0].valor_unitario === 24.5,
    'item da notinha preserva quantidade e valor unitário');
  verificar(compraDetalhe.json.itens[0].quantidade_produto === '5kg',
    'item da notinha mostra quantidade/tamanho do produto');

  console.log('\n--- Comparação (compra salva e cesta livre) ---');
  const total = await req('GET', `/comparacao/compras/${compraId}?visao=total`, null, token);
  verificar(total.status === 200 && total.json.comparacao.length === 2, 'visão total compara 2 estabelecimentos');
  const maisBarato = total.json.comparacao[0];
  verificar(maisBarato.estabelecimento === 'Atacadão XYZ Ltda' && maisBarato.total_estimado === 57.89,
    'cesta mais barata no Atacadão (57.89)', JSON.stringify(maisBarato));
  verificar(maisBarato.economia_vs_pago === 3.16, 'economia_vs_pago = 3.16', `obtido: ${maisBarato.economia_vs_pago}`);

  const unitario = await req('GET', `/comparacao/compras/${compraId}?visao=unitario`, null, token);
  verificar(unitario.status === 200 && unitario.json.itens.length === 3, 'visão unitário lista os 3 itens');
  verificar(unitario.json.resumo.economia_potencial === 3.16, 'economia_potencial do resumo = 3.16',
    JSON.stringify(unitario.json.resumo));

  const menores = await req('GET', '/comparacao/menores', null, token);
  verificar(menores.status === 200 && menores.json.menores_precos.length === 3,
    'sidebar: menores preços dos 3 produtos comprados');

  const buscaFeijao = await req('GET', '/produtos?nome=feijao');
  const buscaCafe = await req('GET', '/produtos?nome=cafe');
  const cestaLivre = await req('POST', '/comparacao/cesta', {
    itens: [
      { produto_id: arroz.id, quantidade: 1 },
      { produto_id: buscaFeijao.json.produtos[0].id, quantidade: 2 },
      { produto_id: buscaCafe.json.produtos[0].id, quantidade: 1 }
    ]
  }, token);
  verificar(cestaLivre.status === 200 && cestaLivre.json.comparacao.length === 2,
    'cesta livre compara 2 estabelecimentos', JSON.stringify(cestaLivre.json));
  const cestaMaisBarata = cestaLivre.json.comparacao[0];
  verificar(cestaMaisBarata.estabelecimento === 'Atacadão XYZ Ltda' && cestaMaisBarata.total_estimado === 57.89,
    'cesta livre mais barata no Atacadão (57.89)', JSON.stringify(cestaMaisBarata));
  verificar(cestaLivre.json.resumo.total_melhores_individuais === 57.89,
    'cesta livre: soma dos menores individuais = 57.89', JSON.stringify(cestaLivre.json.resumo));

  const cestaInvalida = await req('POST', '/comparacao/cesta', { itens: [{ produto_id: 'id ruim' }] }, token);
  verificar(cestaInvalida.status === 400, 'cesta com produto_id inválido retorna 400');

  console.log('\n--- Mapa ---');
  const mapa = await req('GET', '/estabelecimentos/mapa');
  verificar(mapa.status === 200 && mapa.json.estabelecimentos.length === 2, 'mapa retorna 2 estabelecimentos');
  const atacadao = mapa.json.estabelecimentos.find((e) => e.nome === 'Atacadão XYZ Ltda');
  verificar(atacadao && atacadao.produtos_mais_baratos === 3, 'Atacadão tem o menor preço dos 3 produtos',
    JSON.stringify(atacadao));

  // Por último, para não perturbar as contagens acima (adiciona estabelecimento/produto novos)
  console.log('\n--- Chave de acesso e deduplicação de cupom ---');
  const comChave = await req('POST', '/nfce/processar', { html: HTML_COM_CHAVE }, token);
  verificar(comChave.status === 201, 'cupom com chave retorna 201');
  verificar(comChave.json.chave_acesso === '31250612345678000190650010000012341000012345',
    'chave de acesso extraída (44 dígitos, espaços removidos)', JSON.stringify(comChave.json.chave_acesso));

  const reimport = await req('POST', '/nfce/processar', { html: HTML_COM_CHAVE }, token);
  verificar(reimport.status === 409, 'reimportar o mesmo cupom retorna 409', JSON.stringify(reimport.json));
  verificar(reimport.json.compra_id === comChave.json.compra_id,
    '409 aponta para a compra já existente');

  console.log('\n--- Concorrência de leitura do mesmo cupom ---');
  const concorrentes = await Promise.all([
    req('POST', '/nfce/processar', { html: HTML_CONCORRENTE }, token),
    req('POST', '/nfce/processar', { html: HTML_CONCORRENTE }, token)
  ]);
  const criadas = concorrentes.filter((r) => r.status === 201);
  const duplicadas = concorrentes.filter((r) => r.status === 409);
  verificar(criadas.length === 1 && duplicadas.length === 1,
    'duas leituras simultâneas geram 1 compra e 1 resposta de duplicado/processando',
    JSON.stringify(concorrentes.map((r) => ({ status: r.status, json: r.json }))));

  const chaveConcorrente = '31250698765432000110650010000056781000056789';
  verificar(duplicadas[0] && duplicadas[0].json.chave_acesso === chaveConcorrente &&
    ['processando', 'concluida'].includes(duplicadas[0].json.status_importacao),
    'resposta concorrente informa chave e status da importação');

  const comprasConcorrentes = await Compra.countDocuments({ chave_acesso: chaveConcorrente });
  const importacoesConcorrentes = await ImportacaoNfce.countDocuments({ chave_acesso: chaveConcorrente });
  const historicosConcorrentes = criadas[0]
    ? await HistoricoPreco.countDocuments({ compra_id: criadas[0].json.compra_id })
    : 0;
  verificar(comprasConcorrentes === 1 && importacoesConcorrentes === 1 && historicosConcorrentes === 1,
    'concorrência não duplica compra, trava de importação nem histórico de preço');

  console.log('\n--- Privacidade e exclusão de conta ---');
  const comprasDoUsuarioAntes = await Compra.find({ usuario_id: login.json.usuario.id }).select('_id');
  const idsComprasUsuario = comprasDoUsuarioAntes.map((c) => c._id);
  const excluirConta = await req('DELETE', '/auth/me', null, token);
  verificar(excluirConta.status === 200, 'usuário exclui a própria conta');
  verificar(await Usuario.countDocuments({ email: 'joao@email.com' }) === 0,
    'exclusão remove o usuário');
  verificar(await Compra.countDocuments({ usuario_id: login.json.usuario.id }) === 0 &&
    await ImportacaoNfce.countDocuments({ usuario_id: login.json.usuario.id }) === 0 &&
    await ListaCompra.countDocuments({ usuario_id: login.json.usuario.id }) === 0,
    'exclusão remove compras, importações e lista do usuário');
  verificar(await HistoricoPreco.countDocuments({ compra_id: { $in: idsComprasUsuario } }) === 0,
    'exclusão remove histórico de preço vinculado às compras do usuário');

  console.log(`\nResultado: ${passou} verificações OK, ${falhou} falhas`);

  servidor.close();
  await require('mongoose').disconnect();
  await mongod.stop();
  process.exit(falhou > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
