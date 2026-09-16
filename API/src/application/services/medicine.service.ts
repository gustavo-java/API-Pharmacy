import { withMedicinePricing } from '../../domain/entities/medicine';
import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../domain/domain.error';
import type {
  CreateMedicine,
  UpdateMedicine,
} from '../../domain/entities/medicine';
import {
  MEDICINE_REPOSITORY,
  type MedicineRepository,
} from '../../domain/repositories/medicine.repository';

@Injectable()
export class MedicineService {
  constructor(
    @Inject(MEDICINE_REPOSITORY)
    private readonly medicines: MedicineRepository,
  ) {}

  async create(data: CreateMedicine) {
    return withMedicinePricing(await this.medicines.create(data));
  }

  async findAll() {
    return (await this.medicines.findAll()).map(withMedicinePricing);
  }

  async findOne(id: number) {
    const medicine = await this.medicines.findById(id);
    if (!medicine) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Medicamento com ID ${id} não encontrado.`,
      );
    }
    return withMedicinePricing(medicine);
  }

  async update(id: number, data: UpdateMedicine) {
    const medicine = await this.medicines.update(id, data);
    if (!medicine) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Medicamento com ID ${id} não encontrado.`,
      );
    }
    return withMedicinePricing(medicine);
  }

  async remove(id: number) {
    const medicine = await this.medicines.delete(id);
    if (!medicine) {
      throw new DomainError(
        'ENTITY_NOT_FOUND',
        `Medicamento com ID ${id} não encontrado.`,
      );
    }
    return withMedicinePricing(medicine);
  }
}
