CREATE TYPE notification_type AS ENUM (
  'SUBMISSION_SUBMITTED',
  'SUBMISSION_REVIEWED',
  'CHANGE_REQUEST_CREATED',
  'CHANGE_REQUEST_REVIEWED',
  'COMMENT_CREATED'
);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  type notification_type NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  work_item_id BIGINT REFERENCES work_items(id) ON DELETE CASCADE,
  submission_id BIGINT REFERENCES submissions(id) ON DELETE CASCADE,
  change_request_id BIGINT REFERENCES change_requests(id) ON DELETE CASCADE,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE work_item_comments (
  id BIGSERIAL PRIMARY KEY,
  work_item_id BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  submission_id BIGINT REFERENCES submissions(id) ON DELETE SET NULL,
  author_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_comment_id BIGINT REFERENCES work_item_comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_work_item_comments_comment_text_non_empty CHECK (char_length(trim(comment_text)) > 0)
);

CREATE INDEX idx_notifications_recipient_created_at
  ON notifications(recipient_user_id, created_at DESC);
CREATE INDEX idx_notifications_recipient_unread
  ON notifications(recipient_user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_type_created_at
  ON notifications(type, created_at DESC);

CREATE INDEX idx_work_item_comments_work_item_created_at
  ON work_item_comments(work_item_id, created_at ASC);
CREATE INDEX idx_work_item_comments_submission_created_at
  ON work_item_comments(submission_id, created_at ASC);
CREATE INDEX idx_work_item_comments_parent
  ON work_item_comments(parent_comment_id);

CREATE TRIGGER trg_work_item_comments_updated_at
BEFORE UPDATE ON work_item_comments
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
