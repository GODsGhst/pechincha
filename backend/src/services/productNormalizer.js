// Sistema de tratamento de dados dos produtos.
// A NFC-e costuma trazer descrições irregulares ("COCACOLA2L",
// "REFRI COCA COLA PET 2L", "DETERG YPE GIRASSOL 500ML"). Aqui criamos uma
// chave controlada por categoria/tipo/marca/tamanho para juntar o mesmo produto
// sem misturar variações reais.

const Fuse = require('fuse.js');
const Produto = require('../models/Produto');

const LIMIAR_DEDUP = 0.22;
const LIMIAR_BUSCA = 0.4;

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
  { tipo: 'Refrigerante', categoria: 'Bebidas', aliases: ['refrigerante', 'refri', 'coca cola', 'cocacola', 'guarana', 'guaraná', 'fanta', 'sprite', 'pepsi'] },
  { tipo: 'Água', categoria: 'Bebidas', aliases: ['agua', 'água', 'mineral'] },
  { tipo: 'Suco', categoria: 'Bebidas', aliases: ['suco', 'nectar', 'néctar'] },
  { tipo: 'Cerveja', categoria: 'Bebidas', aliases: ['cerveja', 'long neck', 'latinha'] },
  { tipo: 'Leite', categoria: 'Bebidas', aliases: ['leite', 'integral', 'desnatado', 'semidesnatado'] },

  { tipo: 'Detergente', categoria: 'Limpeza', aliases: ['detergente', 'detengerte', 'deterg', 'det', 'lava loucas', 'lava louças'] },
  { tipo: 'Amaciante', categoria: 'Limpeza', aliases: ['amaciante', 'amac'] },
  { tipo: 'Sabão', categoria: 'Limpeza', aliases: ['sabao', 'sabão', 'sabao po', 'sabão pó', 'lava roupas'] },
  { tipo: 'Desinfetante', categoria: 'Limpeza', aliases: ['desinfetante', 'desinf'] },
  { tipo: 'Água sanitária', categoria: 'Limpeza', aliases: ['agua sanitaria', 'água sanitária', 'sanitaria', 'sanitária'] },
  { tipo: 'Limpador', categoria: 'Limpeza', aliases: ['limpador', 'multiuso', 'limpa'] },
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
  { marca: 'Coca-Cola', aliases: ['coca cola', 'cocacola', 'coca'] },
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
  { marca: 'Guaraná Antarctica', aliases: ['guarana antarctica', 'guaraná antarctica', 'antarctica'] }
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

  if (analise.tipo) partes.push(analise.tipo);
  if (analise.marca) partes.push(analise.marca);
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

async function enriquecerProduto(produto, analise, nomeNovo) {
  const set = {};
  const normalizadoExibicao = normalizarTexto(nomeNovo);
  if (!produto.nome_normalizado || produto.nome_normalizado !== normalizadoExibicao) {
    set.nome_normalizado = normalizadoExibicao;
  }
  if (!produto.categoria && analise.categoria) set.categoria = analise.categoria;
  if (!produto.marca && analise.marca) set.marca = analise.marca;
  if (!produto.tipo && analise.tipo) set.tipo = analise.tipo;
  if (deveTrocarNome(produto, nomeNovo, analise)) set.nome = nomeNovo;

  if (Object.keys(set).length === 0) return produto;
  await Produto.updateOne({ _id: produto._id }, { $set: set });
  Object.assign(produto, set);
  return produto;
}

async function encontrarOuCriarProduto(nomeBruto) {
  const nome = limparNome(nomeBruto) || 'PRODUTO';
  const analise = analisarProduto(nome);
  const nomeExibicao = formatarNomeProduto(nome, analise);
  const nomeNormalizado = normalizarTexto(nomeExibicao);

  const produtos = await Produto.find();
  if (produtos.length > 0) {
    const analisados = produtos.map((produto) => ({ produto, analise: analiseDoProdutoSalvo(produto) }));

    if (analise.confiavel) {
      const exato = analisados.find((entrada) => entrada.analise.confiavel && entrada.analise.chave === analise.chave);
      if (exato) {
        const produto = await enriquecerProduto(exato.produto, analise, nomeExibicao);
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
      return { produto, novo: false };
    }
  }

  const criado = await Produto.create({
    nome: nomeExibicao,
    nome_normalizado: nomeNormalizado,
    categoria: analise.categoria,
    marca: analise.marca,
    tipo: analise.tipo
  });
  return { produto: criado, novo: true };
}

async function buscarProdutos(descricao, filtros = {}) {
  const analiseBusca = analisarProduto(descricao);
  if (!analiseBusca.normalizado) return [];

  const query = {};
  if (filtros.categoria) query.categoria = new RegExp(`^${escapeRegex(filtros.categoria)}$`, 'i');
  if (filtros.tipo) query.tipo = new RegExp(`^${escapeRegex(filtros.tipo)}$`, 'i');
  if (filtros.marca) query.marca = new RegExp(`^${escapeRegex(filtros.marca)}$`, 'i');

  const produtos = await Produto.find(query);
  if (produtos.length === 0) return [];

  const entradas = produtos.map((p) => {
    const analise = analiseDoProdutoSalvo(p);
    return {
      ref: p,
      texto: [analise.chave, analise.normalizado, p.marca, p.tipo, p.categoria].filter(Boolean).join(' ')
    };
  });

  const tokens = tokenizar(analiseBusca.comparavel);
  const usarEstendida = tokens.length > 0;
  const fuse = new Fuse(entradas, {
    keys: ['texto'],
    threshold: LIMIAR_BUSCA,
    ignoreLocation: true,
    useExtendedSearch: usarEstendida
  });

  const queryFuse = usarEstendida ? tokens.map((t) => `'${t}`).join(' ') : analiseBusca.normalizado;
  return fuse.search(queryFuse).map((r) => r.item.ref);
}

module.exports = {
  encontrarOuCriarProduto,
  buscarProdutos,
  normalizarTexto,
  tokenizar,
  analisarProduto,
  formatarNomeProduto,
  LIMIAR_DEDUP,
  LIMIAR_BUSCA
};
