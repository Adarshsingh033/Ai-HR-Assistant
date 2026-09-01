-- Migration 004: Create branches table

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,
    created_by_admin_id UUID NOT NULL,

    branch_name VARCHAR(255) NOT NULL,
    branch_code VARCHAR(100),

    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_branch_organization
        FOREIGN KEY (organization_id)
        REFERENCES organization(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_branch_admin
        FOREIGN KEY (created_by_admin_id)
        REFERENCES admin(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_branch_code_per_organization
        UNIQUE (organization_id, branch_code)
);
