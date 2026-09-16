import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Link,
  UploadCloud,
  X,
  Plus,
  Package,
  Save,
} from "lucide-react";
import { api } from "./api";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
  wide = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  function onKeyDown(e) {
    if (e.key === "Escape" && !busy) onClose();
    if (e.key !== "Tab") return;
    const items = ref.current.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    );
    const first = items[0],
      last = items[items.length - 1];
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === ref.current)
    ) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={onKeyDown}
      >
        <header className="modal-heading">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Fechar janela"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ProductImage({ url, name, ...props }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed ? (
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
      {...props}
    />
  ) : (
    <div className="image-placeholder">
      <Package size={34} strokeWidth={1.3} />
      <span>Sem imagem</span>
    </div>
  );
}

export default function ProductForm({ product, onClose, onSaved }) {
  const [price, setPrice] = useState(product?.price ?? "");
  const [discount, setDiscount] = useState(product?.discountPercentage ?? 0);
  const [requiresPrescription, setRequiresPrescription] = useState(
    product?.requiresPrescription ?? false,
  );
  const finalPrice =
    Math.round(
      (Math.round(Number(price) * 100) *
        (10000 - Math.round(Number(discount) * 100))) /
        10000,
    ) / 100;
  const [images, setImages] = useState(product?.imageUrls || []);
  const [imageMode, setImageMode] = useState("upload");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const activeUpload = useRef(false);
  async function upload(files) {
    if (activeUpload.current || busy) return;
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.length + images.length > 6)
      return setError("Adicione no máximo 6 fotos por produto.");
    if (
      list.some(
        (f) =>
          f.size > 5 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    )
      return setError("Escolha imagens JPG, PNG ou WebP de até 5 MB cada.");
    activeUpload.current = true;
    setUploading(true);
    setError("");
    try {
      for (const file of list) {
        const body = new FormData();
        body.append("file", file);
        const result = await api("/medicines/images", { method: "POST", body });
        setImages((old) => [...old, result.url]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      activeUpload.current = false;
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function addUrl() {
    try {
      const parsed = new URL(url.trim());
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        url.trim().length > 2048
      )
        throw new Error();
      if (images.length >= 6)
        return setError("Adicione no máximo 6 fotos por produto.");
      if (images.includes(parsed.href))
        return setError("Esta imagem já foi adicionada.");
      setImages([...images, parsed.href]);
      setUrl("");
      setError("");
    } catch {
      setError(
        "Informe uma URL de imagem válida, começando com https:// ou http://.",
      );
    }
  }
  async function save(event) {
    event.preventDefault();
    if (uploading) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!data.name.trim() || !data.description.trim())
      return setError("Preencha o nome e a descrição do produto.");
    if (url.trim())
      return setError(
        "Adicione a URL da foto ou limpe o campo antes de salvar.",
      );
    setBusy(true);
    setError("");
    try {
      const saved = await api(`/medicines${product ? `/${product.id}` : ""}`, {
        method: product ? "PATCH" : "POST",
        body: {
          name: data.name.trim(),
          description: data.description.trim(),
          price: Number(data.price),
          discountPercentage: Number(discount),
          requiresPrescription,
          stock: Number(data.stock),
          imageUrls: images,
        },
      });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={product ? "Editar produto" : "Novo produto"}
      subtitle="Os detalhes certos fazem toda a diferença."
      onClose={onClose}
      busy={busy || uploading}
    >
      <form onSubmit={save}>
        <div className="modal-content">
          <fieldset disabled={busy || uploading}>
            <div className="section-label">
              <Package size={17} /> INFORMAÇÕES DO PRODUTO
            </div>
            <label>
              Nome do produto <span>*</span>
              <input
                name="name"
                defaultValue={product?.name}
                placeholder="Ex.: Vitamina C 500 mg"
                required
                maxLength={160}
              />
            </label>
            <label>
              Descrição <span>*</span>
              <textarea
                name="description"
                defaultValue={product?.description}
                placeholder="Apresentação, características e detalhes do produto…"
                required
                maxLength={2000}
                rows={3}
              />
            </label>
            <div className="form-columns">
              <label>
                Preço de venda (R$) <span>*</span>
                <input
                  type="number"
                  name="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  required
                  min="0"
                  max="99999999.99"
                  step="0.01"
                />
              </label>
              <label>
                Quantidade em estoque <span>*</span>
                <input
                  type="number"
                  name="stock"
                  defaultValue={product?.stock ?? 0}
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                />
              </label>
            </div>
            <div className="form-columns">
              <label>
                Desconto (%)
                <input
                  type="number"
                  name="discountPercentage"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  min="0"
                  max="100"
                  step="0.01"
                  required
                />
              </label>
              <div className="price-preview">
                <span>Preço final</span>
                <output aria-live="polite">
                  {Number.isFinite(finalPrice) &&
                  Number(discount) >= 0 &&
                  Number(discount) <= 100
                    ? finalPrice.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })
                    : "—"}
                </output>
                <small>Calculado sobre o preço original</small>
              </div>
            </div>
            <label className="prescription-toggle">
              <input
                type="checkbox"
                checked={requiresPrescription}
                onChange={(e) => setRequiresPrescription(e.target.checked)}
              />
              <span>Exige receita médica</span>
            </label>
            <p className="field-help prescription-help">
              Produtos marcados exigem uma referência de receita ao registrar a
              prescrição.
            </p>
            <div className="section-label photo-heading">
              <ImagePlus size={17} /> FOTOS DO PRODUTO{" "}
              <span>{images.length}/6</span>
            </div>
            <div className="image-tabs">
              <button
                className={imageMode === "upload" ? "active" : ""}
                type="button"
                onClick={() => setImageMode("upload")}
              >
                <UploadCloud size={16} /> Upload
              </button>
              <button
                className={imageMode === "url" ? "active" : ""}
                type="button"
                onClick={() => setImageMode("url")}
              >
                <Link size={16} /> Adicionar por URL
              </button>
            </div>
            {imageMode === "upload" ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={(e) => upload(e.target.files)}
                />
                <button
                  type="button"
                  className={`dropzone ${dragging ? "dragging" : ""}`}
                  disabled={images.length >= 6}
                  onClick={() => fileRef.current.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    upload(e.dataTransfer.files);
                  }}
                >
                  <span className="upload-icon">
                    <UploadCloud size={23} />
                  </span>
                  <strong>
                    Clique para enviar <span>ou arraste as fotos</span>
                  </strong>
                  <small>JPG, PNG ou WebP • até 5 MB por foto</small>
                </button>
              </>
            ) : (
              <div className="url-field">
                <input
                  aria-label="URL da imagem"
                  type="url"
                  placeholder="https://exemplo.com/produto.jpg"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addUrl();
                    }
                  }}
                />
                <button
                  className="button secondary"
                  type="button"
                  onClick={addUrl}
                  disabled={images.length >= 6}
                >
                  <Plus size={16} /> Adicionar
                </button>
              </div>
            )}
            {images.length > 0 && (
              <div className="image-gallery">
                {images.map((image, i) => (
                  <div className="image-preview" key={image}>
                    <ProductImage url={image} name={`Foto ${i + 1}`} />
                    {i === 0 && <span className="cover-label">Capa</span>}
                    <button
                      type="button"
                      aria-label={`Remover foto ${i + 1}`}
                      onClick={() =>
                        setImages(images.filter((_, index) => i !== index))
                      }
                    >
                      <X size={14} />
                    </button>
                    {i > 0 && (
                      <button
                        type="button"
                        className="make-cover"
                        onClick={() =>
                          setImages([
                            image,
                            ...images.filter((x) => x !== image),
                          ])
                        }
                      >
                        Usar como capa
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="field-help">
              A primeira foto será a capa do produto. As imagens são opcionais.
            </p>
          </fieldset>
          {uploading && (
            <div className="notice" role="status">
              <span className="spinner" /> Enviando e preparando suas fotos…
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy || uploading}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {busy ? <span className="spinner" /> : <Save size={17} />}
            {busy
              ? "Salvando…"
              : product
                ? "Salvar alterações"
                : "Cadastrar produto"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
