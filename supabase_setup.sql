-- Run this in your Supabase project's SQL Editor (https://supabase.com → SQL Editor)

-- 1. Create the app_data table
CREATE TABLE IF NOT EXISTS app_data (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- 3. Allow public read/write (anon key access for the app)
CREATE POLICY "Allow public read" ON app_data FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON app_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON app_data FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON app_data FOR DELETE USING (true);

-- 4. Enable realtime (optional — for live sync between browsers)
ALTER PUBLICATION supabase_realtime ADD TABLE app_data;
