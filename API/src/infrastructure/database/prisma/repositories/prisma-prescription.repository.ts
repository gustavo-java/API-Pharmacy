import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../domain/domain.error';
import { hasPrismaCode } from '../prisma-error';
import { PrismaService } from '../prisma.service';
import {
  validatePrescriptionReference,
  type CreatePrescription,
  type UpdatePrescription,
} from '../../../../domain/entities/prescription';
import {
  withMedicinePricing,
  type Medicine,
} from '../../../../domain/entities/medicine';
import type { PrescriptionRepository } from '../../../../domain/repositories/prescription.repository';

const withProduct = { medicine: true } as const;
const present = <T extends { medicine: Medicine }>(record: T) => ({
  ...record,
  medicine: withMedicinePricing(record.medicine),
});

@Injectable()
export class PrismaPrescriptionRepository implements PrescriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithStockReduction(data: CreatePrescription) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Medicine" WHERE id = ${data.medicineId} FOR UPDATE`;
        const medicine = await tx.medicine.findUnique({
          where: { id: data.medicineId },
        });
        if (!medicine)
          throw new DomainError('ENTITY_NOT_FOUND', 'Produto não encontrado.');
        validatePrescriptionReference(medicine, data.prescriptionReference);
        if (medicine.stock < data.quantity)
          throw new DomainError('INSUFFICIENT_STOCK', 'Estoque insuficiente.');
        await tx.medicine.update({
          where: { id: medicine.id },
          data: { stock: { decrement: data.quantity } },
        });
        return present(
          await tx.prescription.create({ data, include: withProduct }),
        );
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2003'))
        throw new DomainError(
          'ENTITY_NOT_FOUND',
          'Usuário ou produto não encontrado.',
        );
      throw error;
    }
  }

  async findAll() {
    return (
      await this.prisma.prescription.findMany({ include: withProduct })
    ).map(present);
  }

  async findById(id: number) {
    const record = await this.prisma.prescription.findUnique({
      where: { id },
      include: withProduct,
    });
    return record ? present(record) : null;
  }

  async update(id: number, data: UpdatePrescription) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Prescription" WHERE id = ${id} FOR UPDATE`;
        const current = await tx.prescription.findUnique({ where: { id } });
        if (!current) return null;
        const medicineId = data.medicineId ?? current.medicineId;
        const quantity = data.quantity ?? current.quantity;
        // Stable lock order prevents opposite product swaps from deadlocking.
        for (const key of [...new Set([current.medicineId, medicineId])].sort(
          (a, b) => a - b,
        )) {
          await tx.$queryRaw`SELECT id FROM "Medicine" WHERE id = ${key} FOR UPDATE`;
        }
        const medicine = await tx.medicine.findUnique({
          where: { id: medicineId },
        });
        if (!medicine)
          throw new DomainError('ENTITY_NOT_FOUND', 'Produto não encontrado.');
        const changedProduct = medicineId !== current.medicineId;
        const reference =
          data.prescriptionReference ??
          (changedProduct ? null : current.prescriptionReference);
        validatePrescriptionReference(medicine, reference);
        const additional = changedProduct
          ? quantity
          : quantity - current.quantity;
        if (medicine.stock < additional)
          throw new DomainError(
            'INSUFFICIENT_STOCK',
            'Estoque insuficiente para alterar a receita.',
          );
        if (changedProduct)
          await tx.medicine.update({
            where: { id: current.medicineId },
            data: { stock: { increment: current.quantity } },
          });
        await tx.medicine.update({
          where: { id: medicineId },
          data: { stock: { decrement: additional } },
        });
        return present(
          await tx.prescription.update({
            where: { id },
            data: { ...data, prescriptionReference: reference },
            include: withProduct,
          }),
        );
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2003'))
        throw new DomainError(
          'ENTITY_NOT_FOUND',
          'Usuário ou produto não encontrado.',
        );
      throw error;
    }
  }

  async delete(id: number) {
    try {
      return present(
        await this.prisma.prescription.delete({
          where: { id },
          include: withProduct,
        }),
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2025')) return null;
      throw error;
    }
  }
}
