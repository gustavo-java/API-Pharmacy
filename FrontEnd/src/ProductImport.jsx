import ProductPrice, { PrescriptionBadge } from "./ProductPrice";
import { useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Modal } from "./ProductForm";
import { api } from "./api";
export default function ProductImport({ onClose, onImported }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  function downloadModel() {
    const data =
      "\uFEFFnome;descricao;preco;estoque;fotos;desconto;exige_receita\r\nVitamina C;30 comprimidos;29,90;20;;0;nao\r\n";
    const url = URL.createObjectURL(
      new Blob([data], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-produtos.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function read(file) {
    setPreview(null);
    setError("");
    setFilename(file?.name || "");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !/\.(csv|xlsx)$/i.test(file.name))
      return setError("Selecione um CSV ou XLSX de até 2 MB.");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      setPreview(
        await api("/medicines/import/preview", { method: "POST", body }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/medicines/import", {
        method: "POST",
        body: { products: preview.products },
      });
      onImported(result.count);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title="Importar produtos"
      subtitle="Da planilha para o seu catálogo, com uma conferência antes de salvar."
      onClose={onClose}
      busy={busy}
    >
      <div className="modal-content">
        <div className="import-instructions">
          <FileSpreadsheet size={27} />
          <div>
            <strong>CSV ou XLSX • até 1.000 produtos • 2 MB</strong>
            <p>
              Use uma única aba com as colunas nome, descricao, preco, estoque e
              fotos, desconto e exige_receita (opcionais). Use sim/não para
              exige_receita e 0 a 100 para desconto. No preço, use 29,90 ou
              29.90, sem separador de milhar. Separe URLs de fotos com |.
            </p>
          </div>
        </div>
        <button className="button secondary" onClick={downloadModel}>
          <Download size={16} /> Baixar modelo CSV
        </button>
        <label className="import-file">
          Selecionar planilha
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => read(e.target.files?.[0])}
          />
        </label>
        {busy && (
          <p role="status">
            <span className="spinner" /> Processando planilha…
          </p>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {preview && (
          <>
            <div className="notice">
              {preview.count} produtos prontos para importar de {filename}.
              Serão criados novos produtos; os existentes não serão atualizados.
            </div>
            <div className="table-scroll import-preview">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.products.slice(0, 20).map((p, i) => (
                    <tr key={i}>
                      <td>
                        {p.name}
                        <PrescriptionBadge product={p} />
                      </td>
                      <td>
                        <ProductPrice product={p} />
                      </td>
                      <td>{p.stock}</td>
                      <td>{p.imageUrls.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.count > 20 && (
              <p className="field-help">
                Mostrando os primeiros 20 de {preview.count} produtos. Todos
                serão importados.
              </p>
            )}
          </>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          className="button primary"
          onClick={save}
          disabled={busy || !preview}
        >
          <UploadCloud size={17} /> Confirmar importação
          {preview ? ` (${preview.count})` : ""}
        </button>
      </footer>
    </Modal>
  );
}
