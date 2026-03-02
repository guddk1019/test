CREATE TABLE file_artifact_revisions (
  id BIGSERIAL PRIMARY KEY,
  file_artifact_id BIGINT NOT NULL REFERENCES file_artifacts(id) ON DELETE CASCADE,
  submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  action TEXT NOT NULL CHECK (action IN ('REPLACE')),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  nas_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 CHAR(64) NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_artifact_id, revision_no)
);

CREATE INDEX idx_file_artifact_revisions_file ON file_artifact_revisions(file_artifact_id, revision_no DESC);
CREATE INDEX idx_file_artifact_revisions_submission ON file_artifact_revisions(submission_id, created_at DESC);
