CREATE TYPE approval_stage AS ENUM ('TEAM_LEAD', 'ADMIN');
CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
CREATE TYPE evaluation_job_status AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

ALTER TABLE change_requests
  ADD COLUMN current_stage approval_stage NOT NULL DEFAULT 'TEAM_LEAD',
  ADD COLUMN final_decision_at TIMESTAMPTZ;

ALTER TABLE submissions
  ADD COLUMN change_request_version_snapshot INTEGER,
  ADD COLUMN evaluation_status evaluation_job_status;

ALTER TABLE submissions
  ADD CONSTRAINT chk_submissions_change_request_version_snapshot_positive
  CHECK (
    change_request_version_snapshot IS NULL
    OR change_request_version_snapshot > 0
  );

UPDATE submissions s
SET change_request_version_snapshot = c.version
FROM change_requests c
WHERE s.change_request_id = c.id
  AND s.change_request_version_snapshot IS NULL;

UPDATE change_requests
SET final_decision_at = reviewed_at
WHERE status IN ('APPROVED', 'REJECTED')
  AND reviewed_at IS NOT NULL
  AND final_decision_at IS NULL;

CREATE TABLE change_request_approvals (
  id BIGSERIAL PRIMARY KEY,
  change_request_id BIGINT NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  stage approval_stage NOT NULL,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  approver_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status approval_status NOT NULL DEFAULT 'PENDING',
  comment TEXT,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(change_request_id, stage)
);

CREATE TABLE evaluation_jobs (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  status evaluation_job_status NOT NULL DEFAULT 'QUEUED',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  worker_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submission_id)
);

CREATE TABLE evaluations (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  eval_version INTEGER NOT NULL CHECK (eval_version > 0),
  total_score NUMERIC(5,2) CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= 100)),
  grade VARCHAR(16),
  summary_text TEXT,
  checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_name VARCHAR(64),
  model_version VARCHAR(64),
  rubric_version VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submission_id, eval_version)
);

CREATE INDEX idx_change_requests_current_stage ON change_requests(current_stage);
CREATE INDEX idx_change_requests_final_decision_at ON change_requests(final_decision_at);
CREATE INDEX idx_submissions_evaluation_status ON submissions(evaluation_status);
CREATE INDEX idx_change_request_approvals_request_step ON change_request_approvals(change_request_id, step_order);
CREATE INDEX idx_change_request_approvals_status_stage ON change_request_approvals(status, stage);
CREATE INDEX idx_evaluation_jobs_status_queued_at ON evaluation_jobs(status, queued_at);
CREATE INDEX idx_evaluation_jobs_updated_at ON evaluation_jobs(updated_at DESC);
CREATE INDEX idx_evaluations_submission_version ON evaluations(submission_id, eval_version DESC);
CREATE INDEX idx_evaluations_created_at ON evaluations(created_at DESC);

CREATE TRIGGER trg_change_request_approvals_updated_at
BEFORE UPDATE ON change_request_approvals
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_evaluation_jobs_updated_at
BEFORE UPDATE ON evaluation_jobs
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
