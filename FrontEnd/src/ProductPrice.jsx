export function finalPrice(product) {
  return (
    product.finalPrice ??
    Math.round(
      (Math.round(product.price * 100) *
        (10000 - Math.round((product.discountPercentage ?? 0) * 100))) /
        10000,
    ) / 100
  );
}
const money = (value) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function ProductPrice({ product }) {
  return (
    <span className="product-pricing">
      {product.discountPercentage > 0 && (
        <span className="original-price">
          <s>{money(product.price)}</s>
          <span className="discount-label">−{product.discountPercentage}%</span>
        </span>
      )}
      <strong>{money(finalPrice(product))}</strong>
    </span>
  );
}
export function PrescriptionBadge({ product }) {
  return product.requiresPrescription ? (
    <span className="prescription-badge">Receita médica obrigatória</span>
  ) : null;
}
