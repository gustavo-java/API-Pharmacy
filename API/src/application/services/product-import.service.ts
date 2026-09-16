import { BadRequestException, Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { parse } from 'csv-parse/sync';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMedicineDto } from '../../presentation/dto/medicine.dto';
import { PrismaService } from '../../infrastructure/database/prisma/prisma.service';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
const columns: Record<string, string> = {
  nome: 'name',
  descricao: 'description',
  preco: 'price',
  estoque: 'stock',
  fotos: 'imageUrls',
  desconto: 'discountPercentage',
  exige_receita: 'requiresPrescription',
};

// Inspect XLSX ZIP metadata before decompression to bound spreadsheet resource use.
function checkArchive(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buffer.length) throw new Error('Invalid ZIP');
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let expanded = 0;
  if (entries > 200) throw new Error('Invalid ZIP');
  for (let i = 0; i < entries; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new Error('Invalid ZIP');
    expanded += buffer.readUInt32LE(offset + 24);
    if (expanded > 20 * 1024 * 1024)
      throw new Error('Use uma planilha menor, sem imagens incorporadas.');
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(file?: { originalname: string; buffer: Buffer }) {
    if (!file?.buffer.length)
      throw new BadRequestException('Selecione uma planilha CSV ou XLSX.');
    let rows: (string | number | boolean)[][];
    try {
      if (/\.csv$/i.test(file.originalname)) {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(
          file.buffer,
        );
        rows = parse(content, {
          bom: true,
          delimiter: content.split(/\r?\n/)[0].includes(';') ? ';' : ',',
          skip_empty_lines: true,
          trim: true,
          max_record_size: 16000,
          to: 1002,
        });
      } else if (/\.xlsx$/i.test(file.originalname)) {
        checkArchive(file.buffer);
        const workbook = new Workbook();
        await workbook.xlsx.load(
          file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
        );
        if (workbook.worksheets.length !== 1)
          throw new Error('Use apenas uma aba na planilha.');
        const sheet = workbook.worksheets[0];
        if (sheet.rowCount > 1001 || sheet.columnCount > 7)
          throw new Error('Use até 1.000 produtos e até 7 colunas do modelo.');
        rows = [];
        sheet.eachRow({ includeEmpty: true }, (row) => {
          const cells: (string | number | boolean)[] = [];
          for (let col = 1; col <= sheet.columnCount; col++) {
            const value = row.getCell(col).value;
            if (
              value !== null &&
              typeof value !== 'string' &&
              typeof value !== 'number' &&
              typeof value !== 'boolean'
            )
              throw new Error(
                'Fórmulas, datas e células especiais não são aceitas. Use valores simples.',
              );
            cells.push(value ?? '');
          }
          rows.push(cells);
        });
      } else throw new Error('Use um arquivo .csv ou .xlsx.');
    } catch (error) {
      const message =
        error instanceof Error && /^(Use |Fórmulas)/.test(error.message)
          ? error.message
          : 'Não foi possível ler a planilha. Use o modelo CSV em UTF-8 ou um XLSX válido.';
      throw new BadRequestException(message);
    }
    if (rows.length < 2 || rows.length > 1001)
      throw new BadRequestException(
        'A planilha deve conter de 1 a 1.000 produtos.',
      );
    const headers = rows[0].map(
      (value) => columns[normalize(String(value ?? ''))],
    );
    if (
      headers.some((value) => !value) ||
      new Set(headers).size !== headers.length ||
      !['name', 'description', 'price', 'stock'].every((field) =>
        headers.includes(field),
      )
    ) {
      throw new BadRequestException(
        'Use as colunas nome, descricao, preco, estoque e, opcionalmente, fotos, desconto e exige_receita. Não repita colunas.',
      );
    }
    const products: CreateMedicineDto[] = [];
    const errors: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.every((value) => value === '' || value === null)) continue;
      const raw: Record<string, string | number | boolean> = Object.fromEntries(
        headers.map((field, index) => [field, row[index] ?? '']),
      );
      const data: Record<string, unknown> = { ...raw };
      const price = String(raw.price).trim();
      const stock = String(raw.stock).trim();
      data.name = String(raw.name).trim();
      data.description = String(raw.description).trim();
      data.price = /^\d+(?:[.,]\d{1,2})?$/.test(price)
        ? Number(price.replace(',', '.'))
        : NaN;
      data.stock = /^\d+$/.test(stock) ? Number(stock) : NaN;
      data.imageUrls = raw.imageUrls
        ? String(raw.imageUrls)
            .split('|')
            .map((url) => url.trim())
            .filter(Boolean)
        : [];
      const discount = String(raw.discountPercentage ?? '').trim();
      data.discountPercentage =
        discount === ''
          ? 0
          : /^\d+(?:[.,]\d{1,2})?$/.test(discount)
            ? Number(discount.replace(',', '.'))
            : NaN;
      const requires = normalize(String(raw.requiresPrescription ?? 'false'));
      data.requiresPrescription = ['true', 'sim', '1'].includes(requires)
        ? true
        : ['false', 'nao', '0', ''].includes(requires)
          ? false
          : requires;
      const product = plainToInstance(CreateMedicineDto, data);
      const violations = await validate(product, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (violations.length) {
        const labels: Record<string, string> = {
          requiresPrescription: 'exige_receita (sim/não ou true/false)',
          discountPercentage: 'desconto (0 a 100, até 2 casas decimais)',
          name: 'nome',
          description: 'descrição',
          price:
            'preço (não negativo, até 2 casas decimais, sem separador de milhar)',
          stock: 'estoque (inteiro não negativo)',
          imageUrls: 'fotos (até 6 URLs válidas)',
        };
        errors.push(
          `Linha ${i + 1}: confira ${violations.map((v) => labels[v.property] || v.property).join(', ')}.`,
        );
      } else products.push(product);
    }
    if (errors.length) throw new BadRequestException(errors.slice(0, 50));
    if (!products.length)
      throw new BadRequestException('A planilha não contém produtos.');
    return { products, count: products.length };
  }

  import(products: CreateMedicineDto[]) {
    // A single PostgreSQL insert: the entire batch succeeds or nothing is inserted.
    return this.prisma.medicine.createMany({ data: products });
  }
}
