CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'ADMIN');
CREATE TYPE work_item_status AS ENUM ('DRAFT', 'SUBMITTED', 'EVALUATING', 'DONE', 'REJECTED');
CREATE TYPE submission_status AS ENUM ('UPLOADING', 'SUBMITTED', 'EVALUATING', 'DONE', 'REJECTED');

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'EMPLOYEE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE work_items (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  plan_text TEXT NOT NULL,
  due_date DATE NOT NULL,
  status work_item_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE submissions (
  id BIGSERIAL PRIMARY KEY,
  work_item_id BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status submission_status NOT NULL DEFAULT 'UPLOADING',
  note_text TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(work_item_id, version)
);

CREATE TABLE file_artifacts (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  nas_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 CHAR(64) NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_work_items_owner_status ON work_items(owner_user_id, status);
CREATE INDEX idx_work_items_due_date ON work_items(due_date);
CREATE INDEX idx_submissions_work_item_version ON submissions(work_item_id, version DESC);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_file_artifacts_submission_id ON file_artifacts(submission_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_work_items_updated_at
BEFORE UPDATE ON work_items
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_submissions_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
