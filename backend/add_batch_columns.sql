-- Migration to add batch system columns to scheduled_exams table
-- Run this SQL against your PostgreSQL database

-- Add number_of_batches column
ALTER TABLE scheduled_exams
ADD COLUMN IF NOT EXISTS number_of_batches INTEGER DEFAULT 1;

-- Add batch_assignments column (JSON array)
ALTER TABLE scheduled_exams
ADD COLUMN IF NOT EXISTS batch_assignments JSONB DEFAULT '[]'::jsonb;

-- Update existing records to have default values
UPDATE scheduled_exams
SET number_of_batches = 1
WHERE number_of_batches IS NULL;

UPDATE scheduled_exams
SET batch_assignments = '[]'::jsonb
WHERE batch_assignments IS NULL;

-- Verify the changes
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scheduled_exams'
AND column_name IN ('number_of_batches', 'batch_assignments');
