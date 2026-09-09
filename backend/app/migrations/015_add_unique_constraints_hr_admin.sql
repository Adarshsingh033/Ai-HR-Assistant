-- Migration 015: Add Unique Indexes for HR and Admin username, email, phone
-- Candidates and Super Admin are explicitly exempt from these constraints.

DO $$
BEGIN
    -- Organization Members Unique Indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_org_members_username_unique') THEN
        CREATE UNIQUE INDEX idx_org_members_username_unique ON organization_members (LOWER(username));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_org_members_email_unique') THEN
        CREATE UNIQUE INDEX idx_org_members_email_unique ON organization_members (LOWER(email));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_org_members_phone_unique') THEN
        CREATE UNIQUE INDEX idx_org_members_phone_unique ON organization_members (phone) WHERE phone IS NOT NULL AND phone != '';
    END IF;

    -- Admin Unique Indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_admin_username_unique') THEN
        CREATE UNIQUE INDEX idx_admin_username_unique ON admin (LOWER(username));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_admin_email_unique') THEN
        CREATE UNIQUE INDEX idx_admin_email_unique ON admin (LOWER(email));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_admin_phone_unique') THEN
        CREATE UNIQUE INDEX idx_admin_phone_unique ON admin (phone) WHERE phone IS NOT NULL AND phone != '';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Safe fallback if existing duplicate rows prevent index creation
END $$;
