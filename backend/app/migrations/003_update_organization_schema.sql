-- Migration 003: Update Organization table with organization_name, industry, company_size, image

ALTER TABLE organization ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);
ALTER TABLE organization ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
ALTER TABLE organization ADD COLUMN IF NOT EXISTS company_size VARCHAR(100);
ALTER TABLE organization ADD COLUMN IF NOT EXISTS image TEXT;

-- Backfill organization_name from company_name where applicable
UPDATE organization 
SET organization_name = company_name 
WHERE organization_name IS NULL AND company_name IS NOT NULL;
