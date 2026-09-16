import ProductPrice, { finalPrice, PrescriptionBadge } from "./ProductPrice";
import UserManagement from "./UserManagement";
import ProductImport from "./ProductImport";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  FileSpreadsheet,
  Users,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Code2,
  Database,
  Edit3,
  Eye,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import AuthScreen, { Brand } from "./AuthScreen";
import ProductForm, { Modal, ProductImage } from "./ProductForm";
import { api, hasToken, setToken } from "./api";

const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
const count = (value) => new Intl.NumberFormat("pt-BR").format(value);
const stockStatus = (stock) =>
  stock === 0
    ? { label: "Sem estoque", className: "empty-stock" }
    : stock <= 10
      ? { label: "Estoque baixo", className: "low-stock" }
      : { label: "Em estoque", className: "in-stock" };
const navItems = [
  { id: "overview", icon: LayoutDashboard, label: "Visão geral" },
  { id: "products", icon: Package, label: "Produtos" },
  { id: "users", icon: Users, label: "Usuários" },
  { id: "api", icon: Code2, label: "API e acesso" },
];

function StockBadge({ stock }) {
  const status = stockStatus(stock);
  return (
    <span className={`badge ${status.className}`}>
      <i />
      {status.label}
    </span>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(hasToken());
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    function expired() {
      setUser(null);
      setNotice("Sua sessão expirou. Entre novamente para continuar.");
    }
    window.addEventListener("session-expired", expired);
    if (hasToken())
      api("/auth/me")
        .then((data) => {
          if (active) setUser(data);
        })
        .catch((e) => {
          if (active) setNotice(e.message);
        })
        .finally(() => {
          if (active) setBooting(false);
        });
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = () => {
      api("/auth/me")
        .then((data) => {
          if (active) setUser(data);
        })
        .catch(() => {});
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("permissions-changed", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("permissions-changed", refresh);
    };
  }, [user?.sub]);
  if (booting)
    return (
      <div className="boot-screen">
        <Brand />
        <span className="spinner" />
        <p>Preparando seu espaço…</p>
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        notice={notice}
        onLogin={(data) => {
          setUser(data);
          setNotice("");
        }}
      />
    );
  return (
    <Portal
      key={user.role}
      user={user}
      onCurrentUserChanged={async () => {
        const current = await api("/auth/me");
        setUser(current);
      }}
      onLogout={() => {
        setToken(null);
        setUser(null);
        setNotice("");
      }}
    />
  );
}

function Portal({ user, onLogout, onCurrentUserChanged }) {
  const [page, setPage] = useState("products");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const requestId = useRef(0);
  const [importing, setImporting] = useState(false);
  const isAdmin = user.role === "Admin";
  const canEdit = ["Admin", "Farmacia"].includes(user.role);
  async function reload() {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const data = await api("/medicines");
      if (id === requestId.current) {
        setProducts(data);
        setUpdatedAt(new Date());
      }
    } catch (e) {
      if (id === requestId.current) setLoadError(e.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    reload();
    return () => {
      requestId.current++;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setCurrentPage(1);
  }, [query, filter, sort]);
  const stats = useMemo(
    () => ({
      total: products.length,
      units: products.reduce((s, p) => s + p.stock, 0),
      low: products.filter((p) => p.stock > 0 && p.stock <= 10).length,
      empty: products.filter((p) => p.stock === 0).length,
      value: products.reduce((s, p) => s + finalPrice(p) * p.stock, 0),
    }),
    [products],
  );
  const filtered = useMemo(() => {
    const normalize = (value) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return products
      .filter(
        (p) =>
          normalize(`${p.name} ${p.description} ${p.id}`).includes(
            normalize(query.trim()),
          ) &&
          (filter === "all" ||
            (filter === "available" && p.stock > 10) ||
            (filter === "low" && p.stock > 0 && p.stock <= 10) ||
            (filter === "empty" && p.stock === 0)),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : sort === "price"
            ? finalPrice(a) - finalPrice(b)
            : sort === "stock"
              ? a.stock - b.stock
              : b.id - a.id,
      );
  }, [products, query, filter, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const safePage = Math.min(currentPage, pages);
  const visible = filtered.slice((safePage - 1) * 8, safePage * 8);
  function navigate(next) {
    setPage(next);
    setMobileNav(false);
  }
  function showLow() {
    setFilter("low");
    setQuery("");
    navigate("products");
  }
  function onSaved(saved) {
    requestId.current++;
    setLoading(false);
    setProducts((old) =>
      old.some((p) => p.id === saved.id)
        ? old.map((p) => (p.id === saved.id ? saved : p))
        : [saved, ...old],
    );
    setUpdatedAt(new Date());
    setLoadError("");
    setToast(
      editing?.id
        ? "Produto atualizado com sucesso."
        : "Produto cadastrado com sucesso.",
    );
    setEditing(null);
  }
  async function remove() {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api(`/medicines/${deleting.id}`, { method: "DELETE" });
      requestId.current++;
      setLoading(false);
      setProducts((old) => old.filter((p) => p.id !== deleting.id));
      setDeleting(null);
      setToast("Produto excluído com sucesso.");
      setUpdatedAt(new Date());
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleteBusy(false);
    }
  }
  function exportCsv() {
    const cell = (value) =>
      `"${String(value)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = [
      [
        "ID",
        "Produto",
        "Descrição",
        "Preço original (R$)",
        "Estoque",
        "Fotos",
        "Desconto (%)",
        "Preço final (R$)",
        "Exige receita",
      ],
      ...filtered.map((p) => [
        p.id,
        p.name,
        p.description,
        p.price.toFixed(2).replace(".", ","),
        p.stock,
        (p.imageUrls || []).join(" | "),
        p.discountPercentage ?? 0,
        finalPrice(p).toFixed(2).replace(".", ","),
        p.requiresPrescription ? "Sim" : "Não",
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `nexo-produtos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Catálogo exportado em CSV.");
  }
  const title =
    page === "users"
      ? "Usuários"
      : page === "overview"
        ? "Visão geral"
        : page === "api"
          ? "API e acesso"
          : page === "account"
            ? "Minha conta"
            : "Produtos";
  return (
    <div className="portal">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <Brand />
        <div className="workspace">
          <span className="workspace-icon">
            <Boxes size={20} />
          </span>
          <div>
            Meu negócio<small>Portal de gestão</small>
          </div>
          <span className="workspace-tag">N</span>
        </div>
        <span className="nav-caption">PRINCIPAL</span>
        <nav>
          {navItems
            .filter((item) =>
              ["api", "users"].includes(item.id)
                ? isAdmin
                : item.id === "overview"
                  ? canEdit
                  : true,
            )
            .map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={page === item.id ? "active" : ""}
              >
                <item.icon size={20} />
                {item.label}
                {item.id === "products" && (
                  <span className="nav-count">{stats.total}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span>
              <ShieldCheck size={20} />
            </span>
            <strong>Você está no controle</strong>
            <p>
              {canEdit
                ? "Organize seu catálogo e mantenha seu estoque em dia."
                : "Explore os produtos e acompanhe a disponibilidade."}
            </p>
            <button onClick={() => navigate(isAdmin ? "api" : "account")}>
              Conhecer meu acesso <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`account-button ${page === "account" ? "active" : ""}`}
            onClick={() => navigate("account")}
          >
            <span className="avatar">
              {(user.name || user.email).slice(0, 2).toUpperCase()}
            </span>
            <span>
              {user.name || user.email.split("@")[0]}
              <small>
                {user.role === "Admin"
                  ? "Administrador"
                  : user.role === "Farmacia"
                    ? "Farmácia"
                    : "Cliente"}
              </small>
            </span>
            <UserRound size={17} />
          </button>
          <button className="logout-button" onClick={onLogout}>
            <LogOut size={16} /> Sair da conta
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${loadError ? "disconnected" : loading ? "connecting" : ""}`}
            >
              <i />
              {loadError
                ? "Sem conexão"
                : loading
                  ? "Sincronizando"
                  : isAdmin
                    ? "API conectada"
                    : "Conectado"}
            </span>
            <div className="topbar-divider" />
            {isAdmin && (
              <button
                className="icon-button"
                title="Ajuda e informações de acesso"
                aria-label="Ajuda e informações de acesso"
                onClick={() => navigate("api")}
              >
                <CircleHelp size={20} />
              </button>
            )}
            <span className="avatar small">
              {(user.name || user.email).slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">SEU NEGÓCIO EM ORDEM</span>
              <h1>
                {title}
                <span>.</span>
              </h1>
              <p>
                {page === "products"
                  ? "Um lugar para todos os seus produtos. E todas as possibilidades."
                  : page === "overview"
                    ? "Um olhar completo sobre o que faz seu negócio acontecer."
                    : page === "api"
                      ? "Sua operação conectada, com o acesso certo para cada pessoa."
                      : "Os detalhes do seu acesso ao portal."}
              </p>
            </div>
            {canEdit && ["products", "overview"].includes(page) && (
              <div className="heading-actions">
                <button
                  className="button secondary"
                  onClick={exportCsv}
                  disabled={loading || !!loadError || !filtered.length}
                >
                  <ArrowDownToLine size={17} /> Exportar
                </button>
                <button
                  className="button secondary"
                  onClick={() => setImporting(true)}
                >
                  <FileSpreadsheet size={17} /> Importar planilha
                </button>
                {canEdit && (
                  <button
                    className="button primary"
                    onClick={() => setEditing({})}
                  >
                    <Plus size={19} /> Novo produto
                  </button>
                )}
              </div>
            )}
          </div>
          {loadError && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={19} />
              <span>{loadError}</span>
              <button onClick={reload}>Tentar novamente</button>
            </div>
          )}
          {["products", "overview"].includes(page) && (
            <>
              {canEdit && (
                <div className="stats-grid">
                  {[
                    {
                      label: "Produtos cadastrados",
                      value: count(stats.total),
                      icon: Package,
                      foot: "Seu catálogo completo",
                      tone: "blue",
                    },
                    {
                      label: "Unidades em estoque",
                      value: count(stats.units),
                      icon: Boxes,
                      foot: "Prontas para o próximo passo",
                      tone: "cyan",
                    },
                    {
                      label: "Estoque baixo",
                      value: count(stats.low),
                      icon: TriangleAlert,
                      foot: "Produtos com até 10 unidades",
                      tone: "amber",
                      action: showLow,
                    },
                    {
                      label: "Valor em estoque",
                      value: money(stats.value),
                      icon: Wallet,
                      foot: "Quantidade × preço de venda",
                      tone: "violet",
                    },
                  ].map((stat) => (
                    <div key={stat.label} className="stat-card">
                      <div className="stat-top">
                        <span>{stat.label}</span>
                        <span className={`stat-icon ${stat.tone}`}>
                          <stat.icon size={19} />
                        </span>
                      </div>
                      <strong>
                        {loading && !updatedAt ? "—" : stat.value}
                      </strong>
                      {stat.action ? (
                        <button onClick={stat.action}>
                          {stat.foot}
                          <ArrowUpRight size={13} />
                        </button>
                      ) : (
                        <small>{stat.foot}</small>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {page === "products" ? (
                <section className="catalog">
                  <div className="catalog-heading">
                    <div>
                      <h2>
                        Seu catálogo <span>{count(stats.total)}</span>
                      </h2>
                      <p>Pequenos detalhes. Uma gestão muito melhor.</p>
                    </div>
                    <button
                      className={`icon-button ${loading ? "rotating" : ""}`}
                      onClick={reload}
                      disabled={loading}
                      title="Atualizar catálogo"
                      aria-label="Atualizar catálogo"
                    >
                      <RefreshCw size={18} />
                    </button>
                  </div>
                  <div className="catalog-toolbar">
                    <div className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="Buscar produtos"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar por nome, descrição ou código…"
                      />
                      {query && (
                        <button
                          className="icon-button"
                          aria-label="Limpar busca"
                          onClick={() => setQuery("")}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <div className="toolbar-options">
                      <label className="sort-select">
                        <SlidersHorizontal size={16} />
                        <select
                          aria-label="Ordenar produtos"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="recent">Mais recentes</option>
                          <option value="name">Nome: A–Z</option>
                          <option value="price">Menor preço</option>
                          <option value="stock">Menor estoque</option>
                        </select>
                      </label>
                      <div className="view-toggle">
                        <button
                          className={view === "grid" ? "active" : ""}
                          onClick={() => setView("grid")}
                          aria-label="Visualização em grade"
                          aria-pressed={view === "grid"}
                        >
                          <LayoutGrid size={18} />
                        </button>
                        <button
                          className={view === "list" ? "active" : ""}
                          onClick={() => setView("list")}
                          aria-label="Visualização em lista"
                          aria-pressed={view === "list"}
                        >
                          <List size={19} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="filter-tabs" aria-label="Filtrar estoque">
                    {[
                      {
                        id: "all",
                        label: "Todos os produtos",
                        total: stats.total,
                      },
                      {
                        id: "available",
                        label: "Em estoque",
                        total: stats.total - stats.low - stats.empty,
                      },
                      { id: "low", label: "Estoque baixo", total: stats.low },
                      { id: "empty", label: "Sem estoque", total: stats.empty },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        className={filter === tab.id ? "active" : ""}
                        aria-pressed={filter === tab.id}
                        onClick={() => setFilter(tab.id)}
                      >
                        {tab.label}
                        <span>{tab.total}</span>
                      </button>
                    ))}
                  </div>
                  {loading && !updatedAt ? (
                    <div
                      className="product-grid"
                      aria-label="Carregando produtos"
                      role="status"
                    >
                      {Array.from({ length: 4 }, (_, i) => (
                        <div className="skeleton-card" key={i}>
                          <div />
                          <span />
                          <span />
                        </div>
                      ))}
                    </div>
                  ) : !filtered.length ? (
                    <div className="empty-state">
                      <span>
                        <Package size={36} strokeWidth={1.4} />
                      </span>
                      <h3>
                        {loadError
                          ? "Não foi possível carregar o catálogo"
                          : products.length
                            ? "Nenhum produto por aqui"
                            : "Seu catálogo começa com uma ideia"}
                      </h3>
                      <p>
                        {loadError
                          ? "Verifique a conexão com a API e tente novamente."
                          : products.length
                            ? "Tente outra busca ou escolha um filtro diferente."
                            : canEdit
                              ? "Adicione seu primeiro produto, inclua uma foto e deixe o resto organizado."
                              : "Os produtos cadastrados pela equipe aparecerão aqui."}
                      </p>
                      {!loadError &&
                        (products.length ? (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setQuery("");
                              setFilter("all");
                            }}
                          >
                            Limpar filtros
                          </button>
                        ) : (
                          canEdit && (
                            <button
                              className="button primary"
                              onClick={() => setEditing({})}
                            >
                              <Plus size={18} /> Cadastrar primeiro produto
                            </button>
                          )
                        ))}
                    </div>
                  ) : view === "grid" ? (
                    <div className="product-grid">
                      {visible.map((product) => (
                        <article className="product-card" key={product.id}>
                          <button
                            className="product-photo"
                            onClick={() => setDetail(product)}
                            aria-label={`Ver detalhes de ${product.name}`}
                          >
                            <ProductImage
                              url={product.imageUrls?.[0]}
                              name={product.name}
                            />
                            <span className="photo-badge">
                              <StockBadge stock={product.stock} />
                            </span>
                            {product.imageUrls?.length > 1 && (
                              <span className="photo-count">
                                {product.imageUrls.length} fotos
                              </span>
                            )}
                          </button>
                          <div className="product-info">
                            <span className="product-code">
                              PRODUTO #{String(product.id).padStart(4, "0")}
                            </span>
                            <button
                              className="product-name"
                              onClick={() => setDetail(product)}
                            >
                              {product.name}
                            </button>
                            <p>{product.description}</p>
                            <PrescriptionBadge product={product} />
                            <div className="product-numbers">
                              <ProductPrice product={product} />
                              <span>
                                <Boxes size={14} />
                                {count(product.stock)} un.
                              </span>
                            </div>
                          </div>
                          <div className="product-actions">
                            <button
                              onClick={() =>
                                canEdit
                                  ? setEditing(product)
                                  : setDetail(product)
                              }
                            >
                              {canEdit ? (
                                <Edit3 size={15} />
                              ) : (
                                <Eye size={15} />
                              )}
                              {canEdit ? "Editar produto" : "Ver detalhes"}
                            </button>
                            {canEdit && (
                              <button
                                className="delete-action"
                                aria-label={`Excluir ${product.name}`}
                                onClick={() => {
                                  setDeleting(product);
                                  setDeleteError("");
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Preço</th>
                            <th>Estoque</th>
                            <th>Status</th>
                            <th>
                              <span className="sr-only">Ações</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((product) => (
                            <tr key={product.id}>
                              <td>
                                <button
                                  className="table-product"
                                  onClick={() => setDetail(product)}
                                >
                                  <span className="table-image">
                                    <ProductImage
                                      url={product.imageUrls?.[0]}
                                      name={product.name}
                                    />
                                  </span>
                                  <span>
                                    <strong>{product.name}</strong>
                                    <small>
                                      #{String(product.id).padStart(4, "0")}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td className="price-cell">
                                <ProductPrice product={product} />
                              </td>
                              <td>{count(product.stock)} un.</td>
                              <td>
                                <StockBadge stock={product.stock} />
                                <PrescriptionBadge product={product} />
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className="icon-button"
                                    aria-label={`${canEdit ? "Editar" : "Ver"} ${product.name}`}
                                    onClick={() =>
                                      canEdit
                                        ? setEditing(product)
                                        : setDetail(product)
                                    }
                                  >
                                    {canEdit ? (
                                      <Edit3 size={17} />
                                    ) : (
                                      <Eye size={17} />
                                    )}
                                  </button>
                                  {canEdit && (
                                    <button
                                      className="icon-button danger-text"
                                      aria-label={`Excluir ${product.name}`}
                                      onClick={() => {
                                        setDeleting(product);
                                        setDeleteError("");
                                      }}
                                    >
                                      <Trash2 size={17} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <footer className="catalog-footer">
                    <span>
                      {filtered.length
                        ? `Mostrando ${(safePage - 1) * 8 + 1}–${Math.min(safePage * 8, filtered.length)} de ${count(filtered.length)} produtos`
                        : "0 produtos"}
                      {filter !== "all" || query ? " · filtro aplicado" : ""}
                    </span>
                    <div className="pagination">
                      <button
                        className="icon-button"
                        aria-label="Página anterior"
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage(safePage - 1)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span>
                        {safePage} <small>/ {pages}</small>
                      </span>
                      <button
                        className="icon-button"
                        aria-label="Próxima página"
                        disabled={safePage === pages}
                        onClick={() => setCurrentPage(safePage + 1)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </footer>
                </section>
              ) : (
                <section className="overview-panel">
                  <div className="overview-welcome">
                    <span className="eyebrow">CADA DETALHE CONTA</span>
                    <h2>
                      Seu estoque conta uma história.
                      <br />
                      Acompanhe de perto.
                    </h2>
                    <p>
                      {stats.empty
                        ? `${stats.empty} produto(s) estão sem estoque e precisam de atenção.`
                        : "Mantenha os produtos atualizados para uma operação organizada."}
                    </p>
                    <button
                      className="button primary"
                      onClick={() => navigate("products")}
                    >
                      Explorar catálogo
                      <ArrowRight size={17} />
                    </button>
                    <Boxes
                      className="overview-art"
                      size={140}
                      strokeWidth={0.8}
                    />
                  </div>
                  <div className="stock-summary">
                    <h3>Disponibilidade do catálogo</h3>
                    {[
                      {
                        label: "Em estoque",
                        amount: stats.total - stats.low - stats.empty,
                        color: "blue",
                      },
                      {
                        label: "Estoque baixo",
                        amount: stats.low,
                        color: "amber",
                      },
                      {
                        label: "Sem estoque",
                        amount: stats.empty,
                        color: "red",
                      },
                    ].map((row) => (
                      <div className="stock-bar" key={row.label}>
                        <div>
                          <span>{row.label}</span>
                          <strong>{row.amount}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            className={row.color}
                            style={{
                              width: `${stats.total ? (row.amount / stats.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {page === "users" && isAdmin && (
            <UserManagement
              currentUser={user}
              onCurrentUserChanged={onCurrentUserChanged}
            />
          )}
          {page === "api" && isAdmin && (
            <section className="info-grid">
              <div className="info-card">
                <span className="info-icon">
                  <Activity size={24} />
                </span>
                <h2>Conexão com a API</h2>
                <p>
                  O portal consulta e salva os produtos diretamente na API do
                  seu projeto.
                </p>
                <dl>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {loadError
                        ? "Indisponível"
                        : loading
                          ? "Verificando…"
                          : "Conectada"}
                    </dd>
                  </div>
                  <div>
                    <dt>Última sincronização</dt>
                    <dd>
                      {updatedAt
                        ? updatedAt.toLocaleTimeString("pt-BR")
                        : "Ainda não sincronizado"}
                    </dd>
                  </div>
                  <div>
                    <dt>Recurso</dt>
                    <dd>
                      <code>/medicines</code>
                    </dd>
                  </div>
                </dl>
                <button
                  className="button secondary"
                  disabled={loading}
                  onClick={reload}
                >
                  <RefreshCw size={16} /> Testar conexão
                </button>
              </div>
              <div className="info-card">
                <span className="info-icon">
                  <ShieldCheck size={24} />
                </span>
                <h2>Seu nível de acesso</h2>
                <p>
                  {user.role === "Admin"
                    ? "Administrador: você pode gerenciar usuários, funções, produtos."
                    : canEdit
                      ? "Farmácia: você pode gerenciar o catálogo de produtos."
                      : "Consulta: você pode visualizar os produtos, o estoque e exportar o catálogo."}
                </p>
                <ul className="permission-list">
                  <li>
                    <Check size={17} /> Consultar produtos e estoque
                  </li>
                  <li>
                    <Check size={17} /> Exportar catálogo em CSV
                  </li>
                  <li>
                    {canEdit ? <Check size={17} /> : <ShieldCheck size={17} />}
                    {canEdit
                      ? "Cadastrar, editar e excluir produtos"
                      : "Edição restrita à equipe autorizada"}
                  </li>
                  <li>
                    {canEdit ? <Check size={17} /> : <ShieldCheck size={17} />}
                    {canEdit
                      ? "Adicionar fotos por URL e upload"
                      : "Visualizar fotos dos produtos"}
                  </li>
                </ul>
                <div className="notice">
                  A primeira conta cadastrada recebe o cargo Admin. As próximas
                  recebem acesso de consulta.
                </div>
              </div>
              <div className="info-card endpoints">
                <h2>Operações disponíveis</h2>
                <p>
                  As operações exigem uma sessão autenticada. As permissões são
                  verificadas pelo servidor.
                </p>
                {[
                  ["GET", "/medicines", "Consultar catálogo"],
                  ["POST", "/medicines", "Cadastrar produto"],
                  ["PATCH", "/medicines/:id", "Atualizar produto"],
                  ["DELETE", "/medicines/:id", "Excluir produto"],
                  ["POST", "/medicines/images", "Enviar uma foto"],
                  ["POST", "/medicines/import", "Importar produtos"],
                  ["GET", "/users", "Gerenciar usuários"],
                ].map(([method, path, label]) => (
                  <div className="endpoint" key={method + path}>
                    <code className={`method method-${method.toLowerCase()}`}>
                      {method}
                    </code>
                    <code>{path}</code>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {page === "account" && (
            <section className="info-card account-card">
              <span className="avatar large">
                {(user.name || user.email).slice(0, 2).toUpperCase()}
              </span>
              <h2>{user.name || "Minha conta"}</h2>
              <p>Seu perfil no portal Nexo.</p>
              <dl>
                <div>
                  <dt>E-mail</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Permissão</dt>
                  <dd>
                    {user.role === "Admin"
                      ? "Administrador"
                      : user.role === "Farmacia"
                        ? "Farmácia"
                        : "Cliente"}
                  </dd>
                </div>
                <div>
                  <dt>Identificador</dt>
                  <dd>#{user.sub}</dd>
                </div>
              </dl>
              <button className="button secondary" onClick={onLogout}>
                <LogOut size={17} /> Sair da conta
              </button>
            </section>
          )}
          <footer className="page-footer">
            <span>
              nexo<span>.</span>{" "}
              <span>Uma gestão mais leve, todos os dias.</span>
            </span>
            <span>
              <Database size={13} />
              {updatedAt
                ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Aguardando sincronização"}
            </span>
          </footer>
        </main>
      </div>
      {importing && canEdit && (
        <ProductImport
          onClose={() => setImporting(false)}
          onImported={(count) => {
            setImporting(false);
            setToast(`${count} produtos importados com sucesso.`);
            void reload();
          }}
        />
      )}
      {editing && canEdit && (
        <ProductForm
          product={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {deleting && (
        <Modal
          title="Excluir produto?"
          subtitle="Esta ação não pode ser desfeita."
          onClose={() => setDeleting(null)}
          busy={deleteBusy}
        >
          <div className="modal-content">
            <div className="delete-preview">
              <span>
                <Trash2 size={25} />
              </span>
              <div>
                <strong>{deleting.name}</strong>
                <p>O produto será removido do banco de dados.</p>
              </div>
            </div>
            {deleteError && (
              <div className="error-message" role="alert">
                {deleteError}
              </div>
            )}
          </div>
          <footer className="modal-footer">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              disabled={deleteBusy}
              onClick={remove}
            >
              {deleteBusy ? "Excluindo…" : "Excluir produto"}
            </button>
          </footer>
        </Modal>
      )}
      {detail && (
        <ProductDetail
          product={detail}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{toast}</span>
          <button aria-label="Dispensar mensagem" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ProductDetail({ product, canEdit, onClose, onEdit }) {
  const [selected, setSelected] = useState(0);
  return (
    <Modal title="Detalhes do produto" onClose={onClose}>
      <div className="modal-content product-detail">
        <div className="detail-image">
          <ProductImage
            url={product.imageUrls?.[selected]}
            name={product.name}
          />
        </div>
        {product.imageUrls?.length > 1 && (
          <div className="detail-thumbnails">
            {product.imageUrls.map((url, i) => (
              <button
                key={url}
                className={selected === i ? "active" : ""}
                onClick={() => setSelected(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-pressed={selected === i}
              >
                <ProductImage url={url} name={`Foto ${i + 1}`} />
              </button>
            ))}
          </div>
        )}
        <span className="product-code">
          PRODUTO #{String(product.id).padStart(4, "0")}
        </span>
        <h2>{product.name}</h2>
        <p className="detail-description">{product.description}</p>
        <PrescriptionBadge product={product} />
        <div className="detail-price">
          <ProductPrice product={product} />
          <StockBadge stock={product.stock} />
        </div>
        <p className="muted">{count(product.stock)} unidades em estoque</p>
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Fechar
        </button>
        {canEdit && (
          <button className="button primary" onClick={onEdit}>
            <Edit3 size={16} />
            Editar produto
          </button>
        )}
      </footer>
    </Modal>
  );
}
