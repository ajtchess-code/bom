CREATE TABLE IF NOT EXISTS recruitment_settings (
  guild_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  ticket_category_id text,
  application_channel_id text,
  application_panel_message_id text,
  recruiter_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicant_role_id text,
  trial_role_id text,
  accepted_role_id text,
  interview_voice_category_id text,
  community_feedback_role_id text,
  trial_voter_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  application_reapply_days integer NOT NULL DEFAULT 7 CHECK (application_reapply_days BETWEEN 0 AND 3650),
  trial_reapply_days integer NOT NULL DEFAULT 30 CHECK (trial_reapply_days BETWEEN 0 AND 3650),
  default_trial_days integer NOT NULL DEFAULT 7 CHECK (default_trial_days BETWEEN 1 AND 90),
  midpoint_day integer NOT NULL DEFAULT 4 CHECK (midpoint_day BETWEEN 1 AND 90),
  screenshot_required boolean NOT NULL DEFAULT true,
  auto_close_hours integer NOT NULL DEFAULT 168 CHECK (auto_close_hours BETWEEN 0 AND 8760),
  unclaimed_reminder_minutes integer NOT NULL DEFAULT 120 CHECK (unclaimed_reminder_minutes BETWEEN 0 AND 10080),
  applicant_reminder_hours integer NOT NULL DEFAULT 24 CHECK (applicant_reminder_hours BETWEEN 0 AND 720),
  vote_mode text NOT NULL DEFAULT 'ADVISORY' CHECK (vote_mode IN ('ADVISORY','THRESHOLD')),
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_applications (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  captain_name text,
  game_rank integer CHECK (game_rank IS NULL OR (game_rank BETWEEN 15 AND 30)),
  timezone text,
  why_bom text,
  pb_experience text,
  previous_guilds text,
  activity_expectation text,
  extra text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','VERIFICATION','RECRUITER_REVIEW','WAITING_ON_APPLICANT','INTERVIEW','TRIAL','FINAL_REVIEW','ON_HOLD',
    'ACCEPTED','DECLINED','WITHDRAWN','CLOSED'
  )),
  waiting_on text NOT NULL DEFAULT 'APPLICANT' CHECK (waiting_on IN ('APPLICANT','RECRUITER','INTERVIEW','TRIAL','LEADERSHIP','NONE')),
  assigned_recruiter_id text,
  current_request text,
  ticket_channel_id text,
  status_message_id text,
  hours_message_id text,
  hours_attachment_url text,
  hours_submitted_at timestamptz,
  screening jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  first_recruiter_response_at timestamptz,
  last_applicant_activity_at timestamptz,
  last_recruiter_activity_at timestamptz,
  decision_by text,
  decision_reason text,
  cooldown_until timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recruitment_one_active_application_idx
  ON recruitment_applications(guild_id,user_id)
  WHERE status NOT IN ('ACCEPTED','DECLINED','WITHDRAWN','CLOSED');
CREATE INDEX IF NOT EXISTS recruitment_application_pipeline_idx
  ON recruitment_applications(guild_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS recruitment_application_ticket_idx
  ON recruitment_applications(guild_id,ticket_channel_id)
  WHERE ticket_channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS recruitment_application_assignee_idx
  ON recruitment_applications(guild_id,assigned_recruiter_id,status);

CREATE TABLE IF NOT EXISTS recruitment_application_events (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id text,
  visibility text NOT NULL DEFAULT 'INTERNAL' CHECK (visibility IN ('INTERNAL','APPLICANT')),
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recruitment_application_events_idx
  ON recruitment_application_events(application_id,created_at DESC);

CREATE TABLE IF NOT EXISTS recruitment_canned_responses (
  id uuid PRIMARY KEY,
  guild_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'GENERAL',
  body text NOT NULL,
  set_status text,
  set_waiting_on text,
  requested_item text,
  follow_up_hours integer CHECK (follow_up_hours IS NULL OR follow_up_hours BETWEEN 0 AND 720),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id,name)
);
CREATE INDEX IF NOT EXISTS recruitment_canned_response_sort_idx
  ON recruitment_canned_responses(guild_id,enabled,category,sort_order,name);

CREATE TABLE IF NOT EXISTS recruitment_interviews (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 240),
  interviewer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicant_timezone text,
  notes text,
  voice_channel_id text,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recruitment_interview_schedule_idx
  ON recruitment_interviews(status,scheduled_at);

CREATE TABLE IF NOT EXISTS recruitment_trials (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  user_id text NOT NULL,
  assigned_recruiter_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FINAL_REVIEW','ACCEPTED','DECLINED','WITHDRAWN')),
  midpoint_state text CHECK (midpoint_state IS NULL OR midpoint_state IN ('ON_TRACK','NEEDS_IMPROVEMENT','INSUFFICIENT_OBSERVATION')),
  midpoint_internal_note text,
  midpoint_applicant_message text,
  midpoint_completed_at timestamptz,
  midpoint_completed_by text,
  recommendation text CHECK (recommendation IS NULL OR recommendation IN ('ACCEPT','EXTEND','DECLINE')),
  recommendation_note text,
  recommendation_by text,
  recommendation_at timestamptz,
  final_decision text CHECK (final_decision IS NULL OR final_decision IN ('ACCEPT','EXTEND','DECLINE')),
  final_decision_by text,
  final_decision_reason text,
  final_decision_at timestamptz,
  extension_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recruitment_one_open_trial_idx
  ON recruitment_trials(application_id)
  WHERE status IN ('ACTIVE','FINAL_REVIEW');
CREATE INDEX IF NOT EXISTS recruitment_trial_pipeline_idx
  ON recruitment_trials(guild_id,status,ends_at);

CREATE TABLE IF NOT EXISTS recruitment_trial_feedback (
  id uuid PRIMARY KEY,
  trial_id uuid NOT NULL REFERENCES recruitment_trials(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  sentiment text NOT NULL CHECK (sentiment IN ('POSITIVE','NEUTRAL','CONCERN')),
  category text NOT NULL DEFAULT 'OTHER',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recruitment_trial_feedback_idx
  ON recruitment_trial_feedback(trial_id,created_at DESC);

CREATE TABLE IF NOT EXISTS recruitment_trial_votes (
  trial_id uuid NOT NULL REFERENCES recruitment_trials(id) ON DELETE CASCADE,
  voter_id text NOT NULL,
  vote text NOT NULL CHECK (vote IN ('ACCEPT','EXTEND','DECLINE','DISCUSS')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trial_id,voter_id)
);

CREATE TABLE IF NOT EXISTS recruitment_applicant_feedback (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('RECOMMEND','CONCERN')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id,author_id)
);
