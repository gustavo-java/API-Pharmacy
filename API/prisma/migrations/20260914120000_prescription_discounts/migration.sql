ALTER TABLE "Medicine"
  ADD COLUMN "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discountPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Medicine_discountPercentage_check" CHECK ("discountPercentage" >= 0 AND "discountPercentage" <= 100);
ALTER TABLE "Prescription" ADD COLUMN "prescriptionReference" TEXT;
