import {
  IsInt,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import type { CreatePrescription } from '../../domain/entities/prescription';

export class CreatePrescriptionDto implements CreatePrescription {
  @IsInt()
  @IsPositive()
  userId: number;

  @IsInt()
  @IsPositive()
  medicineId: number;

  @IsInt()
  @IsPositive()
  quantity: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  prescriptionReference?: string;
}

export class UpdatePrescriptionDto extends PartialType(CreatePrescriptionDto, {
  skipNullProperties: false,
}) {}
