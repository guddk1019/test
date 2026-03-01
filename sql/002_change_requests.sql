CREATE TYPE change_request_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

CREATE TABLE change_requests (
  id BIGSERIAL PRIMARY KEY,
  work_item_id BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  requester_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  status change_request_status NOT NULL DEFAULT 'REQUESTED',
  change_text TEXT NOT NULL,
  proposed_plan_text TEXT,
  proposed_due_date DATE,
  reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewer_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(work_item_id, version)
);

ALTER TABLE submissions
  ADD COLUMN change_request_id BIGINT REFERENCES change_requests(id) ON DELETE SET NULL;

CREATE INDEX idx_change_requests_work_item_version ON change_requests(work_item_id, version DESC);
CREATE INDEX idx_change_requests_status ON change_requests(status);
CREATE INDEX idx_submissions_change_request_id ON submissions(change_request_id);

CREATE TRIGGER trg_change_requests_updated_at
BEFORE UPDATE ON change_requests
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
