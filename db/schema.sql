BEGIN;

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('student', 'rep')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    term TEXT NOT NULL
);

CREATE TABLE enrollments (
    user_id TEXT REFERENCES users(id),
    course_id INT REFERENCES courses(id),
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE rep_assignments (
    user_id TEXT REFERENCES users(id),
    course_id INT REFERENCES courses(id),
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE deadlines (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id),
    title TEXT NOT NULL,
    due_date DATE NOT NULL,
    weight_pct NUMERIC,
    type TEXT NOT NULL CHECK (type IN ('exam', 'midterm', 'quiz', 'assignment', 'project', 'other')),
    created_by TEXT REFERENCES users(id)
);

CREATE INDEX deadlines_course_due_date_idx ON deadlines (course_id, due_date);
CREATE INDEX deadlines_creator_course_idx ON deadlines (created_by, course_id);

CREATE TABLE checkins (
    time TIMESTAMPTZ NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    stress SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 10),
    sleep_hours NUMERIC,
    causes TEXT[] NOT NULL DEFAULT '{}',
    raw_text TEXT NOT NULL,
    PRIMARY KEY (user_id, time)
);

SELECT create_hypertable('checkins', by_range('time'));

-- The API writes these rows and their check-in together in one transaction.
CREATE TABLE checkin_course (
    time TIMESTAMPTZ NOT NULL,
    course_id INT NOT NULL REFERENCES courses(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    stress SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 10),
    PRIMARY KEY (user_id, time, course_id)
);

SELECT create_hypertable('checkin_course', by_range('time'));

CREATE INDEX checkin_course_course_time_idx ON checkin_course (course_id, time DESC);

-- Match the API's local-day replacement and count each student once for suppression.
CREATE MATERIALIZED VIEW daily_course_stress
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', time, timezone => 'America/Vancouver') AS day,
       course_id,
       avg(stress)::NUMERIC(4, 2) AS avg_stress,
       count(DISTINCT user_id) AS n_students
FROM checkin_course
GROUP BY day, course_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('daily_course_stress',
    start_offset => INTERVAL '120 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '15 minutes');

CREATE TABLE insights (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(id),
    week_start DATE NOT NULL,
    finding TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX insights_course_week_idx ON insights (course_id, week_start DESC);

COMMIT;
