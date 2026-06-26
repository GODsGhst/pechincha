import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Edit3,
  LogOut,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShoppingCart,
  Store,
  Trash2,
  UserRound,
  Users
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
              minLength={mode === 'register' ? 8 : undefined}
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
      <div className="product-icon">
        {product.imagem_url ? <img src={product.imagem_url} alt="" loading="lazy" /> : <ShoppingCart size={18} />}
      </div>
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
      <div className="product-icon compact">
        {item.imagem_url ? <img src={item.imagem_url} alt="" loading="lazy" /> : <ShoppingCart size={16} />}
      </div>
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

function Dashboard({ usuario, onLogout, onOpenAdmin }) {
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

  async function deleteAccount() {
    if (!window.confirm('Excluir sua conta e todos os seus dados pessoais? Essa ação não pode ser desfeita.')) return;
    setMessage('');
    try {
      await api.delete('/auth/me');
      clearStoredSession();
      onLogout();
    } catch (err) {
      setMessage(err.message || 'Não foi possível excluir sua conta.');
    }
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
        <div className="topbar-actions">
          <button className="ghost danger" onClick={deleteAccount} type="button">
            <Trash2 size={17} />
            Excluir conta
          </button>
          <button className="ghost" onClick={logout} type="button">
            <LogOut size={17} />
            Sair
          </button>
          {usuario?.papel === 'admin' && (
            <button className="primary" onClick={onOpenAdmin} type="button">
              <Shield size={17} />
              Admin
            </button>
          )}
        </div>
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

function shortDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

const emptyProductForm = {
  id: null,
  nome: '',
  categoria: '',
  tipo: '',
  marca: '',
  quantidade: '',
  imagem_url: '',
  imagem_credito: ''
};

const emptyStoreForm = {
  id: null,
  nome: '',
  cnpj: '',
  endereco: '',
  lat: '',
  lng: ''
};

function productNameForForm(product) {
  const name = String(product?.nome || '').trim();
  const amount = String(product?.quantidade || '').trim();
  if (!name || !amount) return name;
  const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`\\s+${escaped}$`, 'i'), '').trim() || name;
}

function StatBox({ label, value }) {
  return (
    <article className="stat-box">
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </article>
  );
}

function AdminPanel({ usuario, onBack, onLogout }) {
  const [tab, setTab] = useState('produtos');
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.get('/admin/resumo'));
    } catch (err) {
      setMessage(err.message || 'Não foi possível carregar o resumo admin.');
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.get('/admin/usuarios');
      setUsers(data.usuarios || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível carregar usuários.');
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get(`/produtos${buildQuery({ nome: productQuery.trim() })}`);
      setProducts(data.produtos || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível carregar produtos.');
    }
  }, [productQuery]);

  const loadStores = useCallback(async () => {
    try {
      const data = await api.get('/estabelecimentos');
      setStores(data.estabelecimentos || []);
    } catch (err) {
      setMessage(err.message || 'Não foi possível carregar estabelecimentos.');
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadUsers();
    loadStores();
  }, [loadSummary, loadUsers, loadStores]);

  useEffect(() => {
    const timeout = setTimeout(loadProducts, 250);
    return () => clearTimeout(timeout);
  }, [loadProducts]);

  function logout() {
    clearStoredSession();
    onLogout();
  }

  function editProduct(product) {
    setProductForm({
      id: product.id,
      nome: productNameForForm(product),
      categoria: product.categoria || '',
      tipo: product.tipo || '',
      marca: product.marca || '',
      quantidade: product.quantidade || '',
      imagem_url: product.imagem_url || '',
      imagem_credito: product.imagem_credito || ''
    });
  }

  function editStore(store) {
    setStoreForm({
      id: store.id,
      nome: store.nome || '',
      cnpj: store.cnpj || '',
      endereco: store.endereco || '',
      lat: store.localizacao?.lat ?? '',
      lng: store.localizacao?.lng ?? ''
    });
  }

  async function saveProduct(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const body = {
        nome: productForm.nome,
        categoria: productForm.categoria || null,
        tipo: productForm.tipo || null,
        marca: productForm.marca || null,
        quantidade: productForm.quantidade || null,
        imagem_url: productForm.imagem_url || null,
        imagem_credito: productForm.imagem_credito || null
      };
      if (productForm.id) await api.put(`/produtos/${productForm.id}`, body);
      else await api.post('/produtos', body);
      setProductForm(emptyProductForm);
      setMessage('Produto salvo.');
      await Promise.all([loadProducts(), loadSummary()]);
    } catch (err) {
      setMessage(err.message || 'Não foi possível salvar produto.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Remover "${product.nome}" e o histórico desse produto?`)) return;
    setLoading(true);
    setMessage('');
    try {
      await api.delete(`/produtos/${product.id}`);
      if (productForm.id === product.id) setProductForm(emptyProductForm);
      setMessage('Produto removido.');
      await Promise.all([loadProducts(), loadSummary()]);
    } catch (err) {
      setMessage(err.message || 'Não foi possível remover produto.');
    } finally {
      setLoading(false);
    }
  }

  async function saveStore(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const lat = storeForm.lat === '' ? null : Number(storeForm.lat);
      const lng = storeForm.lng === '' ? null : Number(storeForm.lng);
      const localizacao = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      const body = {
        nome: storeForm.nome,
        endereco: storeForm.endereco || null,
        localizacao
      };
      if (storeForm.id) await api.put(`/estabelecimentos/${storeForm.id}`, body);
      else await api.post('/estabelecimentos', { ...body, cnpj: storeForm.cnpj });
      setStoreForm(emptyStoreForm);
      setMessage('Estabelecimento salvo.');
      await Promise.all([loadStores(), loadSummary()]);
    } catch (err) {
      setMessage(err.message || 'Não foi possível salvar estabelecimento.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteStore(store) {
    if (!window.confirm(`Remover "${store.nome}"?`)) return;
    setLoading(true);
    setMessage('');
    try {
      await api.delete(`/estabelecimentos/${store.id}`);
      if (storeForm.id === store.id) setStoreForm(emptyStoreForm);
      setMessage('Estabelecimento removido.');
      await Promise.all([loadStores(), loadSummary()]);
    } catch (err) {
      setMessage(err.message || 'Não foi possível remover estabelecimento.');
    } finally {
      setLoading(false);
    }
  }

  async function updateUserRole(user, role) {
    setMessage('');
    try {
      const updated = await api.put(`/admin/usuarios/${user.id}/papel`, { papel: role });
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage('Permissão atualizada.');
      await loadSummary();
    } catch (err) {
      setMessage(err.message || 'Não foi possível atualizar a permissão.');
    }
  }

  const totals = summary?.totais || {};

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row compact">
          <div className="brand-mark">P</div>
          <div>
            <h1>Admin Pechincha</h1>
            <p>{usuario?.nome || usuario?.email}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={onBack} type="button">Voltar</button>
          <button className="ghost" onClick={logout} type="button">
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </header>

      <section className="admin-shell">
        <aside className="admin-sidebar">
          <div className="summary-grid">
            <StatBox label="usuários" value={totals.usuarios} />
            <StatBox label="produtos" value={totals.produtos} />
            <StatBox label="lojas" value={totals.estabelecimentos} />
            <StatBox label="compras" value={totals.compras} />
          </div>
          <nav className="admin-tabs">
            <button className={tab === 'produtos' ? 'active' : ''} onClick={() => setTab('produtos')} type="button">
              <PackageSearch size={17} />
              Produtos
            </button>
            <button className={tab === 'lojas' ? 'active' : ''} onClick={() => setTab('lojas')} type="button">
              <Building2 size={17} />
              Estabelecimentos
            </button>
            <button className={tab === 'usuarios' ? 'active' : ''} onClick={() => setTab('usuarios')} type="button">
              <Users size={17} />
              Usuários
            </button>
          </nav>
          <div className="import-list">
            <h3>Últimas leituras</h3>
            {(summary?.ultimas_importacoes || []).length === 0 ? (
              <p>Nenhuma importação registrada.</p>
            ) : summary.ultimas_importacoes.map((item) => (
              <article key={item.id}>
                <strong>{item.status}</strong>
                <span>{shortDate(item.recebido_em)}</span>
              </article>
            ))}
          </div>
        </aside>

        <section className="admin-content">
          <div className="panel-head">
            <div>
              <h2>{tab === 'produtos' ? 'Produtos' : tab === 'lojas' ? 'Estabelecimentos' : 'Usuários'}</h2>
              <p>Permissões e dados protegidos por conta admin</p>
            </div>
            <button className="ghost icon-only" onClick={() => {
              loadSummary();
              loadUsers();
              loadProducts();
              loadStores();
            }} type="button">
              <RefreshCw size={17} />
            </button>
          </div>

          {message && <div className="admin-message"><CircleAlert size={16} />{message}</div>}

          {tab === 'produtos' && (
            <div className="admin-grid">
              <div className="admin-list">
                <div className="search-box">
                  <Search size={18} />
                  <input placeholder="Buscar produto para editar" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
                </div>
                <div className="admin-rows">
                  {products.map((product) => (
                    <article className="admin-row" key={product.id}>
                      <div>
                        <h3>{product.nome}</h3>
                        <p>{productMeta(product) || 'Sem metadados'} · {money(product.menor_preco)}</p>
                      </div>
                      <button className="ghost icon-only" onClick={() => editProduct(product)} type="button"><Edit3 size={16} /></button>
                      <button className="trash-button" onClick={() => deleteProduct(product)} type="button"><Trash2 size={16} /></button>
                    </article>
                  ))}
                </div>
              </div>
              <form className="admin-form" onSubmit={saveProduct}>
                <h3>{productForm.id ? 'Editar produto' : 'Novo produto'}</h3>
                <label>Nome<input value={productForm.nome} onChange={(e) => setProductForm((p) => ({ ...p, nome: e.target.value }))} required /></label>
                <label>Categoria<input value={productForm.categoria} onChange={(e) => setProductForm((p) => ({ ...p, categoria: e.target.value }))} /></label>
                <label>Tipo<input value={productForm.tipo} onChange={(e) => setProductForm((p) => ({ ...p, tipo: e.target.value }))} /></label>
                <label>Marca<input value={productForm.marca} onChange={(e) => setProductForm((p) => ({ ...p, marca: e.target.value }))} /></label>
                <label>Quantidade<input value={productForm.quantidade} onChange={(e) => setProductForm((p) => ({ ...p, quantidade: e.target.value }))} placeholder="2L, 500ml, 5kg" /></label>
                <label>Imagem URL<input value={productForm.imagem_url} onChange={(e) => setProductForm((p) => ({ ...p, imagem_url: e.target.value }))} /></label>
                <div className="form-actions">
                  <button className="ghost" onClick={() => setProductForm(emptyProductForm)} type="button">Limpar</button>
                  <button className="primary" disabled={loading} type="submit"><Save size={16} />Salvar</button>
                </div>
              </form>
            </div>
          )}

          {tab === 'lojas' && (
            <div className="admin-grid">
              <div className="admin-rows">
                {stores.map((store) => (
                  <article className="admin-row" key={store.id}>
                    <div>
                      <h3>{store.nome}</h3>
                      <p>{store.cnpj} · {store.endereco || 'sem endereço'}</p>
                    </div>
                    <button className="ghost icon-only" onClick={() => editStore(store)} type="button"><Edit3 size={16} /></button>
                    <button className="trash-button" onClick={() => deleteStore(store)} type="button"><Trash2 size={16} /></button>
                  </article>
                ))}
              </div>
              <form className="admin-form" onSubmit={saveStore}>
                <h3>{storeForm.id ? 'Editar estabelecimento' : 'Novo estabelecimento'}</h3>
                <label>Nome<input value={storeForm.nome} onChange={(e) => setStoreForm((p) => ({ ...p, nome: e.target.value }))} required /></label>
                <label>CNPJ<input value={storeForm.cnpj} onChange={(e) => setStoreForm((p) => ({ ...p, cnpj: e.target.value }))} disabled={Boolean(storeForm.id)} required={!storeForm.id} /></label>
                <label>Endereço<input value={storeForm.endereco} onChange={(e) => setStoreForm((p) => ({ ...p, endereco: e.target.value }))} /></label>
                <div className="coord-grid">
                  <label>Latitude<input value={storeForm.lat} onChange={(e) => setStoreForm((p) => ({ ...p, lat: e.target.value }))} /></label>
                  <label>Longitude<input value={storeForm.lng} onChange={(e) => setStoreForm((p) => ({ ...p, lng: e.target.value }))} /></label>
                </div>
                <div className="form-actions">
                  <button className="ghost" onClick={() => setStoreForm(emptyStoreForm)} type="button">Limpar</button>
                  <button className="primary" disabled={loading} type="submit"><Save size={16} />Salvar</button>
                </div>
              </form>
            </div>
          )}

          {tab === 'usuarios' && (
            <div className="admin-rows">
              {users.map((item) => (
                <article className="admin-row user-row" key={item.id}>
                  <div>
                    <h3>{item.nome}</h3>
                    <p>{item.email} · criado em {shortDate(item.criado_em)}</p>
                  </div>
                  <select value={item.papel} onChange={(e) => updateUserRole(item, e.target.value)}>
                    <option value="usuario">Usuário</option>
                    <option value="admin">Admin</option>
                  </select>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default function App() {
  const stored = getStoredSession();
  const [usuario, setUsuario] = useState(stored.usuario);
  const [view, setView] = useState('app');

  if (!usuario) {
    return <LoginView onLogin={setUsuario} />;
  }

  if (usuario.papel === 'admin' && view === 'admin') {
    return <AdminPanel usuario={usuario} onBack={() => setView('app')} onLogout={() => setUsuario(null)} />;
  }

  return <Dashboard usuario={usuario} onLogout={() => setUsuario(null)} onOpenAdmin={() => setView('admin')} />;
}
