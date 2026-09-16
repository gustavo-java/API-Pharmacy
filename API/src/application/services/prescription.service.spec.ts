import { DomainError } from '../../domain/domain.error';
import type { MedicineRepository } from '../../domain/repositories/medicine.repository';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { PrescriptionRepository } from '../../domain/repositories/prescription.repository';
import { PrescriptionService } from './prescription.service';

describe('PrescriptionService', () => {
  const userExists = jest.fn();
  const findMedicine = jest.fn();
  const createPrescription = jest.fn();
  const users = {
    exists: userExists,
  } as unknown as jest.Mocked<UserRepository>;
  const medicines = {
    findById: findMedicine,
  } as unknown as jest.Mocked<MedicineRepository>;
  const prescriptions = {
    createWithStockReduction: createPrescription,
  } as unknown as jest.Mocked<PrescriptionRepository>;
  const service = new PrescriptionService(prescriptions, users, medicines);

  beforeEach(() => jest.clearAllMocks());

  it('creates a prescription when user, medicine and stock are valid', async () => {
    const input = { userId: 1, medicineId: 2, quantity: 3 };
    const created = { id: 4, ...input, date: new Date() };
    userExists.mockResolvedValue(true);
    findMedicine.mockResolvedValue({
      id: 2,
      name: 'Dipirona',
      description: '500mg',
      price: 10,
      stock: 5,
    });
    createPrescription.mockResolvedValue(created);

    await expect(service.create(input)).resolves.toEqual(created);
    expect(createPrescription).toHaveBeenCalledWith(input);
  });

  it('rejects a prescription for a missing user', async () => {
    userExists.mockResolvedValue(false);

    await expect(
      service.create({ userId: 99, medicineId: 2, quantity: 1 }),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: 'ENTITY_NOT_FOUND' });
    expect(findMedicine).not.toHaveBeenCalled();
  });

  it('rejects a prescription when stock is insufficient', async () => {
    userExists.mockResolvedValue(true);
    findMedicine.mockResolvedValue({
      id: 2,
      name: 'Dipirona',
      description: '500mg',
      price: 10,
      stock: 1,
    });

    await expect(
      service.create({ userId: 1, medicineId: 2, quantity: 2 }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: 'INSUFFICIENT_STOCK',
    });
    expect(createPrescription).not.toHaveBeenCalled();
  });
});

describe('prescription-required products', () => {
  it('rejects a missing reference before any stock write', async () => {
    const createWithStockReduction = jest.fn();
    const service = new PrescriptionService(
      { createWithStockReduction } as unknown as PrescriptionRepository,
      {
        exists: jest.fn().mockResolvedValue(true),
      } as unknown as UserRepository,
      {
        findById: jest
          .fn()
          .mockResolvedValue({ stock: 10, requiresPrescription: true }),
      } as unknown as MedicineRepository,
    );
    await expect(
      service.create({ userId: 1, medicineId: 1, quantity: 1 }),
    ).rejects.toMatchObject({ code: 'PRESCRIPTION_REQUIRED' });
    expect(createWithStockReduction).not.toHaveBeenCalled();
  });
});
