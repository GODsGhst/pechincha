import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleAlert,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  UserRound
} from 'lucide-react';
import { api, clearStoredSession, getStoredSession, setStoredSession } from './api';

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'R$ --';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function productMeta(product) {
  const packageAmount = product.quantidade_produto || (typeof product.quantidade === 'string' ? product.quantidade : null);
  return [product.categoria, product.tipo, product.marca, packageAmount]
    .filter(Boolean)
    .join(' · ');
}

function LoginView({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ nome: '', email: '', senha: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login'
        ? { email: form.email, senha: form.senha }
        : { nome: form.nome, email: form.email, senha: form.senha };
      const data = await api.post(path, body);
      setStoredSession(data.token, data.usuario);
      onLogin(data.usuario);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-row">
          <div className="brand-mark">P</div>
          <div>
            <h1>Pechincha</h1>
            <p>Lista e comparação de preços</p>
          </div>
        </div>

        <div className="switcher" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Entrar</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">Criar conta</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <input
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                autoComplete="name"
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Senha
            <input
              value={form.senha}
              onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
          {error && <div className="error-line"><CircleAlert size={16} />{error}</div>}
          <button className="primary full" disabled={loading} type="submit">
            <UserRound size={17} />
            {loading ? 'Aguarde' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </section>
    </main>
  );
}

function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className="select-wrap">
      <span>{label}</span>
      <div className="select-box">
        <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Todos</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
    </label>
  );
}

function ProductRow({ product, inList, onAdd }) {
  return (
    <article className="product-row">
      <div className="product-icon"><ShoppingCart size={18} /></div>
      <div className="product-main">
        <h3>{product.nome}</h3>
        {productMeta(product) && <p>{productMeta(product)}</p>}
        {product.ultimo_preco?.estabelecimento && <span>{product.ultimo_preco.estabelecimento}</span>}
      </div>
      <div className="product-price">
        <small>menor</small>
        <strong>{money(product.menor_preco)}</strong>
      </div>
      <button className={inList ? 'ghost ok' : 'icon-action'} onClick={() => onAdd(product)} disabled={inList} type="button">
        {inList ? <Check size={17} /> : <Plus size={17} />}
      </button>
    </article>
  );
}

function ListItem({ item, onToggle, onQuantity, onRemove }) {
  const qty = Number(item.quantidade) || 1;
  return (
    <article className="list-item">
      <button className={item.selecionado ? 'check-button selected' : 'check-button'} onClick={() => onToggle(item)} type="button">
        {item.selecionado && <Check size={15} />}
      </button>
      <div className="list-main">
        <h3>{item.nome}</h3>
        {productMeta(item) && <p>{productMeta(item)}</p>}
        <strong>{money(item.menor_preco)}</strong>
      </div>
      <div className="qty-control">
        <button onClick={() => onQuantity(item, Math.max(1, qty - 1))} disabled={qty <= 1} type="button">
          <Minus size={14} />
        </button>
        <span>{qty}x</span>
        <button onClick={() => onQuantity(item, qty + 1)} type="button">
          <Plus size={14} />
        </button>
      </div>
      <button className="trash-button" onClick={() => onRemove(item)} type="button">
        <Trash2 size={17} />
      </button>
    </article>
  );
}

function Dashboard({ usuario, onLogout }) {
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({ categorias: [], tipos: [], marcas: [], quantidades: [] });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [type, setType] = useState(null);
  const [brand, setBrand] = useState(null);
  const [amount, setAmount] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [list, setList] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [message, setMessage] = useState('');

  const selectedItems = useMemo(() => list.filter((item) => item.selecionado), [list]);
  const selectedPayload = useMemo(
    () => selectedItems.map((item) => ({ produto_id: item.id, quantidade: item.quantidade || 1 })),
    [selectedItems]
  );
  const bestBasket = analysis?.comparacao?.[0] || null;
  const totalBest = bestBasket?.total_estimado ?? analysis?.resumo?.total_melhores_individuais ?? 0;
  const inList = useMemo(() => new Set(list.map((item) => item.id)), [list]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setMessage('');
    try {
      const data = await api.get('/lista');
      setList(data.itens || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível carregar a lista.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      const data = await api.get(`/produtos/filtros${buildQuery({ categoria: category, tipo: type, marca: brand })}`);
      setFilters(data);
    } catch (_err) {
      setFilters({ categorias: [], tipos: [], marcas: [], quantidades: [] });
    }
  }, [category, type, brand]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await api.get(`/produtos${buildQuery({
        nome: query.trim(),
        categoria: category,
        tipo: type,
        marca: brand,
        quantidade: amount
      })}`);
      setProducts(data.produtos || []);
    } catch (err) {
      setProducts([]);
      setMessage(err.message || 'Não foi possível buscar produtos.');
    } finally {
      setLoadingProducts(false);
    }
  }, [query, category, type, brand, amount]);

  const compareList = useCallback(async () => {
    if (selectedPayload.length === 0) {
      setAnalysis(null);
      return;
    }
    try {
      setAnalysis(await api.post('/comparacao/cesta', { itens: selectedPayload }));
    } catch (_err) {
      setAnalysis(null);
    }
  }, [selectedPayload]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    const timeout = setTimeout(loadProducts, 250);
    return () => clearTimeout(timeout);
  }, [loadProducts]);

  useEffect(() => {
    const timeout = setTimeout(compareList, 250);
    return () => clearTimeout(timeout);
  }, [compareList]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return undefined;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const data = await api.get(`/produtos/sugestoes${buildQuery({ termo: term, categoria: category, tipo: type, marca: brand })}`);
        if (active) setSuggestions(data.sugestoes || []);
      } catch (_err) {
        if (active) setSuggestions([]);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, category, type, brand]);

  async function addProduct(product) {
    setMessage('');
    try {
      const data = await api.post('/lista/itens', { produto_id: product.id, quantidade: 1, selecionado: true });
      setList(data.itens || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível adicionar.');
    }
  }

  async function updateItem(item, patch) {
    try {
      const data = await api.put(`/lista/itens/${item.id}`, patch);
      setList(data.itens || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível atualizar.');
    }
  }

  async function removeItem(item) {
    try {
      const data = await api.delete(`/lista/itens/${item.id}`);
      setList(data.itens || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível remover.');
    }
  }

  async function clearList() {
    try {
      const data = await api.delete('/lista');
      setList(data.itens || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível limpar.');
    }
  }

  function logout() {
    clearStoredSession();
    onLogout();
  }

  function resetFilters() {
    setQuery('');
    setCategory(null);
    setType(null);
    setBrand(null);
    setAmount(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row compact">
          <div className="brand-mark">P</div>
          <div>
            <h1>Pechincha</h1>
            <p>{usuario?.nome || usuario?.email}</p>
          </div>
        </div>
        <button className="ghost" onClick={logout} type="button">
          <LogOut size={17} />
          Sair
        </button>
      </header>

      <section className="workspace">
        <div className="catalog-panel">
          <div className="panel-head">
            <div>
              <h2>Produtos</h2>
              <p>{products.length} encontrados</p>
            </div>
            <button className="ghost icon-only" onClick={loadProducts} type="button">
              <RefreshCw size={17} />
            </button>
          </div>

          <div className="search-box">
            <Search size={18} />
            <input
              list="product-suggestions"
              placeholder="Buscar produto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <datalist id="product-suggestions">
              {suggestions.map((item) => (
                <option key={item.id} value={item.nome} />
              ))}
            </datalist>
          </div>

          <div className="filters-grid">
            <SelectFilter label="Categoria" value={category} options={filters.categorias || []} onChange={(value) => {
              setCategory(value);
              setType(null);
              setBrand(null);
              setAmount(null);
            }} />
            <SelectFilter label="Tipo" value={type} options={filters.tipos || []} onChange={(value) => {
              setType(value);
              setBrand(null);
              setAmount(null);
            }} />
            <SelectFilter label="Marca" value={brand} options={filters.marcas || []} onChange={(value) => {
              setBrand(value);
              setAmount(null);
            }} />
            <SelectFilter label="Quantidade" value={amount} options={filters.quantidades || []} onChange={setAmount} />
          </div>

          <div className="toolbar-line">
            <button className="ghost" onClick={resetFilters} type="button">Limpar filtros</button>
            {message && <span className="inline-alert"><CircleAlert size={15} />{message}</span>}
          </div>

          <div className="product-list">
            {loadingProducts ? (
              <div className="empty-state">Carregando produtos.</div>
            ) : products.length === 0 ? (
              <div className="empty-state">Nenhum produto encontrado.</div>
            ) : products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                inList={inList.has(product.id)}
                onAdd={addProduct}
              />
            ))}
          </div>
        </div>

        <aside className="side-panel">
          <div className="summary-band">
            <div>
              <span>{bestBasket ? 'melhor cesta' : 'lista selecionada'}</span>
              <h2>{money(totalBest)}</h2>
              <p>{bestBasket ? bestBasket.estabelecimento : `${selectedItems.length} itens`}</p>
            </div>
            <div className="summary-icon"><Store size={24} /></div>
          </div>

          <div className="panel-head slim">
            <div>
              <h2>Lista</h2>
              <p>{list.length} {list.length === 1 ? 'item' : 'itens'}</p>
            </div>
            <button className="ghost icon-only" onClick={loadList} type="button" disabled={loadingList}>
              <RefreshCw size={17} />
            </button>
          </div>

          <div className="list-stack">
            {list.length === 0 ? (
              <div className="empty-state">Lista vazia.</div>
            ) : list.map((item) => (
              <ListItem
                key={item.id}
                item={item}
                onToggle={(current) => updateItem(current, { selecionado: !current.selecionado })}
                onQuantity={(current, quantidade) => updateItem(current, { quantidade })}
                onRemove={removeItem}
              />
            ))}
          </div>

          <div className="side-actions">
            <button className="ghost" onClick={clearList} disabled={list.length === 0} type="button">
              <Trash2 size={16} />
              Limpar
            </button>
            <button className="primary" onClick={compareList} disabled={selectedItems.length === 0} type="button">
              <RefreshCw size={16} />
              Comparar
            </button>
          </div>

          <div className="ranking-panel">
            <div className="panel-head slim">
              <div>
                <h2>Comparação</h2>
                <p>{analysis?.resumo?.produtos_com_preco || 0}/{analysis?.resumo?.total_produtos || selectedItems.length} com preço</p>
              </div>
            </div>
            {!analysis ? (
              <div className="empty-state">Sem comparação.</div>
            ) : (
              <div className="ranking-list">
                {(analysis.comparacao || []).slice(0, 4).map((store, index) => (
                  <article key={store.estabelecimento_id} className="rank-row">
                    <span>{index + 1}</span>
                    <div>
                      <h3>{store.estabelecimento}</h3>
                      <p>{store.produtos_cobertos}/{store.total_produtos} produtos</p>
                    </div>
                    <strong>{money(store.total_estimado)}</strong>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default function App() {
  const stored = getStoredSession();
  const [usuario, setUsuario] = useState(stored.usuario);

  if (!usuario) {
    return <LoginView onLogin={setUsuario} />;
  }

  return <Dashboard usuario={usuario} onLogout={() => setUsuario(null)} />;
}
