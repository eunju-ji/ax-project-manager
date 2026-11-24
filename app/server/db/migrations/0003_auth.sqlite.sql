CREATE TABLE users (
 id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 person_id TEXT, role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),
 status TEXT NOT NULL CHECK(status IN ('invited','active','disabled')),
 created_at INTEGER NOT NULL, last_login_at INTEGER
) STRICT;
CREATE TABLE sessions (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
 csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE ingest_tokens (
 hash TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER
) STRICT;
