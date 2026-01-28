-- Add business_hours column to company_settings
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "timezone": "America/Sao_Paulo",
  "shifts": [
    {"name": "Manhã", "start": "08:30", "end": "11:45"},
    {"name": "Tarde", "start": "13:30", "end": "18:00"}
  ],
  "days": {
    "0": false,
    "1": true,
    "2": true,
    "3": true,
    "4": true,
    "5": true,
    "6": false
  }
}'::jsonb;