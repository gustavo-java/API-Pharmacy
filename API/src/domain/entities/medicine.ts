export interface Medicine {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  imageUrls?: string[];
  requiresPrescription?: boolean;
  discountPercentage?: number;
}

export type CreateMedicine = Omit<Medicine, 'id'>;
export type UpdateMedicine = Partial<CreateMedicine>;

// Work in cents and hundredths of one percentage point; always derive from base price.
export function withMedicinePricing(medicine: Medicine) {
  const discountPercentage = medicine.discountPercentage ?? 0;
  const cents = Math.round(medicine.price * 100);
  const finalCents = Math.round(
    (cents * (10000 - Math.round(discountPercentage * 100))) / 10000,
  );
  return {
    ...medicine,
    requiresPrescription: medicine.requiresPrescription ?? false,
    discountPercentage,
    finalPrice: finalCents / 100,
    discountAmount: (cents - finalCents) / 100,
  };
}
