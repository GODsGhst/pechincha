// Lista de compras desejadas (carrinho). Mantida em memória durante a sessão.
// Aqui o usuário escolhe os produtos que quer comprar; a tela Lista mostra
// onde sai mais barato (enquadrado como economia — aversão à perda).

import { createContext, useContext, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [itens, setItens] = useState([]);

  function adicionar(produto) {
    setItens((prev) => (prev.some((i) => i.id === produto.id) ? prev : [...prev, { ...produto, selecionado: true }]));
  }
  function remover(id) {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }
  function alternar(id) {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, selecionado: !i.selecionado } : i)));
  }
  const contem = (id) => itens.some((i) => i.id === id);

  return (
    <CartContext.Provider value={{ itens, adicionar, remover, alternar, contem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de CartProvider');
  return ctx;
}
