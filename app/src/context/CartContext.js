// Lista de compras desejadas. O estado local espelha a lista salva no backend,
// permitindo que app e site mostrem os mesmos itens do usuário.

import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);
const FILA_LISTA_PREFIX = 'pechincha.listaQueue.v1';

function chaveFila(usuarioId) {
  return `${FILA_LISTA_PREFIX}:${usuarioId || 'anon'}`;
}

function erroDeConexao(erro) {
  return !erro || erro.status === undefined || erro.status === 'timeout';
}

function itemLocalDoProduto(produto, quantidade = 1, selecionado = true) {
  const id = String(produto?.produto_id || produto?.id || '');
  return {
    id,
    produto_id: id,
    nome: produto?.nome || 'Produto',
    categoria: produto?.categoria || null,
    tipo: produto?.tipo || null,
    marca: produto?.marca || null,
    quantidade_produto: produto?.quantidade_produto || produto?.quantidade || null,
    imagem_url: produto?.imagem_url || null,
    imagem_credito: produto?.imagem_credito || null,
    menor_preco: produto?.menor_preco ?? null,
    preco_unidade: produto?.preco_unidade || null,
    confianca_preco: produto?.confianca_preco || null,
    ultimo_preco: produto?.ultimo_preco || null,
    quantidade,
    selecionado,
    pendente_sync: true
  };
}

function adicionarLocalmente(lista, produto, body) {
  const produtoId = String(produto?.produto_id || produto?.id || body?.produto_id || '');
  if (!produtoId) return lista;
  const existe = lista.some((item) => item.id === produtoId);
  if (existe) {
    return lista.map((item) => item.id === produtoId
      ? { ...item, quantidade: body.quantidade || item.quantidade || 1, selecionado: body.selecionado !== undefined ? body.selecionado : item.selecionado, pendente_sync: true }
      : item);
  }
  return [...lista, itemLocalDoProduto(produto || body, body.quantidade || 1, body.selecionado !== false)];
}

export function CartProvider({ children }) {
  const { usuario } = useAuth();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [pendentesFila, setPendentesFila] = useState(0);
  const [sincronizandoFila, setSincronizandoFila] = useState(false);

  function aplicarLista(lista) {
    setItens(lista?.itens || []);
    return lista;
  }

  async function carregarLista(manual = false) {
    if (!usuario) {
      setItens([]);
      setCarregando(false);
      return null;
    }

    setCarregando(true);
    setErro(null);
    try {
      const lista = aplicarLista(await api.get('/lista', {
        cacheMs: 30000,
        forceRefresh: manual
      }));
      if (manual) sincronizarFila();
      return lista;
    } catch (_e) {
      setErro('Não foi possível carregar sua lista.');
      return null;
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!usuario) {
      setPendentesFila(0);
      return;
    }
    carregarLista();
    sincronizarFila();
  }, [usuario?.id]);

  async function lerFila() {
    if (!usuario?.id) return [];
    try {
      const bruto = await AsyncStorage.getItem(chaveFila(usuario.id));
      const fila = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(fila) ? fila : [];
    } catch (_e) {
      await AsyncStorage.removeItem(chaveFila(usuario.id));
      return [];
    }
  }

  async function salvarFila(fila) {
    if (!usuario?.id) return;
    const limpa = Array.isArray(fila) ? fila.slice(-80) : [];
    await AsyncStorage.setItem(chaveFila(usuario.id), JSON.stringify(limpa));
    setPendentesFila(limpa.length);
  }

  async function enfileirar(acao) {
    const fila = await lerFila();
    const proxima = [...fila, { ...acao, criado_em: new Date().toISOString() }];
    await salvarFila(proxima);
  }

  async function executarAcao(acao) {
    if (acao.tipo === 'adicionar') {
      return api.post('/lista/itens', acao.body);
    }
    if (acao.tipo === 'remover') {
      return api.delete(`/lista/itens/${acao.produto_id}`);
    }
    if (acao.tipo === 'atualizar') {
      return api.put(`/lista/itens/${acao.produto_id}`, acao.body);
    }
    if (acao.tipo === 'limpar') {
      return api.delete('/lista');
    }
    return null;
  }

  async function sincronizarFila() {
    if (!usuario?.id || sincronizandoFila) return;
    setSincronizandoFila(true);
    try {
      let fila = await lerFila();
      if (fila.length === 0) {
        setPendentesFila(0);
        return;
      }

      while (fila.length > 0) {
        await executarAcao(fila[0]);
        fila = fila.slice(1);
        await salvarFila(fila);
      }

      const lista = await api.get('/lista', { cacheMs: 30000, forceRefresh: true });
      aplicarLista(lista);
      setErro(null);
    } catch (_e) {
      setErro('Há alterações offline aguardando conexão para sincronizar.');
    } finally {
      setSincronizandoFila(false);
    }
  }

  async function adicionar(produto) {
    const produtoId = produto?.produto_id || produto?.id;
    if (!produtoId) return null;

    setErro(null);
    try {
      return aplicarLista(await api.post('/lista/itens', { produto_id: produtoId, quantidade: 1, selecionado: true }));
    } catch (e) {
      if (erroDeConexao(e)) {
        const body = { produto_id: produtoId, quantidade: 1, selecionado: true };
        const listaLocal = { itens: adicionarLocalmente(itens, produto, body) };
        aplicarLista(listaLocal);
        await enfileirar({ tipo: 'adicionar', body });
        setErro('Sem internet. Item salvo no aparelho e será sincronizado depois.');
        return listaLocal;
      }
      setErro('Não foi possível adicionar o produto.');
      return null;
    }
  }

  async function remover(id) {
    setErro(null);
    try {
      return aplicarLista(await api.delete(`/lista/itens/${id}`));
    } catch (e) {
      if (erroDeConexao(e)) {
        const listaLocal = { itens: itens.filter((item) => item.id !== id) };
        aplicarLista(listaLocal);
        await enfileirar({ tipo: 'remover', produto_id: id });
        setErro('Sem internet. Remoção salva e será sincronizada depois.');
        return listaLocal;
      }
      setErro('Não foi possível remover o produto.');
      return null;
    }
  }

  async function alternar(id) {
    const item = itens.find((i) => i.id === id);
    if (!item) return null;

    setErro(null);
    try {
      return aplicarLista(await api.put(`/lista/itens/${id}`, { selecionado: !item.selecionado }));
    } catch (e) {
      if (erroDeConexao(e)) {
        const body = { selecionado: !item.selecionado };
        const listaLocal = { itens: itens.map((i) => i.id === id ? { ...i, ...body, pendente_sync: true } : i) };
        aplicarLista(listaLocal);
        await enfileirar({ tipo: 'atualizar', produto_id: id, body });
        setErro('Sem internet. Alteração salva e será sincronizada depois.');
        return listaLocal;
      }
      setErro('Não foi possível atualizar o item.');
      return null;
    }
  }

  async function alterarQuantidade(id, quantidade) {
    const valor = Math.max(1, Number(quantidade) || 1);
    setErro(null);
    try {
      return aplicarLista(await api.put(`/lista/itens/${id}`, { quantidade: valor }));
    } catch (e) {
      if (erroDeConexao(e)) {
        const body = { quantidade: valor };
        const listaLocal = { itens: itens.map((item) => item.id === id ? { ...item, quantidade: valor, pendente_sync: true } : item) };
        aplicarLista(listaLocal);
        await enfileirar({ tipo: 'atualizar', produto_id: id, body });
        setErro('Sem internet. Quantidade salva e será sincronizada depois.');
        return listaLocal;
      }
      setErro('Não foi possível atualizar a quantidade.');
      return null;
    }
  }

  async function limpar() {
    setErro(null);
    try {
      return aplicarLista(await api.delete('/lista'));
    } catch (e) {
      if (erroDeConexao(e)) {
        const listaLocal = { itens: [] };
        aplicarLista(listaLocal);
        await enfileirar({ tipo: 'limpar' });
        setErro('Sem internet. Limpeza salva e será sincronizada depois.');
        return listaLocal;
      }
      setErro('Não foi possível limpar a lista.');
      return null;
    }
  }

  const contem = (id) => itens.some((i) => i.id === id);

  return (
    <CartContext.Provider value={{
      itens,
      carregando,
      erro,
      carregarLista,
      adicionar,
      remover,
      alternar,
      alterarQuantidade,
      limpar,
      pendentesFila,
      sincronizandoFila,
      sincronizarFila,
      contem
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de CartProvider');
  return ctx;
}
