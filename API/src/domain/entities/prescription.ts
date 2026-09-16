import { DomainError } from '../domain.error';
import type { Medicine } from './medicine';
export interface Prescription {
  id: number;
  userId: number;
  medicineId: number;
  quantity: number;
  date: Date;
  prescriptionReference?: string | null;
  medicine?: Medicine;
}

export type CreatePrescription = Pick<
  Prescription,
  'userId' | 'medicineId' | 'quantity' | 'prescriptionReference'
>;
export type UpdatePrescription = Partial<CreatePrescription>;

export function validatePrescriptionReference(
  medicine: Medicine,
  reference?: string | null,
) {
  if (medicine.requiresPrescription && !reference?.trim()) {
    throw new DomainError(
      'PRESCRIPTION_REQUIRED',
      'Este produto exige o identificador da receita médica (prescriptionReference).',
    );
  }
}
