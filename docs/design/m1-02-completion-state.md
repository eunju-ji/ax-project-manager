# M1-02 태스크 완료 상태 전이 계약

> 작성: AX-Lead, 2026-11-19 · 상태: **설계안 v2**(AX-Reviewer 검토 반영) · 기준: ADR-006, M1-01 §4

## 1. 상태
| 상태 | 의미 | 현재 UI 대응 |
|---|---|---|
| `in_progress` | 진행 중(기본값) | "아니요 · 진행 중" |
| `completion_proposed` | 담당자가 완료를 제안, 확정 대기 | 신규 표시 필요(UI 변경 승인 후) |
| `completed` | 확정됨 | "맞아요 · 완료" |

- LLM 제안은 상태가 아니다. `kind = completion` Review로만 존재한다.
- 프로젝트 전체 상태·진척률은 두지 않는다(L05).

## 2. 역할
- **담당자**: Task.assignee_id
- **확정자**: Project.owner_id(책임자) 또는 Project.deputy_id(대리)
- 대리는 책임자가 지정·해제한다. 지정·해제도 History에 남긴다.
- 역할은 **적용 시점**에 다시 확인한다. 판단 후 저장 전에 역할이 바뀌었으면 적용하지 않고 conflict로 처리한다.

## 3. 전이
| # | 전이 | 행위자 | 조건 | 기록 |
|---|---|---|---|---|
| T1 | in_progress → completion_proposed | 담당자 | 근거 Link 1개 이상 권장 | History |
| T2 | completion_proposed → completed | 확정자 | — | History, 확정자 = 담당자이면 `self_approved` |
| T3a | completion_proposed → in_progress (철회) | 담당자 | — | History |
| T3b | completion_proposed → in_progress (반려) | 확정자 | 사유 필수 | History |
| T4 | in_progress → completed | **담당자 = 확정자인 경우에만** | 제안 단계를 생략하는 자기 승인 예외 | History + `self_approved` |
| T5 | completed → in_progress (재개) | 담당자 또는 확정자 | 사유 필수 | History, 이전 완료 이력 보존 |
| T6 | (LLM) completion Review 생성 | system | 상태는 바꾸지 않는다 | Review만 |

- 담당자와 다른 책임자가 제안 없이 바로 완료하는 경로는 **두지 않는다**(ADR-006의 담당자 판단 단계 유지). 필요해지면 별도 정책 결정으로 다룬다.
- `self_approved`는 모든 확정 경로(T2·T4)에서 같은 기준(확정자 = 담당자)으로 기록한다. 담당자가 대리 확정자인 경우도 포함한다.
- 책임자와 대리가 모두 없으면 확정할 수 없다. Review는 열린 채로 남는다(자동 확정 금지).
- 재개(T5)나 철회·반려(T3)가 일어나면, 그 전에 열려 있던 completion Review는 `superseded`로 닫는다. 오래된 제안이 나중에 적용되지 않게 한다.
- 모든 전이는 `expected_version = Task.version`을 가진 변경 요청이며 M1-01 §4.2 불변식(비교·적용 단일 연산)을 따른다.

## 4. 화면 표시 규칙 (현재 UI 판단 흐름 유지)
- 판단 버튼을 누른 순간 = "판단함". 저장 결과가 오면 "저장됨" 또는 "저장 실패 · 다시 시도"로 바꾼다. 저장 성공 전에는 미확인 건수를 확정값처럼 바꾸지 않는다.
- 현재 UI(G0, 메모리 상태)는 기존 동작을 유지한다. 영속화는 M2 PoC에서 붙인다.

## 5. 테스트 시나리오
1. 담당자 제안 → 책임자 확정 → History 2건, `self_approved` 없음
2. 담당자 = 책임자: 직접 확정(T4) → `self_approved`
3. 담당자 = 대리: 제안 후 본인이 확정(T2) → `self_approved`
4. 담당자 ≠ 책임자: 책임자가 제안 없이 완료 시도 → 거부
5. 반려 사유 없음 → 거부, 사유 있음 → in_progress, 열린 Review superseded
6. 완료 후 재개 → in_progress, 이전 이력 보존, 남은 제안 superseded
7. 같은 버전에서 동시에 판단 2건 → 하나만 적용, 다른 하나는 conflict Review
8. 판단 후 저장 전에 대리 해제 → 적용 거부(conflict)
9. 책임자·대리 모두 부재 → 확정 불가, Review 열림
10. LLM 완료 제안 → 상태 변화 없음
