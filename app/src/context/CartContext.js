// Lista de compras desejadas. O estado local espelha a lista salva no backend,
// permitindo que app e site mostrem os mesmos itens do usuário.

import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { usuario } = useAuth();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  function aplicarLista(lista) {
    setItens(lista?.itens || []);
    return lista;
  }

  async function carregarLista() {
    if (!usuario) {
      setItens([]);
      setCarregando(false);
      return null;
    }

    setCarregando(true);
    setErro(null);
    try {
      return aplicarLista(await api.get('/lista'));
    } catch (_e) {
      setErro('Não foi possível carregar sua lista.');
      setItens([]);
      return null;
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarLista();
  }, [usuario?.id]);

  async function adicionar(produto) {
    const produtoId = produto?.produto_id || produto?.id;
    if (!produtoId) return null;

    setErro(null);
    try {
      return aplicarLista(await api.post('/lista/itens', { produto_id: produtoId, quantidade: 1, selecionado: true }));
    } catch (_e) {
      setErro('Não foi possível adicionar o produto.');
      return null;
    }
  }

  async function remover(id) {
    setErro(null);
    try {
      return aplicarLista(await api.delete(`/lista/itens/${id}`));
    } catch (_e) {
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
    } catch (_e) {
      setErro('Não foi possível atualizar o item.');
      return null;
    }
  }

  async function alterarQuantidade(id, quantidade) {
    const valor = Math.max(1, Number(quantidade) || 1);
    setErro(null);
    try {
      return aplicarLista(await api.put(`/lista/itens/${id}`, { quantidade: valor }));
    } catch (_e) {
      setErro('Não foi possível atualizar a quantidade.');
      return null;
    }
  }

  async function limpar() {
    setErro(null);
    try {
      return aplicarLista(await api.delete('/lista'));
    } catch (_e) {
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
