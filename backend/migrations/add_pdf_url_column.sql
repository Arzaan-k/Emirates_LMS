-- Migration: Add pdf_url column to content table
-- Purpose: Store PDF version URLs for documents converted from PPT/DOCX
-- Date: 2026-02-08

-- Add pdf_url column to content table
ALTER TABLE content
ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(1000);

-- Add comment to the column
COMMENT ON COLUMN content.pdf_url IS 'PDF version URL for secure viewing (converted from PPT/DOCX files)';

-- Create index for pdf_url lookups
CREATE INDEX IF NOT EXISTS idx_content_pdf_url ON content(pdf_url) WHERE pdf_url IS NOT NULL;

-- Update existing PPT/DOCX content records (will be populated when re-uploaded or converted)
-- No data migration needed as this is a new feature

SELECT 'Migration completed: pdf_url column added successfully' AS status;
