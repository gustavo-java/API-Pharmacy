import {
  IsInt,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  ValidateIf,
  IsString,
  Min,
  Max,
  MaxLength,
  Matches,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import type { CreateMedicine } from '../../domain/entities/medicine';

class MedicineImagesDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @Matches(/^(https?:\/\/[^\s]+|\/uploads\/[0-9a-f-]{36}\.webp)$/, {
    each: true,
    message: 'As fotos devem usar uma URL http(s) ou um upload do portal.',
  })
  imageUrls?: string[];
}

export class CreateMedicineDto
  extends MedicineImagesDto
  implements CreateMedicine
{
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(160)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2000)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  price: number;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  stock: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  requiresPrescription?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage?: number;
}

export class UpdateMedicineDto extends PartialType(CreateMedicineDto, {
  skipNullProperties: false,
}) {}
