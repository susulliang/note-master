-- Distinguish the root operator and management role from ordinary accounts.
ALTER TABLE auth_users ADD COLUMN is_management INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;

-- Dezzy is the single root account; preserve the existing admin capability.
UPDATE auth_users
SET is_admin = 1, is_management = 0, is_super_admin = 1
WHERE username = 'Dezzy' COLLATE NOCASE;
