# 개념 데이터 모델 (제안)

- Project(id, name, owner, scope, status)
- Workstream(id, project_id, name, owner)
- Task(id, workstream_id, title, owner, status, due_at, acceptance_criteria, estimated_hours)
- TaskContributor(task_id, user_id, role)
- Activity(id, source, external_id, actor_id, happened_at, evidence_uri, metadata_minimal)
- ActivityTaskLink(activity_id, task_id, confidence, status, confirmed_by)
- Artifact(id, task_id, uri, type, reviewed_at)
- EffortEntry(id, task_id, user_id, hours, kind, confirmed_by, period)
- TaskStateHistory(task_id, from_status, to_status, actor, timestamp, reason)
- AccessAudit(id, actor, action, resource_id, timestamp)

유의: Activity는 실행 흔적이고 Task는 책임있는 작업이며 EffortEntry는 별도 투입 기록이다. 외부 자료의 URL/메타데이터만으로 실시간 작업 시간을 확정하지 않는다.
