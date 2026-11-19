CREATE TABLE workspaces (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
UNIQUE(id)) STRICT;
CREATE TABLE protected_contents (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
kind TEXT NOT NULL, value TEXT, purged_at TEXT, expires_at TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE TABLE persons (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
content_id TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE external_accounts (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
service TEXT NOT NULL, account_scope TEXT NOT NULL, external_id TEXT NOT NULL, person_id TEXT, is_bot INTEGER NOT NULL CHECK(is_bot IN (0,1)), UNIQUE(workspace_id,service,account_scope,external_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,person_id) REFERENCES persons(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE connectors (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
service TEXT NOT NULL, account_scope TEXT NOT NULL, stream TEXT NOT NULL,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE TABLE projects (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
owner_id TEXT, deputy_id TEXT, content_id TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,owner_id) REFERENCES persons(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,deputy_id) REFERENCES persons(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE project_collection_scopes (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
project_id TEXT NOT NULL, connector_id TEXT NOT NULL, scope TEXT NOT NULL, UNIQUE(workspace_id,project_id,connector_id,scope),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,connector_id) REFERENCES connectors(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE runs (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','cancelled')), processed_count INTEGER NOT NULL DEFAULT 0, failure_reason TEXT, worker_id TEXT, lease_until TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE TABLE sources (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
availability TEXT NOT NULL, checked_at TEXT, content_id TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE source_events (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
event_key TEXT NOT NULL, payload_digest TEXT NOT NULL, key_version INTEGER NOT NULL, source_id TEXT NOT NULL, occurred_at TEXT, collected_at TEXT NOT NULL, content_id TEXT, UNIQUE(workspace_id,event_key),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_id) REFERENCES sources(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE source_event_variants (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
event_key TEXT NOT NULL, payload_digest TEXT NOT NULL, source_event_id TEXT NOT NULL, content_id TEXT, UNIQUE(workspace_id,event_key,payload_digest),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_event_id) REFERENCES source_events(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE event_key_aliases (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
old_key TEXT NOT NULL, key_version INTEGER NOT NULL, source_event_id TEXT NOT NULL, UNIQUE(workspace_id,old_key,key_version),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_event_id) REFERENCES source_events(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE source_event_actors (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
source_event_id TEXT NOT NULL, external_account_id TEXT NOT NULL, UNIQUE(workspace_id,source_event_id,external_account_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_event_id) REFERENCES source_events(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,external_account_id) REFERENCES external_accounts(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE tasks (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
project_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('in_progress','completion_proposed','completed')), assignee_id TEXT, category TEXT NOT NULL, content_id TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,assignee_id) REFERENCES persons(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE worklogs (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
task_id TEXT NOT NULL, performer_person_id TEXT, performer_state TEXT NOT NULL CHECK(performer_state IN ('known','unknown')), performed_at_precision TEXT NOT NULL, performed_at TEXT, performed_on TEXT, content_id TEXT, CHECK((performer_state='known' AND performer_person_id IS NOT NULL) OR (performer_state='unknown' AND performer_person_id IS NULL)), CHECK((performed_at_precision='exact' AND performed_at IS NOT NULL AND performed_on IS NULL AND length(performed_at)=24 AND performed_at GLOB '????-??-??T??:??:??.???Z') OR (performed_at_precision='date' AND performed_at IS NULL AND performed_on GLOB '????-??-??' AND performed_on IS NOT NULL) OR (performed_at_precision='unknown' AND performed_at IS NULL AND performed_on IS NULL)),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,performer_person_id) REFERENCES persons(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE links (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
task_id TEXT, worklog_id TEXT, source_id TEXT, source_event_id TEXT, status TEXT NOT NULL, CHECK((task_id IS NULL)!=(worklog_id IS NULL)), CHECK((source_id IS NULL)!=(source_event_id IS NULL)),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,worklog_id) REFERENCES worklogs(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_id) REFERENCES sources(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_event_id) REFERENCES source_events(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE reviews (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
task_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','decided','superseded')), decision TEXT, content_id TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE review_basis_links (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
review_id TEXT NOT NULL, link_id TEXT NOT NULL, UNIQUE(workspace_id,review_id,link_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,review_id) REFERENCES reviews(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,link_id) REFERENCES links(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE suppressions (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
scope TEXT NOT NULL CHECK(scope IN ('source','event')), task_id TEXT, worklog_id TEXT, source_id TEXT, source_event_id TEXT, released_at TEXT, CHECK((task_id IS NULL)!=(worklog_id IS NULL)), CHECK((scope='source' AND source_id IS NOT NULL AND source_event_id IS NULL) OR (scope='event' AND source_event_id IS NOT NULL AND source_id IS NULL)),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,worklog_id) REFERENCES worklogs(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_id) REFERENCES sources(workspace_id,id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_event_id) REFERENCES source_events(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE change_log (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
entity TEXT NOT NULL, entity_id TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT NOT NULL, request_id TEXT NOT NULL, applied_at TEXT NOT NULL, result TEXT NOT NULL, content_id TEXT,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,content_id) REFERENCES protected_contents(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE access_audit (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
actor_id TEXT NOT NULL, action TEXT NOT NULL, applied_at TEXT NOT NULL,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE TABLE requests (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
request_id TEXT NOT NULL, payload_digest TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), UNIQUE(workspace_id,request_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE TABLE request_attempts (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
request_id TEXT NOT NULL, payload_digest TEXT NOT NULL, result TEXT NOT NULL, applied_at TEXT NOT NULL,
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE TABLE connector_cursors (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
connector_id TEXT NOT NULL, cursor TEXT NOT NULL, worker_id TEXT, lease_until TEXT, UNIQUE(workspace_id,connector_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,connector_id) REFERENCES connectors(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE processing_queue (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
source_event_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','processing','done')), attempts INTEGER NOT NULL DEFAULT 0, worker_id TEXT, lease_until TEXT, UNIQUE(workspace_id,source_event_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
FOREIGN KEY(workspace_id,source_event_id) REFERENCES source_events(workspace_id,id) ON DELETE RESTRICT) STRICT;
CREATE TABLE inbound_deliveries (workspace_id TEXT NOT NULL, id TEXT NOT NULL, display_key TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata)),
delivery_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('received','processed','failed')), attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(workspace_id,delivery_id),
PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,display_key),
FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT) STRICT;
CREATE UNIQUE INDEX suppression_source_id_task_id ON suppressions(workspace_id,scope,source_id,task_id) WHERE released_at IS NULL AND source_id IS NOT NULL AND task_id IS NOT NULL;
CREATE UNIQUE INDEX suppression_source_id_worklog_id ON suppressions(workspace_id,scope,source_id,worklog_id) WHERE released_at IS NULL AND source_id IS NOT NULL AND worklog_id IS NOT NULL;
CREATE UNIQUE INDEX suppression_source_event_id_task_id ON suppressions(workspace_id,scope,source_event_id,task_id) WHERE released_at IS NULL AND source_event_id IS NOT NULL AND task_id IS NOT NULL;
CREATE UNIQUE INDEX suppression_source_event_id_worklog_id ON suppressions(workspace_id,scope,source_event_id,worklog_id) WHERE released_at IS NULL AND source_event_id IS NOT NULL AND worklog_id IS NOT NULL;
CREATE INDEX idx_worklogs_performed_at_performed_on_performer_person_id ON worklogs(workspace_id,performed_at,performed_on,performer_person_id);
CREATE INDEX idx_tasks_project_id ON tasks(workspace_id,project_id);
CREATE INDEX idx_links_task_id ON links(workspace_id,task_id);
CREATE INDEX idx_links_worklog_id ON links(workspace_id,worklog_id);
CREATE INDEX idx_links_source_id ON links(workspace_id,source_id);
CREATE INDEX idx_links_source_event_id ON links(workspace_id,source_event_id);
CREATE INDEX idx_source_events_source_id_occurred_at ON source_events(workspace_id,source_id,occurred_at);
CREATE INDEX idx_reviews_status ON reviews(workspace_id,status);
CREATE INDEX idx_change_log_entity_entity_id_applied_at ON change_log(workspace_id,entity,entity_id,applied_at);
CREATE INDEX idx_processing_queue_status_lease_until ON processing_queue(workspace_id,status,lease_until);
CREATE TRIGGER immutable_source_events_UPDATE BEFORE UPDATE ON source_events BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_source_events_DELETE BEFORE DELETE ON source_events BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_source_event_variants_UPDATE BEFORE UPDATE ON source_event_variants BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_source_event_variants_DELETE BEFORE DELETE ON source_event_variants BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_event_key_aliases_UPDATE BEFORE UPDATE ON event_key_aliases BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_event_key_aliases_DELETE BEFORE DELETE ON event_key_aliases BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_change_log_UPDATE BEFORE UPDATE ON change_log BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_change_log_DELETE BEFORE DELETE ON change_log BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_access_audit_UPDATE BEFORE UPDATE ON access_audit BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_access_audit_DELETE BEFORE DELETE ON access_audit BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_request_attempts_UPDATE BEFORE UPDATE ON request_attempts BEGIN SELECT RAISE(ABORT,'append only'); END;
CREATE TRIGGER immutable_request_attempts_DELETE BEFORE DELETE ON request_attempts BEGIN SELECT RAISE(ABORT,'append only'); END;