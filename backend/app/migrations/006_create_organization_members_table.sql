-- Migration 006: Create organization_members table with full HR profile & credentials

DROP TABLE IF EXISTS organization_members CASCADE;

CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    created_by_admin_id UUID NOT NULL,

    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    image TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_member_organization
        FOREIGN KEY (organization_id)
        REFERENCES organization(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_member_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_member_admin
        FOREIGN KEY (created_by_admin_id)
        REFERENCES admin(id)
        ON DELETE CASCADE
);
