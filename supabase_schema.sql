-- ============================================================================
-- AI Exam Companion - Database Schema Script (v1)
-- Run this in your Supabase SQL Editor to initialize your database.
-- ============================================================================

-- Enable pgvector (unused in v1, provisioned for Stage 2+)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Create content_source Table
CREATE TABLE IF NOT EXISTS content_source (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('preset_exam', 'uploaded_papers', 'notes', 'handwriting')),
  exam_name     text NOT NULL,          -- 'JEE' | 'NEET' | 'CAT' | custom string
  mode_flag     text CHECK (mode_flag IN ('similar', 'trend')),  -- null for preset
  blueprint     jsonb,                  -- null for preset; analysis blueprint
  file_paths    text[],                 -- storage paths; null for preset
  status        text NOT NULL DEFAULT 'ready' CHECK (status IN ('analyzing', 'ready', 'error')),
  created_at    timestamptz DEFAULT now()
);

-- 2. Create quiz Table
CREATE TABLE IF NOT EXISTS quiz (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES content_source(id) ON DELETE CASCADE,
  length        text NOT NULL CHECK (length IN ('SHORT', 'MEDIUM', 'HOUR')),
  questions     jsonb NOT NULL,         -- array of questions
  created_at    timestamptz DEFAULT now()
);

-- 3. Create attempt Table
CREATE TABLE IF NOT EXISTS attempt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id       uuid NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES content_source(id) ON DELETE CASCADE,
  score         numeric NOT NULL,       -- 0..1
  started_at    timestamptz,
  submitted_at  timestamptz DEFAULT now()
);

-- 4. Create attempt_item Table
CREATE TABLE IF NOT EXISTS attempt_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES attempt(id) ON DELETE CASCADE,
  question_id     text NOT NULL,        -- matches questions[].id within quiz
  topic           text NOT NULL,
  user_answer     jsonb,
  is_correct      boolean NOT NULL
);

-- 5. Create chat_message Table
CREATE TABLE IF NOT EXISTS chat_message (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_item_id uuid NOT NULL REFERENCES attempt_item(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- Row-Level Security (RLS) Configuration
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE content_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message ENABLE ROW LEVEL SECURITY;

-- Policies for content_source
CREATE POLICY content_source_owner_policy ON content_source
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for quiz
CREATE POLICY quiz_owner_policy ON quiz
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for attempt
CREATE POLICY attempt_owner_policy ON attempt
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policies for attempt_item
CREATE POLICY attempt_item_owner_policy ON attempt_item
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM attempt
      WHERE attempt.id = attempt_item.attempt_id
      AND attempt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM attempt
      WHERE attempt.id = attempt_item.attempt_id
      AND attempt.user_id = auth.uid()
    )
  );

-- Policies for chat_message
CREATE POLICY chat_message_owner_policy ON chat_message
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM attempt_item
      JOIN attempt ON attempt_item.attempt_id = attempt.id
      WHERE attempt_item.id = chat_message.attempt_item_id
      AND attempt.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM attempt_item
      JOIN attempt ON attempt_item.attempt_id = attempt.id
      WHERE attempt_item.id = chat_message.attempt_item_id
      AND attempt.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Storage Bucket Instructions (Papers Bucket)
-- ============================================================================
-- To configure storage in your Supabase Dashboard:
-- 1. Navigate to "Storage".
-- 2. Click "New Bucket" and name it "papers".
-- 3. Keep the bucket "Private" (as per §3.2 storage contract).
-- 4. Enable RLS on the bucket and add the following policies for "papers" object access:
--    - SELECT: authenticated users can read files they own (path format matches: auth.uid() || '/*')
--    - INSERT: authenticated users can upload files to their own directory (path format matches: auth.uid() || '/*')
--    - DELETE: authenticated users can delete files they own (path format matches: auth.uid() || '/*')
-- ============================================================================

-- Optimizing indexes for join queries and user lookups
CREATE INDEX IF NOT EXISTS idx_content_source_user ON content_source(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz(user_id);
CREATE INDEX IF NOT EXISTS idx_attempt_user ON attempt(user_id);
CREATE INDEX IF NOT EXISTS idx_attempt_item_attempt ON attempt_item(attempt_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_item ON chat_message(attempt_item_id);
