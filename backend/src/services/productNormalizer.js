// Sistema de tratamento de dados dos produtos.
// A NFC-e costuma trazer descrições irregulares ("COCACOLA2L",
// "REFRI COCA COLA PET 2L", "DETERG YPE GIRASSOL 500ML"). Aqui criamos uma
// chave controlada por categoria/tipo/marca/tamanho para juntar o mesmo produto
// sem misturar variações reais.

const Fuse = require('fuse.js');
const Produto = require('../models/Produto');

const LIMIAR_DEDUP = 0.22;
const LIMIAR_BUSCA = 0.48;
const CAMPOS_PRODUTO_DEDUP = 'nome nome_normalizado chave_dedup marca categoria tipo quantidade quantidade_normalizada imagem_url imagem_credito menor_preco ultimo_preco criado_em';
const MAX_PRODUTOS_FUZZY = 750;

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'para', 'por', 'a', 'o',
  'as', 'os', 'em', 'no', 'na', 'nos', 'nas'
]);

const TOKENS_GENERICOS = new Set([
  'pet', 'pct', 'pacote', 'garrafa', 'frasco', 'un', 'und', 'unid', 'unidade',
  'emb', 'embalagem', 'cx', 'caixa', 'lt', 'lts', 'litro', 'litros', 'ml', 'l',
  'kg', 'g', 'grama', 'gramas', 'quilo', 'quilos'
]);

const CATEGORIAS = [
  { categoria: 'Alimentos', aliases: ['alimento', 'alimentos', 'mercearia'] },
  { categoria: 'Bebidas', aliases: ['bebida', 'bebidas'] },
  { categoria: 'Limpeza', aliases: ['limpeza'] },
  { categoria: 'Higiene', aliases: ['higiene', 'perfumaria'] },
  { categoria: 'Açougue', aliases: ['acougue', 'açougue', 'carnes'] },
  { categoria: 'Hortifruti', aliases: ['hortifruti', 'horti', 'fruta', 'verdura', 'legume'] }
];

const TIPOS = [
  { tipo: 'Refrigerante', categoria: 'Bebidas', aliases: ['refrigerante', 'refri', 'coca cola', 'cocacola', 'cola', 'guarana', 'guaraná', 'fanta', 'sprite', 'pepsi'] },
  { tipo: 'Água', categoria: 'Bebidas', aliases: ['agua', 'água', 'mineral'] },
  { tipo: 'Suco', categoria: 'Bebidas', aliases: ['suco', 'nectar', 'néctar'] },
  { tipo: 'Cerveja', categoria: 'Bebidas', aliases: ['cerveja', 'long neck', 'latinha'] },
  { tipo: 'Leite', categoria: 'Bebidas', aliases: ['leite', 'integral', 'desnatado', 'semidesnatado'] },

  { tipo: 'Detergente', categoria: 'Limpeza', aliases: ['detergente', 'detengerte', 'deterg', 'det', 'lava loucas', 'lava louças'] },
  { tipo: 'Amaciante', categoria: 'Limpeza', aliases: ['amaciante', 'amac'] },
  { tipo: 'Sabão', categoria: 'Limpeza', aliases: ['sabao', 'sabão', 'sabao po', 'sabão pó', 'lava roupas'] },
  { tipo: 'Desinfetante', categoria: 'Limpeza', aliases: ['desinfetante', 'desinf'] },
  { tipo: 'Água sanitária', categoria: 'Limpeza', aliases: ['agua sanitaria', 'água sanitária', 'sanitaria', 'sanitária'] },
  { tipo: 'Limpa alumínio', categoria: 'Limpeza', aliases: ['limpa aluminio', 'limpa alumínio', 'brilha aluminio', 'brilhaluminio', 'aluminio', 'alum', 'limp'] },
  { tipo: 'Limpador', categoria: 'Limpeza', aliases: ['limpador', 'multiuso', 'limpa', 'limp'] },
  { tipo: 'Esponja', categoria: 'Limpeza', aliases: ['esponja', 'bombril', 'palha aco', 'palha aço'] },

  { tipo: 'Papel higiênico', categoria: 'Higiene', aliases: ['papel higienico', 'papel higiênico'] },
  { tipo: 'Sabonete', categoria: 'Higiene', aliases: ['sabonete'] },
  { tipo: 'Shampoo', categoria: 'Higiene', aliases: ['shampoo', 'xampu'] },
  { tipo: 'Condicionador', categoria: 'Higiene', aliases: ['condicionador'] },
  { tipo: 'Creme dental', categoria: 'Higiene', aliases: ['creme dental', 'pasta dental'] },
  { tipo: 'Desodorante', categoria: 'Higiene', aliases: ['desodorante', 'desod'] },
  { tipo: 'Absorvente', categoria: 'Higiene', aliases: ['absorvente'] },

  { tipo: 'Arroz', categoria: 'Alimentos', aliases: ['arroz'] },
  { tipo: 'Feijão', categoria: 'Alimentos', aliases: ['feijao', 'feijão'] },
  { tipo: 'Café', categoria: 'Alimentos', aliases: ['cafe', 'café'] },
  { tipo: 'Açúcar', categoria: 'Alimentos', aliases: ['acucar', 'açúcar'] },
  { tipo: 'Óleo', categoria: 'Alimentos', aliases: ['oleo', 'óleo'] },
  { tipo: 'Macarrão', categoria: 'Alimentos', aliases: ['macarrao', 'macarrão', 'massa'] },
  { tipo: 'Farinha', categoria: 'Alimentos', aliases: ['farinha'] },
  { tipo: 'Biscoito', categoria: 'Alimentos', aliases: ['biscoito', 'bolacha'] },
  { tipo: 'Molho', categoria: 'Alimentos', aliases: ['molho', 'extrato tomate'] },
  { tipo: 'Sal', categoria: 'Alimentos', aliases: ['sal'] },

  { tipo: 'Carne', categoria: 'Açougue', aliases: ['carne', 'bovino', 'patinho', 'acem', 'acém', 'alcatra'] },
  { tipo: 'Frango', categoria: 'Açougue', aliases: ['frango', 'peito frango', 'coxa', 'sobrecoxa'] },
  { tipo: 'Linguiça', categoria: 'Açougue', aliases: ['linguica', 'linguiça'] },

  { tipo: 'Banana', categoria: 'Hortifruti', aliases: ['banana'] },
  { tipo: 'Tomate', categoria: 'Hortifruti', aliases: ['tomate'] },
  { tipo: 'Cebola', categoria: 'Hortifruti', aliases: ['cebola'] },
  { tipo: 'Batata', categoria: 'Hortifruti', aliases: ['batata'] },
  { tipo: 'Alface', categoria: 'Hortifruti', aliases: ['alface'] }
];

const MARCAS = [
  { marca: 'Coca-Cola', aliases: ['coca cola', 'cocacola', 'coca', 'cola', 'coke'] },
  { marca: 'Ypê', aliases: ['ype', 'ypê'] },
  { marca: 'Ama', aliases: ['ama'] },
  { marca: 'Omo', aliases: ['omo'] },
  { marca: 'Tio João', aliases: ['tio joao', 'tiojoao', 't joao'] },
  { marca: 'Pilão', aliases: ['pilao', 'pilão'] },
  { marca: 'União', aliases: ['uniao', 'união'] },
  { marca: 'Nescau', aliases: ['nescau'] },
  { marca: 'Nestlé', aliases: ['nestle', 'nestlé'] },
  { marca: 'Itambé', aliases: ['itambe', 'itambé'] },
  { marca: 'Piracanjuba', aliases: ['piracanjuba'] },
  { marca: 'Italac', aliases: ['italac'] },
  { marca: 'Yoki', aliases: ['yoki'] },
  { marca: 'Qualitá', aliases: ['qualita', 'qualitá'] },
  { marca: 'Dona Benta', aliases: ['dona benta'] },
  { marca: 'Heineken', aliases: ['heineken'] },
  { marca: 'Skol', aliases: ['skol'] },
  { marca: 'Brahma', aliases: ['brahma'] },
  { marca: 'Pepsi', aliases: ['pepsi'] },
  { marca: 'Fanta', aliases: ['fanta'] },
  { marca: 'Sprite', aliases: ['sprite'] },
  { marca: 'Guaraná Antarctica', aliases: ['guarana antarctica', 'guaraná antarctica', 'antarctica'] },
  { marca: 'Brilhalumínio', aliases: ['brilhaluminio', 'brilha aluminio', 'brilha alumínio'] },
  { marca: 'Uau', aliases: ['uau'] }
];

function normalizarTexto(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ºª]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limparNome(texto) {
  return (texto || '').replace(/\s+/g, ' ').trim();
}

function prepararTextoComparacao(texto) {
  return normalizarTexto(texto)
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\blts?\b/g, 'l')
    .replace(/\blitros?\b/g, 'l')
    .replace(/\bquilos?\b/g, 'kg')
    .replace(/\bgramas?\b/g, 'g')
    .replace(/\bund?\b/g, 'un')
    .replace(/\bunid(?:ade)?s?\b/g, 'un')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizar(texto) {
  return prepararTextoComparacao(texto)
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function aliasNormalizado(alias) {
  return prepararTextoComparacao(alias);
}

function contemAlias(texto, alias) {
  const a = aliasNormalizado(alias);
  if (!a) return false;
  const regex = new RegExp(`(^|\\s)${escapeRegex(a)}($|\\s)`);
  return regex.test(texto);
}

function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectarPrimeiro(texto, lista) {
  return lista.find((entrada) => entrada.aliases.some((alias) => contemAlias(texto, alias))) || null;
}

function detectarCategoria(texto) {
  const porTipo = detectarPrimeiro(texto, TIPOS);
  if (porTipo) return porTipo.categoria;
  const porCategoria = detectarPrimeiro(texto, CATEGORIAS);
  return porCategoria ? porCategoria.categoria : null;
}

function extrairQuantidades(texto) {
  const quantidades = [];
  const regex = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|un)\b/g;
  let match;

  while ((match = regex.exec(texto)) !== null) {
    const numero = Number(match[1]);
    const unidade = match[2];
    if (!Number.isFinite(numero) || numero <= 0) continue;

    if (unidade === 'kg') quantidades.push(`${Math.round(numero * 1000)}g`);
    else if (unidade === 'l') quantidades.push(`${Math.round(numero * 1000)}ml`);
    else if (unidade === 'g') quantidades.push(`${Math.round(numero)}g`);
    else if (unidade === 'ml') quantidades.push(`${Math.round(numero)}ml`);
    else quantidades.push(`${Math.round(numero)}un`);
  }

  return [...new Set(quantidades)].sort();
}

function formatarQuantidade(quantidade) {
  const match = String(quantidade).match(/^(\d+)(ml|g|un)$/);
  if (!match) return quantidade;

  const valor = Number(match[1]);
  const unidade = match[2];
  if (unidade === 'ml' && valor >= 1000 && valor % 1000 === 0) return `${valor / 1000}L`;
  if (unidade === 'g' && valor >= 1000 && valor % 1000 === 0) return `${valor / 1000}kg`;
  if (unidade === 'ml') return `${valor}ml`;
  if (unidade === 'g') return `${valor}g`;
  return `${valor}un`;
}

function formatarQuantidades(quantidades = []) {
  return quantidades.map(formatarQuantidade).join(' + ') || null;
}

function normalizarQuantidades(quantidades = []) {
  return quantidades.join('|') || null;
}

function tituloToken(token) {
  const especiais = {
    acucar: 'Açúcar',
    agua: 'Água',
    acougue: 'Açougue',
    cafe: 'Café',
    feijao: 'Feijão',
    joao: 'João',
    limao: 'Limão',
    maca: 'Maçã',
    pao: 'Pão',
    po: 'Pó',
    sabao: 'Sabão',
    sanitaria: 'Sanitária',
    trad: 'Tradicional',
    tradicional: 'Tradicional',
    perf: 'Perfume',
    seducao: 'Sedução',
    verm: 'Vermelho',
    ype: 'Ypê'
  };
  if (especiais[token]) return especiais[token];
  if (/^\d+(?:\.\d+)?$/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function titleCaseTexto(texto) {
  return tokenizar(texto).map(tituloToken).join(' ');
}

function formatarNomeProduto(nomeBruto, analisePronta = null) {
  const analise = analisePronta || analisarProduto(nomeBruto);
  const partes = [];

  if (analise.marca) partes.push(analise.marca);
  else if (analise.tipo) partes.push(analise.tipo);
  for (const extra of analise.extras) partes.push(tituloToken(extra));
  for (const quantidade of analise.quantidades) partes.push(formatarQuantidade(quantidade));

  if (partes.length > 0) return partes.join(' ').replace(/\s+/g, ' ').trim();

  const fallback = titleCaseTexto(nomeBruto);
  return fallback || limparNome(nomeBruto) || 'Produto';
}

function tokensDosAliases(entrada) {
  if (!entrada) return new Set();
  const tokens = new Set();
  for (const alias of entrada.aliases || []) {
    for (const token of tokenizar(alias)) tokens.add(token);
  }
  return tokens;
}

function montarExtras(tokens, marcaInfo, tipoInfo) {
  const ignorar = new Set([
    ...tokensDosAliases(marcaInfo),
    ...tokensDosAliases(tipoInfo),
    ...CATEGORIAS.flatMap((c) => c.aliases.flatMap((a) => tokenizar(a)))
  ]);

  return [...new Set(tokens)]
    .filter((token) => !ignorar.has(token))
    .filter((token) => !TOKENS_GENERICOS.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .sort();
}

function qualidadeNome(nome, analise) {
  const tokens = tokenizar(nome);
  let pontos = Math.min(tokens.length, 8);
  if (analise.tipo) pontos += 3;
  if (analise.marca) pontos += 2;
  if (analise.quantidades.length > 0) pontos += 2;
  if (/\b(refri|deterg|amac|desinf|pct|und)\b/i.test(nome)) pontos -= 1;
  if (nome.length > 80) pontos -= 2;
  return pontos;
}

function deveTrocarNome(produto, nomeNovo, analiseNova) {
  const nomeAtual = limparNome(produto.nome);
  if (!nomeAtual) return true;
  if (nomeAtual.length <= 4 && nomeNovo.length > nomeAtual.length) return true;

  const analiseAtual = analisarProduto(nomeAtual, {
    categoria: produto.categoria,
    marca: produto.marca,
    tipo: produto.tipo
  });

  if (analiseAtual.chave !== analiseNova.chave) return false;
  return qualidadeNome(nomeNovo, analiseNova) > qualidadeNome(nomeAtual, analiseAtual) + 1;
}

function analisarProduto(nomeBruto, sobrescritas = {}) {
  const nome = limparNome(nomeBruto);
  const normalizado = normalizarTexto(nome);
  const comparavel = prepararTextoComparacao(nome);
  const tokens = tokenizar(comparavel);
  const marcaInfo = detectarPrimeiro(comparavel, MARCAS);
  let tipoInfo = detectarPrimeiro(comparavel, TIPOS);

  if (!tipoInfo && marcaInfo && ['Coca-Cola', 'Pepsi', 'Fanta', 'Sprite', 'Guaraná Antarctica'].includes(marcaInfo.marca)) {
    tipoInfo = TIPOS.find((entrada) => entrada.tipo === 'Refrigerante');
  }

  const marca = sobrescritas.marca || (marcaInfo ? marcaInfo.marca : null);
  const tipo = sobrescritas.tipo || (tipoInfo ? tipoInfo.tipo : null);
  const categoria = sobrescritas.categoria || (tipoInfo ? tipoInfo.categoria : detectarCategoria(comparavel));
  const quantidades = extrairQuantidades(comparavel);
  const extras = montarExtras(tokens, marcaInfo, tipoInfo);
  const quantidade = formatarQuantidades(quantidades);
  const quantidade_normalizada = normalizarQuantidades(quantidades);

  const partes = [categoria, tipo, marca, ...quantidades, ...extras].filter(Boolean);
  const chave = partes.join('|').toLowerCase();
  const confiavel = Boolean(
    (tipo && (marca || quantidades.length > 0 || extras.length > 0)) ||
    (marca && quantidades.length > 0) ||
    (categoria && tipo && extras.length > 0)
  );

  return {
    nome,
    normalizado,
    comparavel,
    tokens,
    marca,
    categoria,
    tipo,
    quantidades,
    quantidade,
    quantidade_normalizada,
    extras,
    chave: chave || normalizado,
    confiavel
  };
}

function analiseDoProdutoSalvo(produto) {
  return analisarProduto(produto.nome_normalizado || produto.nome, {
    categoria: produto.categoria || null,
    marca: produto.marca || null,
    tipo: produto.tipo || null
  });
}

function quantidadesIguais(a, b) {
  if (a.quantidades.length !== b.quantidades.length) return false;
  return a.quantidades.every((q, i) => q === b.quantidades[i]);
}

function valoresIguais(a, b) {
  return normalizarTexto(a || '') === normalizarTexto(b || '');
}

function normalizarQuantidadeFiltro(valor) {
  return normalizarQuantidades(extrairQuantidades(prepararTextoComparacao(valor)));
}

function analiseCombinaFiltros(analise, filtros = {}) {
  if (filtros.categoria && !valoresIguais(analise.categoria, filtros.categoria)) return false;
  if (filtros.tipo && !valoresIguais(analise.tipo, filtros.tipo)) return false;
  if (filtros.marca && !valoresIguais(analise.marca, filtros.marca)) return false;

  if (filtros.quantidade) {
    const quantidadeNormalizada = normalizarQuantidadeFiltro(filtros.quantidade);
    if (quantidadeNormalizada) {
      return analise.quantidade_normalizada === quantidadeNormalizada;
    }
    return valoresIguais(analise.quantidade, filtros.quantidade);
  }

  return true;
}

function mesmoEscopo(a, b) {
  if (a.quantidades.length !== b.quantidades.length) return false;
  if (a.quantidades.length > 0 && !quantidadesIguais(a, b)) return false;
  if (a.marca && b.marca && a.marca !== b.marca) return false;
  if (a.tipo && b.tipo && a.tipo !== b.tipo) return false;
  if (a.categoria && b.categoria && a.categoria !== b.categoria) return false;
  return true;
}

function intersecaoTokens(a, b) {
  const setA = new Set(a.tokens.filter((t) => !TOKENS_GENERICOS.has(t)));
  const setB = new Set(b.tokens.filter((t) => !TOKENS_GENERICOS.has(t)));
  if (setA.size === 0 || setB.size === 0) return 0;
  let iguais = 0;
  for (const token of setA) if (setB.has(token)) iguais += 1;
  return iguais / Math.min(setA.size, setB.size);
}

function tokensRelevantes(tokens = []) {
  return [...new Set(tokens)]
    .filter((token) => token.length >= 2)
    .filter((token) => !TOKENS_GENERICOS.has(token));
}

function tokenCombina(busca, candidato) {
  if (!busca || !candidato) return false;
  if (busca === candidato) return true;
  if (busca.length >= 3 && candidato.startsWith(busca)) return true;
  if (candidato.length >= 4 && busca.startsWith(candidato)) return true;
  return false;
}

function pontuarTokensBusca(tokensBusca, tokensProduto) {
  if (tokensBusca.length === 0) return 0;
  const tokensCandidatos = tokensRelevantes(tokensProduto);
  if (tokensCandidatos.length === 0) return 0;

  let combinados = 0;
  for (const tokenBusca of tokensBusca) {
    if (tokensCandidatos.some((tokenProduto) => tokenCombina(tokenBusca, tokenProduto))) {
      combinados += 1;
    }
  }
  return combinados / tokensBusca.length;
}

function textoBuscaProduto(produto, analise) {
  const partes = [
    produto.nome,
    produto.nome_normalizado,
    produto.chave_dedup,
    analise.chave,
    analise.normalizado,
    analise.comparavel,
    produto.marca,
    produto.tipo,
    produto.categoria,
    produto.quantidade,
    produto.quantidade_normalizada
  ].filter(Boolean);

  return tokenizar(partes.join(' ')).join(' ');
}

function mesclarProdutosPorId(...listas) {
  const porId = new Map();
  for (const lista of listas) {
    for (const produto of lista || []) {
      if (produto && produto._id && !porId.has(String(produto._id))) {
        porId.set(String(produto._id), produto);
      }
    }
  }
  return [...porId.values()];
}

function chaveDedupDaAnalise(analise) {
  return analise && analise.confiavel ? analise.chave : null;
}

function criarContextoNormalizacao() {
  return {
    analisados: [],
    consultas: new Map(),
    todosCarregados: false,
    porId: new Map(),
    porChave: new Map()
  };
}

function entradaDoProduto(produto) {
  return { produto, analise: analiseDoProdutoSalvo(produto) };
}

function memorizarProduto(contexto, produto) {
  if (!contexto || !produto || !produto._id) return;

  const chaveId = String(produto._id);
  const entrada = entradaDoProduto(produto);
  contexto.porId.set(chaveId, entrada);

  const chave = produto.chave_dedup || chaveDedupDaAnalise(entrada.analise);
  if (chave && !contexto.porChave.has(chave)) {
    contexto.porChave.set(chave, entrada);
  }

  const indice = contexto.analisados.findIndex((item) => String(item.produto._id) === chaveId);
  if (indice >= 0) contexto.analisados[indice] = entrada;
  else contexto.analisados.push(entrada);
}

async function buscarProdutoPorChave(chave, contexto) {
  if (!chave) return null;

  const emMemoria = contexto && contexto.porChave.get(chave);
  if (emMemoria) return emMemoria.produto;

  const produto = await Produto.findOne({ chave_dedup: chave }).select(CAMPOS_PRODUTO_DEDUP);
  if (produto) memorizarProduto(contexto, produto);
  return produto;
}

function montarQueryCandidatos(analise, filtros = {}) {
  const query = {};

  const categoria = filtros.categoria || analise.categoria;
  const tipo = filtros.tipo || analise.tipo;
  const marca = filtros.marca || analise.marca;
  const quantidadeNormalizada = filtros.quantidade_normalizada || analise.quantidade_normalizada;

  if (categoria) query.categoria = categoria;
  if (tipo) query.tipo = tipo;
  if (marca) query.marca = marca;
  if (quantidadeNormalizada) query.quantidade_normalizada = quantidadeNormalizada;

  return query;
}

async function carregarAnalisadosParaFuzzy(analise, contexto) {
  let produtos = [];
  const queryEscopo = montarQueryCandidatos(analise);
  const chaveConsulta = JSON.stringify(queryEscopo);

  if (contexto) {
    if (contexto.todosCarregados) return contexto.analisados;
    const emCache = contexto.consultas.get(chaveConsulta);
    if (emCache) return emCache;
  }

  if (Object.keys(queryEscopo).length > 0) {
    produtos = await Produto.find(queryEscopo)
      .select(CAMPOS_PRODUTO_DEDUP)
      .limit(MAX_PRODUTOS_FUZZY);
  }

  // Bancos antigos podem ainda não ter metadados suficientes. Esse fallback
  // roda no máximo uma vez por nota quando usamos contexto.
  if (produtos.length === 0) {
    produtos = await Produto.find()
      .select(CAMPOS_PRODUTO_DEDUP)
      .sort({ criado_em: -1 })
      .limit(MAX_PRODUTOS_FUZZY);
    if (contexto) contexto.todosCarregados = true;
  }

  const analisados = produtos.map(entradaDoProduto);
  if (contexto) {
    for (const entrada of analisados) memorizarProduto(contexto, entrada.produto);
    const analisadosDoContexto = analisados
      .map((entrada) => contexto.porId.get(String(entrada.produto._id)))
      .filter(Boolean);
    contexto.consultas.set(chaveConsulta, analisadosDoContexto);
  }

  return analisados;
}

async function enriquecerProduto(produto, analise, nomeNovo) {
  const set = {};
  const normalizadoExibicao = normalizarTexto(nomeNovo);
  const chaveDedup = chaveDedupDaAnalise(analise);
  if (!produto.nome_normalizado || produto.nome_normalizado !== normalizadoExibicao) {
    set.nome_normalizado = normalizadoExibicao;
  }
  if (chaveDedup && produto.chave_dedup !== chaveDedup) set.chave_dedup = chaveDedup;
  if (!produto.categoria && analise.categoria) set.categoria = analise.categoria;
  if (!produto.marca && analise.marca) set.marca = analise.marca;
  if (!produto.tipo && analise.tipo) set.tipo = analise.tipo;
  if (analise.quantidade && produto.quantidade !== analise.quantidade) set.quantidade = analise.quantidade;
  if (analise.quantidade_normalizada && produto.quantidade_normalizada !== analise.quantidade_normalizada) {
    set.quantidade_normalizada = analise.quantidade_normalizada;
  }
  if (deveTrocarNome(produto, nomeNovo, analise)) set.nome = nomeNovo;

  if (Object.keys(set).length === 0) return produto;
  await Produto.updateOne({ _id: produto._id }, { $set: set });
  Object.assign(produto, set);
  return produto;
}

async function encontrarOuCriarProduto(nomeBruto, contexto = null) {
  const nome = limparNome(nomeBruto) || 'PRODUTO';
  const analise = analisarProduto(nome);
  const nomeExibicao = formatarNomeProduto(nome, analise);
  const nomeNormalizado = normalizarTexto(nomeExibicao);
  const chaveDedup = chaveDedupDaAnalise(analise);

  if (chaveDedup) {
    const produtoPorChave = await buscarProdutoPorChave(chaveDedup, contexto);
    if (produtoPorChave) {
      const produto = await enriquecerProduto(produtoPorChave, analise, nomeExibicao);
      memorizarProduto(contexto, produto);
      return { produto, novo: false };
    }
  }

  const analisados = await carregarAnalisadosParaFuzzy(analise, contexto);
  if (analisados.length > 0) {

    if (analise.confiavel) {
      const exato = analisados.find((entrada) => entrada.analise.confiavel && entrada.analise.chave === analise.chave);
      if (exato) {
        const produto = await enriquecerProduto(exato.produto, analise, nomeExibicao);
        memorizarProduto(contexto, produto);
        return { produto, novo: false };
      }
    }

    const candidatos = analisados.filter((entrada) => mesmoEscopo(analise, entrada.analise));
    const porTexto = candidatos.map((entrada) => ({
      ref: entrada,
      texto: entrada.analise.confiavel ? entrada.analise.chave : entrada.analise.normalizado
    }));
    const fuse = new Fuse(porTexto, { keys: ['texto'], threshold: LIMIAR_DEDUP, ignoreLocation: true });
    const [melhor] = fuse.search(analise.confiavel ? analise.chave : analise.normalizado);

    if (melhor && (melhor.score <= LIMIAR_DEDUP || intersecaoTokens(analise, melhor.item.ref.analise) >= 0.8)) {
      const produto = await enriquecerProduto(melhor.item.ref.produto, analise, nomeExibicao);
      memorizarProduto(contexto, produto);
      return { produto, novo: false };
    }
  }

  const criado = await Produto.create({
    nome: nomeExibicao,
    nome_normalizado: nomeNormalizado,
    chave_dedup: chaveDedup,
    categoria: analise.categoria,
    marca: analise.marca,
    tipo: analise.tipo,
    quantidade: analise.quantidade,
    quantidade_normalizada: analise.quantidade_normalizada
  });
  memorizarProduto(contexto, criado);
  return { produto: criado, novo: true };
}

async function buscarProdutos(descricao, filtros = {}) {
  const analiseBusca = analisarProduto(descricao);
  if (!analiseBusca.normalizado) return [];

  const quantidadeNormalizada = filtros.quantidade
    ? normalizarQuantidades(extrairQuantidades(prepararTextoComparacao(filtros.quantidade)))
    : undefined;

  const queryEscopo = montarQueryCandidatos(analiseBusca, {
    categoria: filtros.categoria,
    tipo: filtros.tipo,
    marca: filtros.marca,
    quantidade_normalizada: quantidadeNormalizada
  });
  const queryFiltros = {};

  if (filtros.categoria) {
    queryEscopo.categoria = new RegExp(`^${escapeRegex(filtros.categoria)}$`, 'i');
    queryFiltros.categoria = queryEscopo.categoria;
  }
  if (filtros.tipo) {
    queryEscopo.tipo = new RegExp(`^${escapeRegex(filtros.tipo)}$`, 'i');
    queryFiltros.tipo = queryEscopo.tipo;
  }
  if (filtros.marca) {
    queryEscopo.marca = new RegExp(`^${escapeRegex(filtros.marca)}$`, 'i');
    queryFiltros.marca = queryEscopo.marca;
  }
  if (filtros.quantidade) {
    delete queryEscopo.quantidade_normalizada;
    queryEscopo.quantidade = new RegExp(`^${escapeRegex(filtros.quantidade)}$`, 'i');
    queryFiltros.quantidade = queryEscopo.quantidade;
  }

  const chaveBusca = chaveDedupDaAnalise(analiseBusca);
  if (chaveBusca) {
    const exatos = await Produto.find({ ...queryFiltros, chave_dedup: chaveBusca }).limit(20);
    if (exatos.length > 0) return exatos;
  }

  const consultas = new Map();
  const adicionarConsulta = (query) => {
    const assinatura = Object.entries(query)
      .map(([chave, valor]) => `${chave}:${String(valor)}`)
      .sort()
      .join('|');
    consultas.set(assinatura, query);
  };

  adicionarConsulta(queryEscopo);
  adicionarConsulta(queryFiltros);

  const listas = await Promise.all(
    [...consultas.values()].map((query) => Produto.find(query).limit(MAX_PRODUTOS_FUZZY))
  );
  let produtos = mesclarProdutosPorId(...listas);

  // Bancos antigos podem ter produtos sem categoria/tipo/marca gravados.
  // Quando um filtro zera a consulta indexada, carregamos uma janela recente e
  // aplicamos o filtro pela análise do nome para preservar a busca no app.
  if (produtos.length === 0 && Object.keys(queryFiltros).length > 0) {
    produtos = await Produto.find()
      .select(CAMPOS_PRODUTO_DEDUP)
      .sort({ criado_em: -1 })
      .limit(MAX_PRODUTOS_FUZZY);
  }
  if (produtos.length === 0) return [];

  const entradas = produtos.map((p) => {
    const analise = analiseDoProdutoSalvo(p);
    const texto = textoBuscaProduto(p, analise);
    return {
      ref: p,
      analise,
      texto,
      tokens: tokenizar(texto)
    };
  });

  const tokensBusca = tokensRelevantes([
    ...analiseBusca.tokens,
    ...tokenizar(analiseBusca.normalizado)
  ]);
  const fuse = new Fuse(entradas, {
    keys: ['texto'],
    threshold: LIMIAR_BUSCA,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2
  });

  const resultadosFuse = new Map(
    fuse.search(analiseBusca.comparavel || analiseBusca.normalizado)
      .map((resultado) => [String(resultado.item.ref._id), resultado.score ?? 0])
  );

  return entradas
    .filter((entrada) => analiseCombinaFiltros(entrada.analise, filtros))
    .map((entrada) => {
      const id = String(entrada.ref._id);
      const scoreFuse = resultadosFuse.has(id) ? resultadosFuse.get(id) : 1;
      const scoreTokens = pontuarTokensBusca(tokensBusca, entrada.tokens);
      const chaveIgual = chaveBusca && entrada.ref.chave_dedup === chaveBusca;
      const marcaCombina = Boolean(analiseBusca.marca && entrada.analise.marca === analiseBusca.marca);
      const tipoCombina = Boolean(analiseBusca.tipo && entrada.analise.tipo === analiseBusca.tipo);
      const quantidadeCombina = Boolean(
        analiseBusca.quantidade_normalizada &&
        entrada.analise.quantidade_normalizada === analiseBusca.quantidade_normalizada
      );
      const escopoNomeCombina = analiseBusca.marca ? marcaCombina : tipoCombina;
      const aceitoPorMetadado = Boolean(
        (escopoNomeCombina && (!analiseBusca.quantidade_normalizada || quantidadeCombina || scoreTokens >= 0.5)) ||
        (!analiseBusca.marca && !analiseBusca.tipo && quantidadeCombina && scoreTokens >= 0.5)
      );
      const aceitoPorFuse = resultadosFuse.has(id) &&
        (tokensBusca.length <= 1 ? scoreFuse <= 0.25 : scoreFuse <= LIMIAR_BUSCA);
      const aceitoPorTokens = scoreTokens >= (tokensBusca.length <= 1 ? 0.5 : 0.45) &&
        (!analiseBusca.marca || marcaCombina);
      const bonusEscopo =
        (analiseBusca.marca && entrada.analise.marca === analiseBusca.marca ? 0.08 : 0) +
        (analiseBusca.tipo && entrada.analise.tipo === analiseBusca.tipo ? 0.06 : 0) +
        (analiseBusca.quantidade_normalizada &&
          entrada.analise.quantidade_normalizada === analiseBusca.quantidade_normalizada ? 0.08 : 0);

      return {
        ref: entrada.ref,
        score: scoreFuse - (scoreTokens * 0.35) - bonusEscopo - (chaveIgual ? 0.4 : 0),
        aceito: chaveIgual || aceitoPorMetadado || aceitoPorFuse || aceitoPorTokens
      };
    })
    .filter((resultado) => resultado.aceito)
    .sort((a, b) => a.score - b.score)
    .slice(0, 50)
    .map((resultado) => resultado.ref);
}

module.exports = {
  encontrarOuCriarProduto,
  criarContextoNormalizacao,
  buscarProdutos,
  normalizarTexto,
  tokenizar,
  analisarProduto,
  analiseCombinaFiltros,
  formatarNomeProduto,
  formatarQuantidades,
  normalizarQuantidades,
  CATEGORIAS,
  TIPOS,
  MARCAS,
  LIMIAR_DEDUP,
  LIMIAR_BUSCA
};
