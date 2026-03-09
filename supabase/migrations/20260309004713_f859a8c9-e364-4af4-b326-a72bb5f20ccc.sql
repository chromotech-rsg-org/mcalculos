-- Add new columns to documents table to support tab structure and extraction options
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS extraction_options JSONB;