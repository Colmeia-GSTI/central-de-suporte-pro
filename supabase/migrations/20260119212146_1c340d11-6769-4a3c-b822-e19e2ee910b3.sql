-- Add financial_email column to clients table for billing emails
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS financial_email TEXT;