-- Migration: Add Impact Existing Users Progress columns to content table
-- Run this SQL on your PostgreSQL database

-- Add impacts_existing_progress column (default true = affects all users)
ALTER TABLE content
ADD COLUMN IF NOT EXISTS impacts_existing_progress BOOLEAN DEFAULT TRUE;

-- Add impacted_users column (JSON array of user emails)
ALTER TABLE content
ADD COLUMN IF NOT EXISTS impacted_users JSONB DEFAULT '[]'::jsonb;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'content'
AND column_name IN ('impacts_existing_progress', 'impacted_users');
