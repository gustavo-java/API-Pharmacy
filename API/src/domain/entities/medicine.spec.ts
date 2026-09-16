import { withMedicinePricing } from './medicine';

describe('automatic product discounts', () => {
  it.each([
    [100, 20, 80],
    [99.9, 15, 84.92],
    [0.29, 50, 0.15],
    [10, 0, 10],
    [10, 100, 0],
    [0, 50, 0],
    [200, 12.5, 175],
  ])(
    'calculates %s minus %s%% as %s',
    (price, discountPercentage, expected) => {
      const product = {
        id: 1,
        name: 'Produto',
        description: 'Teste',
        stock: 1,
        price,
        discountPercentage,
      };
      const response = withMedicinePricing(product);
      expect(response.finalPrice).toBe(expected);
      expect(response.price).toBe(price);
      expect(withMedicinePricing(response).finalPrice).toBe(expected);
    },
  );
});
