import { validatePrescriptionReference } from '../../domain/entities/prescription';
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../domain/domain.error';
import {
  MEDICINE_REPOSITORY,
  type MedicineRepository,
} from '../../domain/repositories/medicine.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import type {
  CreatePrescription,
  UpdatePrescription,
} from '../../domain/entities/prescription';
import {
  PRESCRIPTION_REPOSITORY,
  type PrescriptionRepository,
} from '../../domain/repositories/prescription.repository';

@Injectable()
export class PrescriptionService {
  constructor(
    @Inject(PRESCRIPTION_REPOSITORY)
    private readonly prescriptions: PrescriptionRepository,
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(MEDICINE_REPOSITORY)
    private readonly medicines: MedicineRepository,
  ) {}

  async create(data: CreatePrescription) {
    if (!(await this.users.exists(data.userId))) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Usuário com ID ${data.userId} não encontrado.`,
      );
    }

    const medicine = await this.medicines.findById(data.medicineId);
    if (!medicine) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Medicamento com ID ${data.medicineId} não encontrado.`,
      );
    }
    validatePrescriptionReference(medicine, data.prescriptionReference);
    if (medicine.stock < data.quantity) {
      throw new DomainError(
        'INSUFFICIENT_STOCK',
        `Estoque insuficiente. Estoque atual: ${medicine.stock}.`,
      );
    }

    return this.prescriptions.createWithStockReduction(data);
  }

  findAll() {
    return this.prescriptions.findAll();
  }

  async findOne(id: number) {
    const prescription = await this.prescriptions.findById(id);
    if (!prescription) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Receita com ID ${id} não encontrada.`,
      );
    }
    return prescription;
  }

  async update(id: number, data: UpdatePrescription) {
    const prescription = await this.prescriptions.update(id, data);
    if (!prescription) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Receita com ID ${id} não encontrada.`,
      );
    }
    return prescription;
  }

  async remove(id: number) {
    const prescription = await this.prescriptions.delete(id);
    if (!prescription) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Receita com ID ${id} não encontrada.`,
      );
    }
    return prescription;
  }
}
