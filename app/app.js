"use strict";
const icon = (name, size = 17) => {
    const paths = {
        deliverable: '<rect x="2" y="3" width="20" height="5" rx="1.5"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="m8 14 3 3 5-5"/>',
        people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 21v-3a6 6 0 0 0-2-4.5"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
        arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>', back: '<path d="M19 12H5m7 7-7-7 7-7"/>',
        check: '<path d="m5 12 4 4L19 6"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
        chevron: '<path d="m6 9 6 6 6-6"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
        file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
        layers: '<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
        chart: '<path d="M4 20V5M4 20h17M8 16l4-5 4 2 4-7"/>',
        external: '<path d="M13 5h6v6M19 5l-9 9M19 13v6H5V5h6"/>',
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
        columns: '<path d="M3 4h8v16H3zM13 4h8v16h-8z"/>',
        sort: '<path d="m4 7 4-4 4 4M8 3v18M20 17l-4 4-4-4m0 4V3"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
        link: '<path d="M10 13a5 5 0 0 0 7 .3l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7-.3l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
        expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
        folder: '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/><path d="M2 10h20"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="m12 2 2 3 4-1 1 4 3 2-2 4 1 4-4 1-2 3-3-2-4 1-1-4-3-2 2-4-1-4 4-1z"/>',
        dot: '<circle cx="12" cy="12" r="4"/>',
        filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dot}</svg>`;
};
/// <reference path="icons.ts" />
const pilotMode = /(?:^|[?&])data=pilot(?:&|$)/.test(location.search || '');
const realMode = /(?:^|[?&])data=real(?:&|$)/.test(location.search || '');
const localPoc = pilotMode || realMode || /(?:^|[?&])data=local(?:&|$)/.test(location.search || '');
let pilotReviews = [];
let saveStatus = '';
let saving = false;
let sessionInfo = null;
const csrfHeaders = () => sessionInfo?.csrf ? { 'X-CSRF-Token': sessionInfo.csrf } : {};
let correctionData = { persons: [], tasks: [], worklogs: [], reviews: [] };
let correctionReady = false;
let correctionEditor = null;
const editable = () => localPoc && !pilotMode && !!sessionInfo && sessionInfo.role !== 'viewer';
function editButton(label, entity, op, id, project = '', task = '') { return editable() ? `<button data-action="correction" data-entity="${entity}" data-op="${op}" data-id="${esc(id)}" data-project="${esc(project)}" data-task="${esc(task)}">${label}</button>` : ''; }
function correctionForm() {
    const e = correctionEditor;
    if (!e)
        return '';
    const t = projects.flatMap(p => p.tasks).find(t => t.id === (e.entity === 'task' ? e.id : e.task)), w = t?.subtasks.find(w => w.id === e.id), fresh = e.op === 'create';
    const owner = (e.entity === 'task' ? correctionData.tasks : correctionData.worklogs).find(r => r.id === e.id)?.owner;
    const field = (name, label, value = '', type = 'text', limit = 120) => `<label>${label}<input name="${name}" type="${type}" maxlength="${limit}" value="${esc(value)}"></label>`;
    const select = (name, label, options, value = '') => `<label>${label}<select name="${name}">${options.map(o => `<option value="${esc(o.id)}" ${o.id === value ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;
    return '<form id="correction-form" class="correction-form">' + field('title', '제목', fresh ? '' : e.entity === 'task' ? t?.title : w?.title) + select('owner', '담당', correctionData.persons, owner) + (e.entity === 'task' ? select('project_id', '프로젝트', projects.map(p => ({ id: p.id, name: p.name })), e.project) + select('stage', '단계', [{ id: '', name: '—' }, ...stages.map(s => ({ id: s, name: s }))], fresh ? '' : t?.stage || '') + select('status', '상태', [{ id: '진행 중', name: '진행 중' }, { id: '완료', name: '완료' }], !fresh && t?.status === 'completed' ? '완료' : '진행 중') + field('completed_at', '완료일', fresh ? '' : M.day(t?.completedAt || ''), 'date') + field('start_date', '시작일', fresh ? '' : t?.startDate, 'date') + field('due_date', '마감일', fresh ? '' : t?.dueDate, 'date') + field('description', '설명', fresh ? '' : t?.description, 'text', 200) : select('task_id', '태스크', projects.flatMap(p => p.tasks.map(t => ({ id: t.id, name: p.name + ' / ' + t.title }))), e.task) + field('performed_at', '날짜', fresh ? M.day(AX_DATA.demoAsOf) : M.day(w?.performedAt || ''), 'date')) + '<button type="button" data-action="correction-save">저장</button><button type="button" data-action="correction-cancel">취소</button></form>';
}
async function sendCorrection(entity, op, id, fields) {
    if (!editable() || saving)
        return;
    saving = true;
    saveStatus = '저장 중';
    const table = entity === 'task' ? correctionData.tasks : entity === 'worklog' ? correctionData.worklogs : correctionData.reviews;
    try {
        const response = await fetch('/api/correction' + (realMode ? '?data=real' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ entity, op, id: op === 'create' ? undefined : id, version: op === 'create' ? 0 : table.find(r => r.id === id)?.version, ...(entity === 'review' ? { task_version: localVersions.get(completionReviews().find(r => r.id === id)?.taskId || '') } : {}), fields }) });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error === 'merge_target_referenced' ? '합쳐진 태스크가 참조하고 있어 변경할 수 없습니다.' : response.status === 409 ? '다른 변경이 먼저 저장됐습니다. 새로고침 후 다시 시도하세요.' : '저장하지 못했습니다. 입력을 확인하세요.');
        }
        await loadLocal();
        correctionEditor = null;
        saveStatus = '저장됨';
        if (entity === 'task' && op === 'remove')
            state.drawerTask = '';
    }
    catch (e) {
        saveStatus = e instanceof Error ? e.message : '저장 실패';
    }
    finally {
        saving = false;
        render();
    }
}
const localVersions = new Map();
const pendingDecisions = new Map();
const visibleTask = (t) => t.planSource !== 'reference' && t.merged_into == null;
const M = AXModel, projects = AX_DATA.projects.filter(p => !p.tasks.length || p.tasks.some(visibleTask)).map(p => ({ ...p, tasks: p.tasks.filter(visibleTask), files: p.files.filter(f => !p.tasks.some(t => t.id === f.taskId && !visibleTask(t))) }));
const THEMES = [{ id: 'linear', name: 'Linear', hint: '이슈 목록 · 속성 레일' }, { id: 'linear-notion', name: 'Linear · Notion 색상', hint: 'Linear 구조 · Notion 팔레트' }, { id: 'notion', name: 'Notion', hint: '문서 · 갤러리 · 타임라인' }, { id: 'attio', name: 'Attio', hint: '레코드 · 관계 속성' }, { id: 'airtable', name: 'Airtable', hint: '베이스 · Views · 그리드' }, { id: 'clickup', name: 'ClickUp', hint: '보드 · 담당자별 업무' }];
const pinKey = 'ax-project-pins:' + (realMode ? 'real' : pilotMode ? 'pilot' : localPoc ? 'local' : 'example');
function readPins() { try {
    const v = JSON.parse(localStorage.getItem(pinKey) || '[]');
    return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
}
catch {
    return new Set();
} }
function togglePin(id) { if (state.pins.has(id))
    state.pins.delete(id);
else
    state.pins.add(id); try {
    localStorage.setItem(pinKey, JSON.stringify([...state.pins]));
}
catch { } }
const stages = ['리서치', '기획', '프로토타입', '개발·테스트', '출시·운영'];
function cleanWbs(label) { return label.replace(/^\d+(?:\.\d+)*[.)]?\s+/, ''); }
function stageStates(p) { return stages.filter(stage => p.tasks.some(t => t.stage === stage)).map(stage => { const tasks = p.tasks.filter(t => t.stage === stage).map(effectiveTask); return { stage, status: tasks.every(t => t.status === 'completed') ? '완료' : tasks.some(t => t.status !== 'completed' && M.day(t.startDate || '') <= M.day(AX_DATA.demoAsOf) && (t.status === 'in_progress' || t.status === 'completion_proposed')) ? '진행' : '예정' }; }); }
function nextTask(p) { const tasks = p.tasks.map(effectiveTask).filter(t => t.status !== 'completed'); const started = (t) => !M.day(t.startDate || '') || M.day(t.startDate || '') <= M.day(AX_DATA.demoAsOf); return tasks.filter(t => started(t) && M.day(t.dueDate || '')).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || tasks.filter(t => !started(t)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || tasks.find(t => started(t)); }
function stageTag(stage) { return '<span class="stage-chip" title="' + esc(stage) + '" aria-label="' + esc(stage) + '">' + esc(stage) + '</span>'; }
function projectSignals(p) { const tasks = p.tasks.map(effectiveTask); return '<span class="project-signals">' + stages.filter(stage => p.tasks.some(t => t.stage === stage)).map(stageTag).join('') + ['late', 'unverified'].map(status => { const n = tasks.filter(t => M.taskState(t, AX_DATA.demoAsOf) === status).length; return n ? tag((status === 'late' ? '지연 ' : '확인 필요 ') + n, 'plan-status ' + status) : ''; }).join('') + '</span>'; }
function stageChip(t, p) { return t.stage ? stageTag(t.stage) : '—'; }
function projectAvatars(p) { const names = [...new Set([p.owner, ...people(p)].filter(Boolean))]; return '<span class="avatar-group" role="img" aria-label="' + esc(names.join(', ')) + '">' + names.slice(0, 5).map(avatar).join('') + (names.length > 5 ? '<small>+' + (names.length - 5) + '</small>' : '') + '</span>'; }
function pinButton(p) { return '<button class="project-pin project-glyph" data-action="project-pin" data-id="' + esc(p.id) + '" aria-pressed="' + state.pins.has(p.id) + '" title="' + (state.pins.has(p.id) ? '고정됨' : '고정') + '" aria-label="' + esc(p.name) + ' 고정">' + icon('folder', 16) + '</button>'; }
const state = { summaryOpen: false, summaryStatus: 'all', projectStatus: 'all', summaryLimit: 10, pins: readPins(), theme: 'linear-notion', query: '', topic: '전체', owner: '전체', week: 0, summaryUnit: 'week', project: '', openProjects: new Set(), tab: 'topic', expanded: new Set(), drawerTask: '', themeOpen: false, settingsOpen: false, integration: '', weekOwner: '전체', timelineMonth: 0, reviews: false, reviewed: new Set(), reviewAnswers: new Map(), taskStates: new Map(), modal: null, airView: 'grid', hideFields: false, grouped: false };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asset = (k) => AX_ASSETS[k] || `assets/${k}.png`;
const thumb = (p) => ({ ax: 'architecture', media: 'report', dashboard: 'dashboard', interview: 'document', pipeline: 'pipeline', taskmail: 'timeline', customer: 'wireframe' }[p.id] || 'document');
const fileThumb = (f, p) => /구조|아키텍처/.test(f.name) ? 'architecture' : /시안|화면/.test(f.name) ? 'dashboard' : /연결표|작업/.test(f.name) ? 'timeline' : thumb(p);
const avatar = (n) => `<span class="avatar avatar-${n === '김지현' ? 1 : n === '박성진' ? 2 : 3}" title="${esc(n)}" aria-hidden="true">${esc(n.slice(0, 1))}</span>`;
const date = (s) => s ? M.day(s).slice(5).replace('-', '.') : '—';
const fullDate = (s) => s ? M.day(s).replaceAll('-', '.') : '—';
const week = () => M.summaryRange(AX_DATA.demoAsOf, state.summaryUnit, state.week);
// Legacy data has no kind; operational data must explicitly be completion.
const completionReviews = () => AX_DATA.reviews.filter(r => (!r.kind || r.kind === 'completion') && projects.some(p => p.id === r.project && p.tasks.some(t => t.id === r.taskId)));
const reviewCount = (id) => (id ? 0 : pilotReviews.length) + completionReviews().filter(r => !state.reviewed.has(r.id) && (!id || r.project === id)).length;
const count = (p) => p.tasks.reduce((n, t) => n + t.subtasks.length, 0);
const people = (p) => M.owners([p]);
const tag = (s, c = '') => `<span class="tag ${c}">${esc(s)}</span>`;
const empty = (s, body) => `<div class="empty">${icon('search', 24)}<strong>${s}</strong><p>${body}</p></div>`;
function filtered() { return M.sortProjects(projects.filter(p => p.tasks.some(t => matchesStatus(t, state.projectStatus) && (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.owner === state.owner || t.subtasks.some(s => s.owner === state.owner))) && (!state.query || [p.name, p.desc, ...p.tasks.flatMap(t => [t.title, ...t.subtasks.map(s => s.title)])].join(' ').toLowerCase().includes(state.query.toLowerCase())))); }
function records() { return M.weekRecords(projects, week()).filter(r => state.weekOwner === '전체' || r.subtask.owner === state.weekOwner); }
const statusOptions = [['all', '전체'], ['active', '진행 중'], ['late', '지연'], ['unverified', '확인 필요'], ['upcoming', '예정'], ['completed', '완료'], ['undated', '일정 미정']];
function matchesStatus(t, value) { return value === 'all' || M.taskState(effectiveTask(t), AX_DATA.demoAsOf) === value; }
function projectFilterTasks() { return projects.flatMap(p => p.tasks).filter(t => (state.owner === '전체' || t.owner === state.owner || t.subtasks.some(s => s.owner === state.owner)) && (state.topic === '전체' || t.topic === state.topic)); }
function statusFilters(tasks, value, actionName) { return `<div class="status-filters" aria-label="${actionName === 'summary-status' ? '기간 태스크 상태' : '프로젝트 태스크 상태'}">${statusOptions.map(([key, label]) => `<button data-action="${actionName}" data-value="${key}" aria-pressed="${value === key}">${label} <span>${tasks.filter(t => matchesStatus(t, key)).length}</span></button>`).join('')}</div>`; }
function plannedLabel(t) { return t.startDate || t.dueDate ? `${planDate(t.startDate)} ~ ${t.dueDate ? planDate(t.dueDate) : '종료일 미정'}` : '일정 미정'; }
function actualLabel(t) { const days = t.subtasks.filter(s => s.performedAtPrecision !== 'unknown').map(s => M.day(s.performedAt)).filter(Boolean).sort(); return days.length ? `${planDate(days[0])} ~ ${planDate(effectiveTask(t).status === 'completed' && t.completedAt ? t.completedAt : days.at(-1))}` : '—'; }
function completedLabel(t) { return effectiveTask(t).status === 'completed' && t.completedAt ? fullDate(t.completedAt) : '—'; }
function adherence(t) { if (effectiveTask(t).status !== 'completed' || !M.day(t.completedAt || '') || !M.day(t.dueDate || ''))
    return '—'; const days = Math.round((Date.parse(M.day(t.completedAt)) - Date.parse(M.day(t.dueDate))) / 86400000); return days > 0 ? `기한 후 ${days}일` : '기한 내'; }
function periodTasks() { return M.periodTasks(projects, week(), state.weekOwner); }
function summaryTasks() {
    const all = periodTasks(), rows = all.filter(r => matchesStatus(r.task, state.summaryStatus)), shown = rows.slice(0, state.summaryLimit);
    let previous = '';
    return `<section class="summary-tasks" aria-labelledby="summary-tasks-heading"><div class="section-top"><h2 id="summary-tasks-heading"><button data-action="summary-toggle" data-source="heading" aria-expanded="${state.summaryOpen}" aria-controls="summary-tasks-panel"><span aria-hidden="true">${state.summaryOpen ? '⌄' : '›'}</span> 태스크 상세 <small>${rows.length}</small></button></h2></div><div id="summary-tasks-panel" ${state.summaryOpen ? '' : 'hidden'}>${statusFilters(all.map(r => r.task), state.summaryStatus, 'summary-status')}<div class="summary-table-scroll" tabindex="0" role="region" aria-label="기간 태스크 상세"><table><thead><tr>${['프로젝트 › 태스크', '담당', '단계', '상태', '계획 기간', '실제 작업 기간', '완료일', '기한 준수', '작업 내역'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${shown.map(({ project, task: t }) => { const group = previous !== project.id ? `<tr class="summary-project"><th scope="rowgroup" colspan="9">${esc(project.name)}</th></tr>` : ''; previous = project.id; return group + `<tr class="summary-task-row" role="button" tabindex="0" data-action="summary-task" data-task="${esc(t.id)}" aria-haspopup="dialog" aria-label="${esc(t.title)} 열기"><td><span class="summary-task-name">${esc(cleanWbs(t.title))}</span><span class="row-open">열기</span></td><td>${esc(t.owner || '미정')}</td><td>${stageChip(t, project)}</td><td>${planStatus(t, true)}</td><td>${esc(plannedLabel(t))}</td><td>${esc(actualLabel(t))}</td><td>${completedLabel(t)}</td><td>${adherence(t)}</td><td>${t.subtasks.filter(s => s.performedAtPrecision !== 'unknown' && M.day(s.performedAt) >= week().start && M.day(s.performedAt) <= week().end && (state.weekOwner === '전체' || s.owner === state.weekOwner)).length}</td></tr>`; }).join('') || '<tr><td colspan="9">태스크 없음</td></tr>'}</tbody></table></div>${rows.length > shown.length ? `<button class="summary-more" data-action="summary-more">${rows.length - shown.length}개 더 보기</button>` : ''}</div></section>`;
}
function header() {
    return `<header class="global-header"><button class="brand" data-action="home" aria-label="프로젝트 홈으로 돌아가기"><span class="brand-symbol">AX</span><strong>프로젝트 관리장</strong></button><span class="header-divider"></span><span class="breadcrumb">${icon('layers', 16)} AX팀 <span>/</span><b>프로젝트</b></span><div class="header-right">${sessionInfo && !sessionInfo.local && sessionInfo.role === 'admin' ? '<a href="/admin/users">사용자 관리</a>' : ''}${sessionInfo && !sessionInfo.local ? '<button data-action="logout">로그아웃</button>' : ''}${localPoc ? `<span class="demo-mark" role="status">${esc(saveStatus)}</span>` : ''}${realMode ? '' : `<span class="demo-mark"><i></i>${pilotMode ? 'AX-TF 공유 드라이브 기록' : '예시 데이터'}</span>`}<button class="review-trigger ${reviewCount() ? 'needs-review' : ''}" data-action="reviews" aria-haspopup="dialog">${icon('bell', 17)} 검토 필요 <b>${reviewCount()}</b></button><button class="settings-trigger icon-button" data-action="settings" aria-label="설정 및 서비스 연동" title="설정 및 서비스 연동">${icon('settings', 21)}</button></div></header>`;
}
function summaryLabel(range) { return state.summaryUnit === 'day' ? fullDate(range.start) : state.summaryUnit === 'month' ? range.start.slice(0, 7).replace('-', '년 ') + '월' : weekLabel(range); }
function weekly() {
    const rows = records(), owners = ['전체', ...M.owners(projects)];
    const offsets = [...new Set([state.week, ...Array.from({ length: 26 }, (_, i) => -i)])].sort((a, b) => b - a);
    const groups = projects.map(project => ({ project, rows: rows.filter(r => r.project.id === project.id) })).filter(g => g.rows.length);
    const distribution = M.categories.map((category, i) => ({ category, index: i, count: rows.filter(r => r.task.topic === category).length }));
    const visibleOwners = state.weekOwner === '전체' ? owners.slice(1) : [state.weekOwner];
    return `<section class="weekly-section" aria-labelledby="weekly-heading"><div class="section-top weekly-header"><div class="weekly-heading-date"><h2 id="weekly-heading">${state.summaryUnit === 'day' ? '하루의 업무' : state.summaryUnit === 'month' ? '한 달의 업무' : '한 주의 업무'}</h2><div class="summary-unit-tabs" aria-label="요약 기간">${[['day', '일간'], ['week', '주간'], ['month', '월간']].map(([unit, label]) => `<button data-action="summary-unit" data-value="${unit}" aria-pressed="${state.summaryUnit === unit}">${label}</button>`).join('')}</div><div class="week-control"><button class="icon-button" data-action="week" data-step="-1" aria-label="이전 ${state.summaryUnit === 'day' ? '날' : state.summaryUnit === 'month' ? '월' : '주'}">${icon('back', 15)}</button><label class="week-select"><span class="sr-only">요약 기간 선택</span><select id="weekSelect">${offsets.map(offset => { const w = M.summaryRange(AX_DATA.demoAsOf, state.summaryUnit, offset); return `<option value="${offset}" ${state.week === offset ? 'selected' : ''}>${summaryLabel(w)}</option>`; }).join('')}</select></label><button class="icon-button" data-action="week" data-step="1" aria-label="다음 ${state.summaryUnit === 'day' ? '날' : state.summaryUnit === 'month' ? '월' : '주'}" ${state.week === 0 ? 'disabled' : ''}>${icon('arrow', 15)}</button></div></div><div class="weekly-person-tabs" aria-label="주간 요약 담당자 선택">${owners.map(owner => `<button data-action="week-person" data-value="${esc(owner)}" class="${state.weekOwner === owner ? 'active' : ''}" aria-pressed="${state.weekOwner === owner}">${esc(owner)}</button>`).join('')}</div></div><div class="weekly-layout"><div class="week-summary"><span class="summary-caption">${icon('chart', 18)} ${state.weekOwner === '전체' ? '팀 전체' : esc(state.weekOwner)} 업무 요약</span><div class="summary-number"><span class="summary-main-icon">${icon('deliverable', 25)}</span><strong>${rows.length}</strong><span class="summary-unit">건의 작업 내역</span></div><div class="summary-meta"><span>${icon('folder', 18)}<b>${groups.length}</b>개 프로젝트</span><span>${icon('people', 18)}<b>${new Set(rows.map(r => r.subtask.owner).filter(Boolean)).size}</b>명 참여</span></div><button class="summary-task-count" data-action="summary-toggle" data-source="card" aria-expanded="${state.summaryOpen}" aria-controls="summary-tasks-panel">${icon('layers', 18)}<span>태스크 <strong>${new Set(rows.map(r => r.task.id)).size}</strong>개</span></button></div><div class="weekly-content"><div class="weekly-report" tabindex="0" role="region" aria-label="주간 업무 요약 내용">${groups.map(g => `<article class="weekly-project-summary"><header><button data-action="reveal" data-id="${g.project.id}">${esc(g.project.name)}</button><span>${g.rows.length}건</span></header><p class="weekly-prose">${workNarrative(g.rows)}</p><details class="weekly-details"><summary>작업 내역 ${g.rows.length}건 보기</summary><ul>${g.rows.map(r => `<li><button data-action="record" data-id="${g.project.id}" data-task="${r.task.id}"><strong>${esc(r.subtask.title)}</strong><span>${esc(r.subtask.owner)} · ${clockTime(r.subtask.performedAt)}</span></button></li>`).join('')}</ul></details></article>`).join('') || '<p class="no-activity">기록된 업무가 없습니다.</p>'}</div></div><aside class="weekly-visual"><div class="work-distribution"><h3>업무 유형별 작업 내역</h3><div class="distribution-bar" role="img" aria-label="${distribution.map(d => `${d.category} ${d.count}건`).join(', ')}">${distribution.filter(d => d.count).map(d => `<i class="category-${d.index}" style="width:${d.count / Math.max(rows.length, 1) * 100}%" title="${d.category} ${d.count}건"></i>`).join('')}</div><div class="distribution-legend">${distribution.filter(d => d.count).map(d => `<span><i class="record-dot category-${d.index}"></i>${d.category}<b>${d.count}</b></span>`).join('') || '<span>기록 없음</span>'}</div></div><div class="weekly-owner-table"><h3>담당자별 작업</h3><table><thead><tr><th>담당자</th><th>작업 내역</th><th>태스크</th><th>확인 요청</th></tr></thead><tbody>${visibleOwners.map(owner => { const mine = rows.filter(r => r.subtask.owner === owner), tasks = new Set(mine.map(r => r.task.id)), review = completionReviews().filter(r => !state.reviewed.has(r.id) && tasks.has(r.taskId)).length; return `<tr><th title="${esc(owner)}">${esc(owner)}</th><td><span class="owner-count">${mine.length}건<i style="width:${mine.length / Math.max(rows.length, 1) * 100}%"></i></span></td><td>${tasks.size}개</td><td class="${review ? 'has-review' : ''}">${review}건</td></tr>`; }).join('')}</tbody></table></div></aside></div>${summaryTasks()}</section>`;
}
function projectToolbar() { return `<div class="project-toolbar">${state.theme.startsWith('linear') ? '' : `<strong class="project-list-label">모든 프로젝트 <span>${projects.length}</span></strong>`}<div class="toolbar-filters"><label class="searchbox">${icon('search', 16)}<input id="homeSearch" aria-label="프로젝트·태스크 검색" placeholder="프로젝트·태스크 검색" value="${esc(state.query)}"><kbd>/</kbd></label><label class="select-filter"><span class="sr-only">담당자</span><select id="ownerFilter">${['전체', ...M.owners(projects)].map(x => `<option ${state.owner === x ? 'selected' : ''} value="${esc(x)}">${x === '전체' ? '모든 담당자' : esc(x)}</option>`).join('')}</select></label>${statusFilters(projectFilterTasks(), state.projectStatus, 'project-status')}</div></div>${state.theme.startsWith('linear') ? '' : `<div class="project-sort-note">${icon('sort', 14)} 최근 순</div>`}`; }
function projectButton(p, i, variant = 'row') { const open = state.project === p.id; return `<div role="button" tabindex="0" class="project-toggle ${variant} ${open ? 'selected' : ''}" data-action="project" data-id="${p.id}" aria-expanded="${open}" aria-controls="project-${p.id}"><span class="project-name-cell"><span class="expand-chevron">›</span>${pinButton(p)}<span><strong>${esc(p.name)}</strong><small>${esc(p.desc)}</small>${projectSignals(p)}</span></span><span class="people-cell">${people(p).map(avatar).join('')}</span><span class="number-cell">${p.tasks.length}</span><span class="number-cell secondary-field">${count(p)}</span><time>${date(M.latestTask(p))}</time><span class="secondary-field">${reviewCount(p.id) ? reviewCount(p.id) + '건' : '—'}</span></div>`; }
function expanded(p) { return state.project === p.id ? `<div class="inline-project" id="project-${p.id}">${projectDetail(p)}</div>` : ''; }
const tableHead = () => `<div class="table-labels"><span>프로젝트</span><span>참여자</span><span>태스크</span><span>작업 내역</span><span>최근 태스크</span><span>검토</span></div>`;
function linearList(list) { return timeline(list, false, true); }
function activityPeople() { return `<div class="heading-people" aria-label="담당자 빠른 필터">${M.owners(projects).map(o => `<button data-action="owner" data-value="${esc(o)}" aria-pressed="${state.owner === o}">${avatar(o)}<span>${esc(o)}</span></button>`).join('')}</div>`; }
function effectiveTask(t) { const value = state.taskStates.get(t.id); return { ...t, status: value ? value === '완료' ? 'completed' : 'in_progress' : t.status }; }
function dueLabel(t) { if (!M.day(t.dueDate || ''))
    return ''; const urgency = M.deadline(effectiveTask(t), AX_DATA.demoAsOf); return `<span class="due-label ${urgency}">마감 ${Number(t.dueDate.slice(5, 7))}/${Number(t.dueDate.slice(8))}${urgency === 'late' ? ' · 지연' : urgency === 'unverified' ? ' · 확인 필요' : ''}</span>`; }
function progressMetric(value) { return '<span class="progress-metric"><span class="progress-main"><strong class="progress-percent">' + value.percent + '%</strong><span class="progress-track"><i style="width:' + value.percent + '%"></i></span></span><small class="progress-detail">' + value.done + '/' + value.total + ' 완료</small></span>'; }
function projectInfo(p) { const progress = M.progress({ ...p, tasks: p.tasks.map(effectiveTask) }, AX_DATA.demoAsOf); return '<span class="project-info"><strong>' + esc(p.name) + '</strong><span class="project-description">' + esc(p.desc) + '</span><span class="project-metadata">태스크 ' + p.tasks.length + '개 · 작업 내역 ' + count(p) + '건</span>' + projectSignals(p) + progressMetric(progress) + '</span>'; }
document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target.matches('[role="button"][data-action]') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        action(target);
        return;
    }
    if (!target.matches('[data-action="heatmap-day"]'))
        return;
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step === undefined)
        return;
    event.preventDefault();
    const cells = Array.from(document.querySelectorAll('[data-action="heatmap-day"]'));
    const next = cells[Math.max(0, Math.min(cells.length - 1, cells.indexOf(target) + step))];
    target.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
});
function heatmap() {
    const today = M.day(AX_DATA.demoAsOf), start = M.weekRange(M.monthRange(today, -9).start, 0).start, weeks = Math.floor((Date.parse(today) - Date.parse(start)) / 604800000) + 1;
    const rows = M.weekRecords(projects, { start, end: today }).filter(r => state.owner === '전체' || r.subtask.owner === state.owner);
    const counts = new Map(), pairs = new Map();
    rows.forEach(r => { const d = M.day(r.subtask.performedAt); counts.set(d, (counts.get(d) || 0) + 1); if (!pairs.has(d))
        pairs.set(d, new Set()); pairs.get(d).add(JSON.stringify([r.subtask.owner, r.task.id])); });
    return `<section class="activity-heatmap" aria-label="작업 내역 히트맵"><div class="section-top"><h2>작업 내역</h2><span class="section-note">최근 10개월 · ${state.owner === '전체' ? '팀 전체' : esc(state.owner)}</span></div><div class="heatmap-scroll"><div class="heatmap-grid" style="grid-template-columns:24px repeat(${weeks},minmax(15px,1fr));min-width:${weeks * 20}px"><div class="heatmap-weekdays"><span></span>${['월', '화', '수', '목', '금', '토', '일'].map(d => `<span>${d}</span>`).join('')}</div>${Array.from({ length: weeks }, (_, w) => { const first = M.addDays(start, w * 7); return `<div class="heatmap-week"><span class="heatmap-month">${w === 0 || first.slice(5, 7) !== M.addDays(first, -7).slice(5, 7) ? Number(first.slice(5, 7)) + '월' : ''}</span>${Array.from({ length: 7 }, (_, d) => { const at = M.addDays(first, d), n = pairs.get(at)?.size || 0, label = Number(at.slice(5, 7)) + '월 ' + Number(at.slice(8)) + '일 · 태스크 ' + n + '개 · 기록 ' + (counts.get(at) || 0) + '건'; return at > today ? '<span class="heatmap-future"></span>' : `<button tabindex="${at === today ? 0 : -1}" class="heatmap-cell level-${n >= 5 ? 4 : n >= 3 ? 3 : n}" data-action="heatmap-day" data-value="${at}" title="${label}" aria-label="${label}"></button>`; }).join('')}</div>`; }).join('')}</div></div><div class="heatmap-legend">적음 ${['0', '1', '2', '3–4', '5+'].map((label, n) => `<span title="태스크 ${label}개"><i class="heatmap-cell level-${n}"></i></span>`).join('')} 많음</div></section>`;
}
function gallery(list) { return `<div class="project-gallery">${list.map(p => `<article class="gallery-project ${state.project === p.id ? 'is-open' : ''}"><div role="button" tabindex="0" class="gallery-toggle" data-action="project" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-controls="project-${p.id}"><div class="project-cover"><img src="${asset(thumb(p))}" alt="${esc(p.name)} 관련 자료"></div><div class="gallery-copy">${pinButton(p)}<h3>${esc(p.name)}</h3>${projectSignals(p)}<p>${esc(p.desc)}</p><dl><div><dt>참여자</dt><dd>${people(p).map(avatar).join('')}</dd></div><div><dt>최근 태스크</dt><dd>${fullDate(M.latestTask(p))}</dd></div></dl><footer><span>${p.tasks.length}개 태스크 · ${count(p)}건의 작업 내역</span><span class="expand-chevron">${state.project === p.id ? '⌄' : '›'}</span></footer></div></div>${expanded(p)}</article>`).join('')}</div>`; }
function attioList(list) { return `<div class="attio-directory"><div class="directory-caption">${icon('layers', 15)} 전체 레코드 <span>${list.length}</span><small>작업 생성일 ↓</small></div><div class="project-table">${tableHead()}${list.map((p, i) => `<article class="project-entry">${projectButton(p, i, 'record-row')}${expanded(p)}</article>`).join('')}</div><div class="directory-foot">${list.length}개 레코드 <span>${list.reduce((n, p) => n + count(p), 0)}건의 작업 내역</span></div></div>`; }
function airGrid(list) { const groups = state.grouped ? ['검토 필요', '검토 없음'] : ['전체']; return `<div class="air-grid ${state.hideFields ? 'hide-fields' : ''}"><div class="table-scroll"><div class="project-table">${tableHead()}${groups.map(label => { const rows = label === '전체' ? list : list.filter(p => label === '검토 필요' ? reviewCount(p.id) > 0 : reviewCount(p.id) === 0); return `${state.grouped ? `<div class="air-group">${label} · ${rows.length}개</div>` : ''}${rows.map((p, i) => `<article class="project-entry">${projectButton(p, i, 'grid-row')}${expanded(p)}</article>`).join('')}`; }).join('')}</div></div><div class="directory-foot">${list.length}개 프로젝트</div></div>`; }
function airBase(list) { return `<div class="air-base"><header class="air-base-title"><span class="air-base-icon">${icon('layers', 24)}</span><div><h3>AX 프로젝트 베이스</h3><p>프로젝트와 연결된 작업 내역</p></div><span class="air-base-label">${list.length}개 프로젝트</span></header><div class="air-table-tabs"><span>프로젝트</span><small>팀 공통 업무 기록</small></div><div class="air-base-layout"><nav class="air-views" aria-label="프로젝트 보기"><h4>Views</h4>${[['grid', 'grid', '그리드'], ['gallery', 'columns', '갤러리'], ['timeline', 'calendar', '타임라인']].map(([id, ico, label]) => `<button data-action="airview" data-value="${id}" class="${state.airView === id ? 'active' : ''}">${icon(ico, 15)} ${label}</button>`).join('')}<button data-action="clear">모든 프로젝트</button></nav><section class="air-canvas"><div class="air-tools"><strong>${state.airView === 'grid' ? '그리드' : state.airView === 'gallery' ? '갤러리' : '타임라인'} 보기</strong>${state.airView === 'grid' ? `<button data-action="fields" aria-pressed="${state.hideFields}">${icon('columns', 14)} ${state.hideFields ? '전체 필드' : '필드 숨기기'}</button><button data-action="group" aria-pressed="${state.grouped}">${icon('layers', 14)} ${state.grouped ? '그룹 해제' : '검토 여부로 묶기'}</button>` : ''}</div>${state.airView === 'grid' ? airGrid(list) : state.airView === 'gallery' ? gallery(list) : timeline(list, true)}</section></div></div>`; }
function clickupBoard(list) { return `<div class="resource-board">${list.map((p, i) => `<article class="board-project ${state.project === p.id ? 'is-open' : ''}"><div role="button" tabindex="0" class="board-toggle" data-action="project" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-controls="project-${p.id}"><div class="board-card-top">${pinButton(p)}</div><h3>${esc(p.name)}</h3>${projectSignals(p)}<p>${esc(p.desc)}</p><div class="board-activity"><strong>${count(p)}</strong><span>작업 내역</span><small>${p.tasks.length}개 태스크</small></div><footer><span>${people(p).map(avatar).join('')}</span><time>최근 태스크 ${date(M.latestTask(p))}</time><span class="expand-chevron">${state.project === p.id ? '⌄' : '›'}</span></footer></div>${expanded(p)}</article>`).join('')}</div>`; }
function timeline(list, inside = false, unified = false) {
    if (unified)
        return wbsTimeline(list);
    const month = M.monthRange(AX_DATA.demoAsOf, state.timelineMonth), days = month.days;
    const today = M.day(AX_DATA.demoAsOf), todayIndex = Math.round((Date.parse(today) - Date.parse(month.start)) / 86400000);
    const todayVisible = todayIndex >= 0 && todayIndex < days, todayLeft = (todayIndex + .5) / days * 100;
    const ticks = [1, 5, 10, 15, 20, 25, ...(days >= 30 ? [30] : [days])];
    return `<section class="timeline-section calendar-month ${inside ? 'inside' : ''} ${unified ? 'unified-timeline' : ''}" aria-label="프로젝트 타임라인"><div class="section-top ${unified ? 'unified-timeline-top' : ''}">${unified ? `<div class="project-sort-note">${icon('sort', 14)} 최근 순 · ${icon('calendar', 14)} 월간 타임라인</div>` : `<div><span class="eyebrow">PROJECT TIMELINE</span><h2>${icon('calendar', 16)} 프로젝트 타임라인</h2></div>`}<div class="month-controls"><button class="icon-button" data-action="timeline-month" data-step="-1" aria-label="이전 달">${icon('back', 14)}</button><span>${month.label}</span><button class="icon-button" data-action="timeline-month" data-step="1" aria-label="다음 달">${icon('arrow', 14)}</button></div></div><div class="timeline-scroll"><div class="timeline-grid"><div class="timeline-head"><span>프로젝트</span><div class="month-axis">${ticks.map(d => `<span style="left:${(d - 1) / days * 100}%">${d}일</span>`).join('')}${todayVisible ? `<b class="today-label" style="left:${todayLeft}%">오늘</b>` : ''}</div></div>${list.map((p, i) => {
        const schedules = unified ? p.tasks.map(taskSchedule).filter((r) => !!r) : [];
        const history = M.projectRange(p);
        const ranges = [...schedules, ...(history ? [history] : [])];
        const range = ranges.length ? { start: ranges.map(r => r.start).sort()[0], end: ranges.map(r => r.end).sort().at(-1) } : { start: today, end: today };
        const from = Math.round((Date.parse(range.start) - Date.parse(month.start)) / 86400000), to = Math.round((Date.parse(range.end) - Date.parse(month.start)) / 86400000);
        const left = Math.max(0, from) / days * 100, right = Math.min(days, to + 1) / days * 100;
        return `<div class="timeline-row"><button class="${unified ? 'project-toggle unified-toggle' : ''}" data-action="${unified ? 'project' : 'reveal'}" data-id="${p.id}" aria-expanded="${state.project === p.id}" ${unified ? `aria-controls="project-${p.id}"` : ''}>${unified ? projectInfo(p) : `<span class="project-glyph glyph-${i % 5}">${icon('folder', 13)}</span>${esc(p.name)}`}</button><div class="timeline-lane" style="--month-days:${days}">${todayVisible ? `<span class="today-line" style="left:${todayLeft}%" title="오늘 ${fullDate(today)}"></span>` : ''}${right > left ? `<button class="${unified ? 'timeline-summary' : 'timeline-bar'} bar-${i % 3}" style="left:${left}%;width:${right - left}%" data-action="${unified ? 'project' : 'reveal'}" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-label="${esc(p.name)} ${range.start}부터 ${range.end}까지"><span>${from < 0 ? `<b class="timeline-continuation" title="${fullDate(range.start)}부터 이어진 프로젝트">← ${date(range.start)}부터</b>` : ''}${esc(p.name)}</span><small>${count(p)}건</small></button>` : `<span class="timeline-outside">이 달의 기록 없음 · ${date(range.start)} — ${date(range.end)}</span>`}</div></div>${unified && state.project === p.id ? taskTimeline(p, month) + expanded(p) : ''}`;
    }).join('')}</div></div></section>`;
}
function projectOpen(p) { return state.project === p.id || state.openProjects.has(p.id); }
function plannedRange(p) { return M.plannedRange(p, AX_DATA.demoAsOf); }
function wbsGrid(month) {
    return '<div class="wbs-gridlines" aria-hidden="true">' + Array.from({ length: month.days }, (_, i) => { const d = new Date(M.addDays(month.start, i) + 'T00:00:00Z').getUTCDay(); return '<i class="' + (d === 0 || d === 6 ? 'weekend ' : '') + (d === 1 ? 'week-start' : '') + '"></i>'; }).join('') + '</div>';
}
function wbsTimeline(list) {
    const month = M.monthRange(AX_DATA.demoAsOf, state.timelineMonth), index = (Date.parse(M.day(AX_DATA.demoAsOf)) - Date.parse(month.start)) / 86400000;
    const today = index >= 0 && index < month.days ? '<span class="today-line" style="left:' + ((index + .5) / month.days * 100) + '%"></span>' : '';
    return '<section class="timeline-section calendar-month unified-timeline" aria-label="프로젝트 타임라인"><div class="section-top unified-timeline-top"><span class="project-sort-note">최근 순</span><div class="wbs-controls"><button data-action="projects-all">' + (list.every(projectOpen) ? '모두 접기' : '모두 펼치기') + '</button><div class="month-controls"><button class="icon-button" data-action="timeline-month" data-step="-1" aria-label="이전 달">' + icon('back', 14) + '</button><span>' + month.label + '</span><button class="icon-button" data-action="timeline-month" data-step="1" aria-label="다음 달">' + icon('arrow', 14) + '</button></div></div></div><div class="timeline-scroll"><div class="timeline-grid" style="--month-days:' + month.days + '"><div class="timeline-head"><div class="wbs-columns wbs-column-head"><span>이름</span><span>담당</span><span>기간</span><span>진척 / 상태</span></div><div class="month-axis">' + wbsGrid(month) + Array.from({ length: month.days }, (_, i) => '<span style="left:' + ((i + .5) / month.days * 100) + '%">' + (i + 1) + '</span>').join('') + (today ? '<b class="today-label" style="left:' + ((index + .5) / month.days * 100) + '%">오늘</b>' : '') + '</div></div>' + list.map((p, i) => {
        const open = projectOpen(p), range = plannedRange(p), progress = M.progress({ ...p, tasks: p.tasks.map(effectiveTask) }, AX_DATA.demoAsOf);
        const left = range ? Math.max(0, (Date.parse(range.start) - Date.parse(month.start)) / 86400000) / month.days * 100 : 0, right = range ? Math.min(month.days, (Date.parse(range.end) - Date.parse(month.start)) / 86400000 + 1) / month.days * 100 : 0;
        return '<div class="timeline-row wbs-project-row ' + (open ? 'is-open' : '') + '"><div role="button" tabindex="0" class="project-toggle unified-toggle wbs-columns" data-action="project" data-id="' + p.id + '" aria-expanded="' + open + '" aria-controls="project-' + p.id + '"><span class="wbs-project-name"><span class="expand-chevron">›</span>' + pinButton(p) + '<span><strong title="' + esc(p.name) + '">' + esc(p.name) + '</strong><small>태스크 ' + p.tasks.length + ' · 기록 ' + count(p) + '</small>' + projectSignals(p) + '</span></span><span class="wbs-owner">' + projectAvatars(p) + '</span><span class="wbs-period">' + (range ? scheduleLabel(range, true) : '일정 미정') + '</span><span class="wbs-progress">' + progressMetric(progress) + '</span></div><div class="timeline-lane">' + wbsGrid(month) + today + (right > left ? '<button title="계획 ' + planDate(range.start) + '–' + planDate(range.end) + ' · 진척 ' + progress.percent + '%" class="timeline-summary bar-' + i % 3 + '" data-action="project" data-id="' + p.id + '" aria-expanded="' + open + '" aria-label="' + esc(p.name) + ' ' + range.start + '부터 ' + range.end + '까지 진척 ' + progress.percent + '%" style="left:' + left + '%;width:' + (right - left) + '%"><i class="summary-fill" style="width:' + progress.percent + '%"></i></button>' : '<span class="timeline-outside">이 달의 일정 없음</span>') + '</div></div>' + (open ? '<div class="wbs-expanded" id="project-' + p.id + '"><p class="wbs-description">' + esc(p.desc) + '</p>' + taskTimeline(p, month) + editButton('태스크 추가', 'task', 'create', '', p.id) + (correctionEditor?.entity === 'task' && correctionEditor.op === 'create' && correctionEditor.project === p.id ? correctionForm() : '') + projectDetail(p) + '</div>' : '');
    }).join('') + '</div></div></section>';
}
function ganttSources(p) {
    return '<section class="project-detail gantt-resources" aria-label="' + esc(p.name) + ' 관련 자료"><div class="source-heading"><h3>관련 자료</h3>' + (p.files.length ? '<button data-action="project-files" data-id="' + p.id + '">자료 ' + p.files.length + '개 모두 보기 ' + icon('arrow', 14) + '</button>' : '<span>연결된 자료 없음</span>') + '</div><div class="source-scroll source-cards" role="region" tabindex="0" aria-label="관련 자료 목록">' + M.sortedSources(p.files).slice(0, 6).map(f => '<button class="source-row" data-action="file" data-id="' + p.id + '" data-file="' + f.id + '" ' + (f.previewable === false ? 'disabled' : '') + '>' + icon('file', 18) + '<span class="source-info"><strong>' + esc(f.name) + '</strong><small>' + esc(f.source) + ' · ' + date(f.createdAt) + '</small></span></button>').join('') + '</div>' + (reviewCount(p.id) ? '<button class="project-review-alert" data-action="reviews">' + icon('bell', 16) + ' 검토가 필요한 사항 ' + reviewCount(p.id) + '건 ' + icon('arrow', 14) + '</button>' : '') + '</section>';
}
function taskSchedule(t) { return M.taskSchedule(t, AX_DATA.demoAsOf); }
function scheduleLabel(range, project = false) { return planDate(range.start) + (range.openEnd ? (project ? " ~ 진행 중" : " ~ 종료일 미정") : "–" + planDate(range.end)); }
function taskTimeline(p, month) {
    const tasks = p.tasks.filter(t => matchesStatus(t, state.projectStatus) && (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.owner === state.owner || t.subtasks.some(s => s.owner === state.owner)));
    const planned = tasks.filter(t => !!t.wbsCode).sort((a, b) => (a.wbsCode || '').localeCompare(b.wbsCode || '', undefined, { numeric: true }) || a.id.localeCompare(b.id));
    const activity = tasks.filter(t => !t.wbsCode).sort((a, b) => (taskSchedule(a)?.start || a.createdAt || '').localeCompare(taskSchedule(b)?.start || b.createdAt || '') || a.id.localeCompare(b.id));
    const today = M.day(AX_DATA.demoAsOf), index = (Date.parse(today) - Date.parse(month.start)) / 86400000;
    const todayLine = index >= 0 && index < month.days ? `<span class="today-line" style="left:${(index + .5) / month.days * 100}%"></span>` : '';
    const rows = (items) => items.map(t => {
        const range = taskSchedule(t), open = linearTheme() ? state.drawerTask === t.id : state.expanded.has(t.id), planned = !!t.wbsCode;
        const status = M.taskState(effectiveTask(t), AX_DATA.demoAsOf);
        let lane = '<span class="timeline-outside">일정 미정</span>';
        if (range) {
            const from = (Date.parse(range.start) - Date.parse(month.start)) / 86400000, to = (Date.parse(range.end) - Date.parse(month.start)) / 86400000;
            const left = Math.max(0, from) / month.days * 100, right = Math.min(month.days, to + 1) / month.days * 100;
            lane = right > left ? `<button class="timeline-bar task-gantt-bar ${status} ${range.activity ? 'activity-bar' : range.openEnd ? 'is-open-ended' : ''}" style="left:${left}%;width:${right - left}%" data-action="task" data-task="${esc(t.id)}" aria-expanded="${open}" aria-controls="${linearTheme() ? 'task-drawer' : 'task-' + esc(t.id)}" title="${range.activity ? '작업' : '계획'} ${planDate(range.start)}–${planDate(range.end)}" aria-label="${esc(cleanWbs(t.title))} ${range.start}부터 ${range.end}까지"></button>` : `<span class="timeline-outside">이 달의 일정 없음 · ${range.openEnd ? scheduleLabel(range) : planDate(range.start) + ' — ' + planDate(range.end)}</span>`;
        }
        if (range?.invalid)
            lane = '<span class="timeline-outside">일정 확인 필요</span>';
        else if (range?.deadline)
            lane = range.start >= month.start && range.start <= month.end ? `<button class="deadline-marker" style="left:${((Date.parse(range.start) - Date.parse(month.start)) / 86400000 + .5) / month.days * 100}%" data-action="task" data-task="${esc(t.id)}" title="마감 ${planDate(range.start)}" aria-label="마감 ${planDate(range.start)}">◆</button>` : '<span class="timeline-outside">이 달의 일정 없음</span>';
        const ticks = [...new Set(t.subtasks.map(s => M.day(s.performedAt)).filter(d => d >= month.start && d <= month.end))].map(d => `<i class="task-work-tick" style="left:${((Date.parse(d) - Date.parse(month.start)) / 86400000 + .5) / month.days * 100}%" role="img" title="${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 · 작업 ${t.subtasks.filter(s => M.day(s.performedAt) === d).length}건" aria-label="${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 · 작업 ${t.subtasks.filter(s => M.day(s.performedAt) === d).length}건"></i>`).join('');
        const depth = 1;
        return `<div class="timeline-row task-gantt-row ${open ? 'is-expanded' : ''}" data-gantt-task="${esc(t.id)}"><button class="gantt-task-toggle wbs-columns" data-action="task" data-task="${esc(t.id)}" aria-expanded="${open}" aria-controls="${linearTheme() ? 'task-drawer' : 'task-' + esc(t.id)}"><span class="gantt-task-copy" style="--wbs-depth:${depth}" title="${esc([t.title, t.description].filter(Boolean).join('\n'))}">${linearTheme() ? '' : '<span class="expand-chevron">›</span>'}<strong>${esc(cleanWbs(t.title))}</strong></span><span class="wbs-owner">${avatar(t.owner || '미정')}<span>${esc(t.owner || '미정')}</span></span><span class="wbs-period">${range ? scheduleLabel(range) : '일정 미정'}</span><span>${planStatus(t, true)}<span class="row-open">열기</span></span></button><div class="timeline-lane">${wbsGrid(month)}${todayLine}${lane}${ticks}</div></div>${open && !linearTheme() ? '<div class="gantt-task-details">' + taskDetails(t, p) + '</div>' : ''}`;
    }).join('');
    const ordered = [...planned, ...activity];
    return stages.map(stage => { const children = ordered.filter(t => t.stage === stage); return children.length ? '<div class="timeline-row stage-group-row"><strong>' + esc(stage) + '</strong></div>' + rows(children) : ''; }).join('') + rows(ordered.filter(t => !t.stage));
}
const planDate = (s) => s ? Number(s.slice(5, 7)) + '/' + Number(s.slice(8, 10)) : '—';
function statusLegend() { return '<span class="work-record-legend">● 작업한 날</span>' + Object.entries({ completed: '완료', active: '진행 중', late: '지연', unverified: '확인 필요', upcoming: '예정', undated: '일정 미정' }).map(([status, label]) => tag(label, 'plan-status ' + status)).join(''); }
function planStatus(t, dot = false) { const status = M.taskState(effectiveTask(t), AX_DATA.demoAsOf), label = { completed: '완료', late: '지연', unverified: '확인 필요', active: '진행 중', upcoming: '예정', undated: '일정 미정' }[status]; return dot ? '<span class="task-status plan-status ' + status + '"><i class="status-dot" aria-hidden="true"></i>' + label + '</span>' : tag(label, 'plan-status ' + status); }
function taskItem(t, p) {
    const open = state.expanded.has(t.id), pending = taskReviews(t.id);
    return `<article class="task-item ${open ? 'is-expanded' : ''}"><button class="task-toggle" data-action="task" data-task="${t.id}" aria-expanded="${open}" aria-controls="task-${t.id}"><span class="expand-chevron">›</span><span class="task-copy"><strong>${esc(t.title)} ${t.planSource === 'wbs' ? planStatus(t) : workStatus(t.id) + ' ' + dueLabel(t)} ${pending.length ? `<span class="task-review-marker">${icon('bell', 12)} 검토 필요 ${pending.length}</span>` : ''}</strong><small>${t.planSource === 'wbs' ? esc(t.owner || '담당 미정') + ' · ' + planDate(t.startDate) + '~' + planDate(t.dueDate) : esc(t.summary)}</small></span><span class="task-output-count">${t.subtasks.length}건의 작업 내역</span><time>${date(t.createdAt)}</time></button>${open ? taskDetails(t, p) : ''}</article>`;
}
function taskDetails(t, p) { return `<div class="task-expanded" id="task-${t.id}">${taskReviewForm(t, p)}<p class="task-description">${esc(t.detail)}</p><div class="subtask-heading"><span>작업 내역</span><small>담당자 / 기록 시각 / 관련 자료</small></div><div class="subtask-list">${t.subtasks.map(s => `<article class="subtask-row"><span class="subtask-branch">└</span><div><strong>${esc(s.title)}</strong><div class="subtask-execution-log"><span class="execution-log-label">작업 내역</span><time datetime="${s.performedAt}">${clockTime(s.performedAt)}</time><p>${esc(s.summary)}</p></div>${artifactButton(p, t, s)}</div><span class="subtask-person">${avatar(s.owner)}${esc(s.owner)}</span></article>`).join('')}</div><div class="task-decision"><span>${icon('info', 14)} 결정사항</span><p>${esc(t.decision)}</p></div></div>`; }
function taskPanel(p) {
    const tasks = p.tasks.filter(t => matchesStatus(t, state.projectStatus) && (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.owner === state.owner || t.subtasks.some(s => s.owner === state.owner)));
    if (p.tasks.some(t => t.wbsCode)) {
        return `<section class="work-section"><div class="work-section-header"><h3>태스크 <span>${tasks.length}</span></h3></div><div class="work-body">${drawerTasks({ ...p, tasks }).map(t => taskItem(t, p)).join('')}</div></section>`;
    }
    return `<section class="work-section"><div class="work-section-header"><h3>태스크 <span>${tasks.length}</span></h3><div class="view-tabs" role="tablist" aria-label="작업 보기">${[['topic', '주제별'], ['episode', '에피소드별']].map(([id, title]) => `<button role="tab" aria-selected="${state.tab === id}" data-action="tab" data-value="${id}" class="${state.tab === id ? 'active' : ''}">${title}</button>`).join('')}</div></div><div class="work-body">${state.tab === 'topic' ? M.categories.map(c => { const ts = tasks.filter(t => t.topic === c); return ts.length ? `<section class="task-group"><h4><i class="record-dot category-${M.categories.indexOf(c)}"></i>${c}<span>${ts.length}</span></h4>${ts.map(t => taskItem(t, p)).join('')}</section>` : ''; }).join('') : executionEpisodes(p, tasks)}</div></section>`;
}
function sources(p) {
    const files = M.sortedSources(p.files), repos = p.files.filter(f => f.source === 'GitHub').length;
    return `<aside class="source-rail"><section class="sources"><div class="source-heading"><h3>관련 자료</h3><span>${p.files.length - repos}개 문서${repos ? ` · ${repos}개 저장소` : ''}</span></div><p class="source-caption">작업 내역의 관련 자료 포함 · 주제별 최신순</p><div class="source-scroll" data-project="${p.id}" tabindex="0" role="region" aria-label="관련 자료 목록">${M.categories.map(c => { const fs = files.filter(f => f.topic === c); return fs.length ? `<div class="source-group"><h4>${c}</h4>${fs.map(f => `<button class="source-row" data-action="file" data-id="${p.id}" data-file="${f.id}"${f.previewable === false ? ' disabled' : ''} aria-label="${esc(f.name)} 미리보기"><span class="source-kind ${f.source === 'GitHub' ? 'repository' : ''}">${f.source === 'GitHub' ? '저장소' : '문서'}</span><span class="source-info"><strong>${esc(f.name)}</strong><small>${esc(f.source)} · ${f.subtaskId ? '작업 내역 자료' : '프로젝트 자료'} · ${date(f.createdAt)}</small></span>${icon('external', 16)}</button>`).join('')}</div>` : ''; }).join('')}</div></section><section class="project-properties"><h3>프로젝트 속성</h3><dl><div><dt>참여자</dt><dd>${people(p).map(avatar).join('')}</dd></div><div><dt>최근 태스크</dt><dd>${fullDate(M.latestTask(p))}</dd></div><div><dt>작업 내역</dt><dd>${count(p)}건</dd></div></dl></section></aside>`;
}
function projectDetail(p) {
    if (state.theme.startsWith('linear'))
        return ganttSources(p);
    const pending = completionReviews().filter(r => r.project === p.id && !state.reviewed.has(r.id));
    return `<section class="project-detail" aria-label="${esc(p.name)} 내용"><header class="inline-detail-head"><div><span class="eyebrow">${p.id.toUpperCase()} / PROJECT</span><h2>${esc(p.name)}</h2><p>${esc(p.desc)}</p></div><button class="icon-button" data-action="project" data-id="${p.id}" aria-label="프로젝트 접기">${icon('x', 18)}</button></header>${pending.length ? `<div class="project-review-alert"><div>${icon('bell', 19)}<strong>검토가 필요한 사항 ${pending.length}건</strong></div>${pending.map(r => `<button data-action="review-task" data-id="${r.id}"><span>${esc(r.title)}</span>${icon('arrow', 15)}</button>`).join('')}</div>` : ''}${state.theme.startsWith('linear') ? '' : `<div class="project-local-timeline">${timeline([p], true)}</div>`}<div class="detail-layout ${state.theme.startsWith('linear') ? 'gantt-project-details' : ''}">${state.theme.startsWith('linear') ? '' : taskPanel(p)}${sources(p)}</div></section>`;
}
function projectArea() { const list = filtered(); const view = ({ linear: linearList, 'linear-notion': linearList, notion: gallery, attio: attioList, airtable: airBase, clickup: clickupBoard })[state.theme]; return projectToolbar() + '<div id="project-results">' + ['core', 'ops'].map(kind => { const rows = list.filter(p => (p.kind || 'core') === kind).sort((a, b) => Number(state.pins.has(b.id)) - Number(state.pins.has(a.id))); return '<section class="project-kind" data-kind="' + kind + '"><h2>' + (kind === 'ops' ? 'AX팀 운영' : '핵심 프로젝트') + ' <span>' + rows.length + '</span></h2><div ' + (kind === 'ops' ? 'id="ops-projects"' : '') + '>' + (rows.length ? view(rows) : '') + '</div></section>'; }).join('') + (list.length ? '' : empty('검색 결과가 없습니다.', '검색어나 필터를 바꿔 보세요.')) + '</div>' + heatmap(); }
function themePicker() { const mini = (id) => `<span class="theme-mini mini-${id}"><i></i><b></b><b></b><b></b></span>`; return `<div class="theme-picker-anchor">${state.themeOpen ? `<div class="theme-menu" role="dialog" aria-modal="true" aria-label="UI 테마 선택"><header><strong>화면 테마</strong><small>업무에 맞는 화면으로 살펴보세요</small></header>${THEMES.map(t => `<button class="theme-choice ${t.id === state.theme ? 'selected' : ''}" data-action="theme" data-value="${t.id}">${mini(t.id)}<span><strong>${t.name}</strong><small>${t.hint}</small></span>${t.id === state.theme ? icon('check', 15) : ''}</button>`).join('')}</div>` : ''}<button class="theme-launcher" data-action="themes" aria-expanded="${state.themeOpen}">${mini(state.theme)}<span><strong>${THEMES.find(t => t.id === state.theme).name}</strong><small>화면 테마</small></span>${icon('chevron', 14)}</button></div>`; }
function reviewDrawer() { return state.reviews ? `<div class="overlay-backdrop" data-action="close"></div><aside class="review-drawer" role="dialog" aria-modal="true" aria-label="검토함"><header><div><span class="eyebrow">REVIEW INBOX</span><h2>확인할 일 <span>${reviewCount()}</span></h2></div><button class="icon-button" data-action="close" aria-label="검토함 닫기">${icon('x', 18)}</button></header><p class="drawer-caption">각 태스크에서 근거를 보고, 끝난 일이 맞는지 확인해 주세요.</p><div class="drawer-scroll">${pilotReviewCards()}${completionReviews().map(r => `<article class="review-record">${tag(projects.find(p => p.id === r.project)?.name || '')}<h3>${esc(r.title)}</h3>${state.reviewed.has(r.id) ? tag('처리됨') + editButton('다시 판단', 'review', 'reopen', r.id) : ''}<p>${esc(r.desc)}</p><small>${esc(r.source)}</small><div><button class="primary" data-action="review-task" data-id="${r.id}">태스크에서 확인 ${icon('arrow', 13)}</button></div></article>`).join('') || empty('모두 확인했습니다.', '현재 남아 있는 확인 요청이 없습니다.')}</div><footer>${localPoc ? '저장된 판단을 다시 불러옵니다.' : '판단 결과는 이 화면에서만 유지됩니다.'}<button data-action="reset-reviews">초기화</button></footer></aside>` : ''; }
function folderBrowser(f) {
    const linked = [...new Map(projects.flatMap(p => p.files.filter(file => f.folderId ? file.folderId === f.folderId : file === f).map(file => ({ p, file }))).map(entry => [entry.file.id, entry])).values()];
    const entries = (f.folderId && AX_DATA.folders?.[f.folderId] || linked.map(({ file }) => ({ id: file.id, name: file.name, url: file.url, kind: '', linked: true }))).slice().sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
    return `<div class="folder-browser"><nav class="folder-breadcrumb" aria-label="자료 폴더 경로">${(f.folderPath || []).map(part => `<span>${esc(part)}</span>`).join('<span aria-hidden="true"> / </span>')}</nav><p>이 폴더의 파일 ${entries.length}개 · 연결된 자료 ${entries.filter(e => e.linked).length}개</p><ul class="folder-files" aria-label="같은 폴더의 자료">${entries.map(file => {
        const target = linked.find(e => e.file.id === file.id), current = file.id === f.id, content = `${icon('file', 16)}<span>${esc(file.name)}</span>${current ? '<small>현재 자료</small>' : ''}${file.linked ? '<small>연결됨</small>' : ''}`;
        return `<li class="${file.linked ? 'linked' : 'unlinked'}">${file.url ? `<a href="${esc(file.url)}" target="_blank" rel="noopener noreferrer"${current ? ' aria-current="true"' : ''}>${content}</a>` : target ? `<button data-action="folder-file" data-id="${esc(target.p.id)}" data-file="${esc(file.id)}" ${current ? 'aria-current="true"' : ''} ${target.file.previewable === false ? 'disabled' : ''}>${content}</button>` : file.url ? `<a href="${esc(file.url)}" target="_blank" rel="noopener noreferrer">${content}</a>` : `<span class="folder-unavailable">${content}</span>`}</li>`;
    }).join('')}</ul></div>`;
}
function modal() {
    if (!state.modal)
        return '';
    if (!state.modal.file && !state.modal.task && !state.modal.subtask) {
        const p = projects.find(p => p.id === state.modal.project);
        return '<div class="modal-wrap"><div class="overlay-backdrop" data-action="close"></div><section class="file-dialog" role="dialog" aria-modal="true" aria-label="프로젝트 자료 모두 보기"><header><strong>' + esc(p.name) + ' · 자료 ' + p.files.length + '개</strong><button class="icon-button" data-action="close" aria-label="미리보기 닫기">' + icon('x', 18) + '</button></header>' + sources(p) + '</section></div>';
    }
    const m = state.modal, p = projects.find(p => p.id === m.project);
    const f = p.files.find(f => f.id === m.file), t = p.tasks.find(t => t.id === m.task), s = t?.subtasks.find(s => s.id === m.subtask);
    const title = f?.name || s?.artifact || t?.title || p.name;
    if (f && ['commit', 'pull_request', 'issue', 'ai_chat'].includes(f.kind || ''))
        return `<div class="modal-wrap"><div class="overlay-backdrop" data-action="close"></div><section class="file-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><strong>${esc(title)}</strong><button class="icon-button" data-action="close" aria-label="닫기">${icon('x', 18)}</button></header><footer>${f.url ? `<a class="primary" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">원본 열기 ${icon('arrow', 13)}</a>` : ''}</footer></section></div>`;
    return `<div class="modal-wrap"><div class="overlay-backdrop" data-action="close"></div><section class="file-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)} 미리보기"><header><div><strong>${esc(title)}</strong><small>${s ? `${s.owner} · ${fullDate(s.performedAt)}` : f ? `${f.source} · ${f.topic}` : p.name}</small></div><button class="icon-button" data-action="close" aria-label="미리보기 닫기">${icon('x', 18)}</button></header>${f && (f.folderId || f.folderPath?.length) ? folderBrowser(f) : f?.url ? '' : `<img src="${asset(f ? fileThumb(f, p) : thumb(p))}" alt="${esc(title)} 관련 예시 이미지">`}<footer><p>${esc(s?.summary || f?.summary || t?.summary)}</p>${f && (f.folderUrl || f.url) ? `<a class="primary" href="${esc(f.folderUrl || f.url)}" target="_blank" rel="noopener noreferrer">Google Drive에서 폴더 열기 ${icon('arrow', 13)}</a>` : '<small>관련 내용을 보여 주는 예시 이미지입니다. 원본 서비스는 연결되지 않았습니다.</small>'}</footer></section></div>`;
}
function clockTime(value) { if (!value || !Number.isFinite(Date.parse(value)))
    return '시각 미상'; if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return ''; return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
function weekLabel(range) { const [y, m, d] = range.start.split('-').map(Number); return `${y}년 ${m}월 ${d}일 – ${Number(range.end.slice(5, 7)) !== m ? `${Number(range.end.slice(5, 7))}월 ` : ''}${Number(range.end.slice(8))}일`; }
function taskReviews(taskId) { return completionReviews().filter(r => r.taskId === taskId && !state.reviewed.has(r.id)); }
function artifactButton(p, t, s) { if (!s.sourceId)
    return ''; const disabled = p.files.find(f => f.id === s.sourceId)?.previewable === false; return `<button class="artifact-link" data-action="file" data-id="${p.id}" data-file="${s.sourceId}"${disabled ? ' disabled' : ''}>${icon('file', 14)}${esc(s.artifact)}${icon('external', 13)}</button>`; }
function executionEpisodes(p, tasks) {
    const entries = tasks.flatMap(task => task.subtasks.map(subtask => ({ task, subtask }))).filter(r => state.owner === '전체' || r.subtask.owner === state.owner).sort((a, b) => Date.parse(b.subtask.performedAt) - Date.parse(a.subtask.performedAt));
    const dates = [...new Set(entries.map(r => M.day(r.subtask.performedAt)))];
    return `<div class="execution-episodes"><p class="episode-description">태스크별 작업 내역을 최신순으로 모았습니다.</p>${dates.map(day => `<section class="execution-day"><h4>${day ? fullDate(day) : '실행 시각 미상'}</h4>${entries.filter(r => M.day(r.subtask.performedAt) === day).map(({ task, subtask: s }) => `<article class="execution-entry"><div class="execution-time"><time datetime="${s.performedAt}">${!s.performedAt ? '시각 미상' : clockTime(s.performedAt).split(' ').at(-1) || ''}</time><span>${esc(s.owner)}</span></div><div class="execution-body"><span class="execution-parent">${esc(task.title)} · ${task.id}</span><h4>${esc(s.title)}</h4><p>${esc(s.summary)}</p>${artifactButton(p, task, s)}<button class="execution-task-link" data-action="episode-task" data-task="${task.id}">태스크에서 보기 ${icon('arrow', 13)}</button></div></article>`).join('')}</section>`).join('') || empty('해당하는 작업 내역이 없습니다.', '선택한 담당자의 기록을 확인해 보세요.')}</div>`;
}
function settingsDialog() {
    if (!state.settingsOpen)
        return '';
    const integrations = [{ id: 'gws', name: 'Google Workspace', description: 'Drive 문서, Gmail, Sheets 등 업무 자료', initial: 'G' }, { id: 'github', name: 'GitHub', description: '저장소, 커밋, 이슈 등 개발 기록', initial: 'GH' }];
    return `<div class="overlay-backdrop" data-action="close"></div><section class="settings-dialog" role="dialog" aria-modal="true" aria-label="설정 및 서비스 연동"><header><div><span class="eyebrow">SETTINGS</span><h2>설정</h2></div><button class="icon-button" data-action="close" aria-label="설정 닫기">${icon('x', 20)}</button></header><div class="settings-body"><h3>서비스 연동</h3><p>프로젝트에 필요한 업무 자료를 연결하는 공간입니다.</p>${integrations.map(i => `<article class="integration-card"><div class="integration-logo">${i.initial}</div><div><h4>${i.name}</h4><p>${i.description}</p><small>연결되지 않음</small></div><button data-action="integration" data-value="${i.id}" aria-expanded="${state.integration === i.id}">설정 보기</button>${state.integration === i.id ? `<div class="integration-detail"><strong>${i.name} 연결 설정</strong><p>연동 화면을 준비 중입니다. 이 실행본에서는 계정 연결이나 외부 자료 조회를 수행하지 않습니다.</p></div>` : ''}</article>`).join('')}<div class="settings-note">연동할 서비스와 접근 범위를 확인한 뒤 연결할 수 있도록 구성할 예정입니다.</div></div></section>`;
}
function workNarrative(rows) { return esc(M.workSummary(rows, state.weekOwner)); }
function workStatus(taskId) { const value = state.taskStates.get(taskId); return value ? `<span class="task-status ${value === '완료' ? 'status-complete' : 'status-ongoing'}">${esc(value)}</span>` : ''; }
function taskReviewForm(t, p) { const reviews = completionReviews().filter(r => r.taskId === t.id); return reviews.length ? `<section class="task-review-form" aria-label="태스크 완료 여부 확인">${reviews.map(r => { const answer = state.reviewAnswers.get(r.id); return `<div data-review-id="${r.id}"><h4>${esc(r.title)}</h4><p>${esc(r.desc)}</p><small>${esc(r.source)}</small><strong class="review-question">이 태스크가 끝난 게 맞나요?</strong><div class="review-answer-buttons"><button data-action="review-answer" data-id="${r.id}" data-value="완료" aria-pressed="${answer === '완료'}">맞아요 · 완료</button><button data-action="review-answer" data-id="${r.id}" data-value="진행 중" aria-pressed="${answer === '진행 중'}">아니요 · 진행 중</button></div>${answer ? `<p class="review-result" role="status">${answer === '완료' ? '완료한 작업으로 표시했습니다.' : '아직 진행 중인 작업으로 표시했습니다.'} 판단을 바꾸려면 다시 선택하세요.</p>` : ''}</div>`; }).join('')}</section>` : ''; }
function openTaskReview(id) {
    const r = completionReviews().find(r => r.id === id);
    if (!r)
        return;
    reveal(r.project, r.taskId);
    const panel = document.querySelector(`[data-review-id="${id}"]`);
    panel?.scrollIntoView({ block: 'center', behavior: 'instant' });
    panel?.querySelector('button')?.focus();
}
function answerReview(id, value) {
    const r = completionReviews().find(r => r.id === id);
    if (!r || !['완료', '진행 중'].includes(value))
        return;
    if (localPoc) {
        void saveLocalReview(id, value);
        return;
    }
    state.reviewAnswers.set(id, value);
    state.taskStates.set(r.taskId, value);
    state.reviewed.add(id);
    render(`[data-action="review-answer"][data-id="${id}"][data-value="${value}"]`);
}
function linearTheme() { return state.theme === 'linear' || state.theme === 'linear-notion'; }
function drawerTasks(p) {
    return [...p.tasks.filter(t => !!t.wbsCode).sort((a, b) => (a.wbsCode || '').localeCompare(b.wbsCode || '', undefined, { numeric: true }) || a.id.localeCompare(b.id)),
        ...p.tasks.filter(t => !t.wbsCode).sort((a, b) => (taskSchedule(a)?.start || a.createdAt || '').localeCompare(taskSchedule(b)?.start || b.createdAt || '') || a.id.localeCompare(b.id))];
}
function drawerTime(value) { return value && !/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? clockTime(value).split(' ').at(-1) : ''; }
function taskDrawer() {
    if (!state.drawerTask)
        return '';
    const p = projects.find(p => p.tasks.some(t => t.id === state.drawerTask));
    const t = p?.tasks.find(t => t.id === state.drawerTask);
    if (!p || !t)
        return '';
    const tasks = drawerTasks(p), index = tasks.indexOf(t), status = M.taskState(effectiveTask(t), AX_DATA.demoAsOf);
    const entries = [...t.subtasks].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
    const days = [...new Set(entries.map(s => M.day(s.performedAt)))];
    const files = [...new Set(entries.map(s => s.sourceId).filter(Boolean))].map(id => p.files.find(f => f.id === id)).filter((f) => Boolean(f));
    const property = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    return `<div class="task-drawer-backdrop" data-action="drawer-close"></div><section class="task-drawer" id="task-drawer" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title"><header><div class="task-drawer-toolbar"><small>${[p.name, t.stage].filter(Boolean).map(esc).join(' / ')}</small><nav aria-label="태스크 이동"><button class="icon-button" data-action="drawer-step" data-step="-1" aria-label="이전 태스크" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" data-action="drawer-step" data-step="1" aria-label="다음 태스크" ${index === tasks.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-button" data-action="drawer-close" aria-label="태스크 닫기">${icon('x', 18)}</button></nav></div><h2 id="task-drawer-title" tabindex="-1">${esc(cleanWbs(t.title))}</h2>${t.description ? `<p class="task-description">${esc(t.description)}</p>` : ''}</header><div class="task-drawer-body">${editButton('수정', 'task', 'update', t.id, p.id)}${editButton('삭제', 'task', 'remove', t.id, p.id)}${correctionEditor ? correctionForm() : ''}${editable() ? '<p class="correction-status">' + esc(saveStatus) + '</p>' : ''}<dl class="task-properties">${property('상태', planStatus(t))}${t.stage ? property('단계', stageChip(t, p)) : ''}${t.wbsCode ? property('WBS 번호', esc(t.wbsCode)) : ''}${t.wbsGroups?.length ? property('계획 문서 묶음', esc(t.wbsGroups.map(cleanWbs).join(' / '))) : ''}${property('담당', avatar(t.owner || '미정') + ' ' + esc(t.owner || '미정'))}${property('계획 기간', esc(plannedLabel(t)))}${property('실제 작업 기간', esc(actualLabel(t)))}${property('완료일', esc(completedLabel(t)))}${property('기한 준수', esc(adherence(t)))}${t.completionBasis ? property('완료 근거', esc(t.completionBasis)) : ''}${property('산출물', esc([...new Set([t.summary, t.detail].map(v => v?.replace(/^산출물:\s*/, '').trim()).filter(Boolean))].join('\n') || '등록된 산출물이 없습니다.'))}</dl>${status === 'unverified' ? '<p class="drawer-notice">종료일이 지났지만 작업 기록·완료 근거를 찾지 못했습니다</p>' : ''}${taskReviewForm(t, p)}<section class="drawer-history">${editButton('작업 추가', 'worklog', 'create', '', p.id, t.id)}<h3>작업 내역 <small>${entries.length}건</small></h3>${days.map(day => `<section class="drawer-day"><h4>${day ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(day + 'T00:00:00+09:00')) : '날짜 미상'}</h4>${entries.filter(s => M.day(s.performedAt) === day).map(s => `<article class="drawer-entry"><div class="drawer-entry-meta"><time datetime="${esc(s.performedAt)}">${drawerTime(s.performedAt) || '시각 미상'}</time><span>${avatar(s.owner)} ${esc(s.owner)}</span></div><strong>${esc(s.title)}</strong><p>${esc(s.summary)}</p>${editButton('수정', 'worklog', 'update', s.id, p.id, t.id)}${editButton('옮기기', 'worklog', 'update', s.id, p.id, t.id)}${editButton('삭제', 'worklog', 'remove', s.id, p.id, t.id)}${artifactButton(p, t, s)}</article>`).join('')}</section>`).join('') || '<p class="drawer-empty">아직 작업 내역이 없습니다.</p>'}</section><section class="drawer-files"><h3>관련 자료 <small>${files.length}개</small></h3>${files.map(f => `<button class="artifact-link" data-action="file" data-id="${esc(p.id)}" data-file="${esc(f.id)}" ${f.previewable === false ? 'disabled' : ''}>${icon('file', 16)}${esc(f.name)}${icon('external', 13)}</button>`).join('') || '<p class="drawer-empty">연결된 자료가 없습니다.</p>'}</section></div></section>`;
}
let drawerReturnTask = '';
let drawerReturnSummary = false;
let drawerClosing = false;
function closeTaskDrawer() {
    if (drawerClosing)
        return;
    const finish = () => {
        drawerClosing = false;
        state.drawerTask = '';
        correctionEditor = null;
        render();
        document.querySelector(`${drawerReturnSummary ? '.summary-task-row' : '.gantt-task-toggle'}[data-task="${CSS.escape(drawerReturnTask)}"]`)?.focus();
    };
    const drawer = document.querySelector('.task-drawer');
    if (drawer && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawerClosing = true;
        drawer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(finish, finish);
    }
    else
        finish();
}
let returnFocus = null;
function render(focusKey = '') {
    const oldSources = document.querySelector('.source-scroll'), oldSourceProject = oldSources?.dataset.project, oldSourceTop = oldSources?.scrollTop ?? 0;
    const input = document.activeElement, position = input?.id === 'homeSearch' ? input.selectionStart : null;
    document.body.dataset.theme = state.theme === 'linear-notion' ? 'linear' : state.theme;
    document.body.dataset.palette = state.theme === 'linear-notion' ? 'notion' : '';
    document.getElementById('app').innerHTML = header() + `<main id="main"><div class="page-heading"><div><div class="eyebrow">AX팀 업무 기록</div><h1>팀의 일, 한눈에.</h1><p>누가 어떤 일을 했는지, 프로젝트에서 작업 내역까지.</p></div><div class="heading-right">${activityPeople()}<span class="page-date">${icon('calendar', 14)} ${fullDate(AX_DATA.demoAsOf)} 기준</span></div></div>${weekly()}<section class="projects-section">${projectArea()}</section><footer class="page-footer"><span>AX 프로젝트 관리장</span>${realMode ? '' : `<small>${esc(AX_DATA.demoNotice)}</small>`}</footer></main>` + themePicker() + settingsDialog() + reviewDrawer() + taskDrawer() + modal();
    document.querySelector('.folder-files [aria-current=true]')?.scrollIntoView({ block: 'nearest' });
    const newSources = document.querySelector('.source-scroll');
    if (newSources && newSources.dataset.project === oldSourceProject)
        newSources.scrollTop = oldSourceTop;
    const overlay = Boolean(state.reviews || state.modal || state.settingsOpen);
    document.querySelector('.task-drawer')?.toggleAttribute('inert', Boolean(state.modal));
    const focusBlocked = overlay || state.themeOpen;
    document.querySelector('.skip-link')?.toggleAttribute('inert', focusBlocked);
    document.querySelector('.global-header')?.toggleAttribute('inert', focusBlocked);
    document.querySelector('main')?.toggleAttribute('inert', focusBlocked);
    document.querySelector('.theme-launcher')?.toggleAttribute('inert', state.themeOpen);
    document.querySelector('.theme-picker-anchor')?.toggleAttribute('inert', overlay);
    document.body.classList.toggle('overlay-open', overlay || Boolean(state.drawerTask));
    if (focusKey === 'homeSearch') {
        const e = document.getElementById('homeSearch');
        e.focus();
        if (position !== null)
            e.setSelectionRange(position, position);
    }
    else if (focusKey)
        document.querySelector(focusKey)?.focus();
}
function reveal(id, task) {
    state.settingsOpen = false;
    state.project = id;
    state.tab = 'topic';
    state.reviews = false;
    state.modal = null;
    state.topic = '전체';
    state.owner = '전체';
    state.query = '';
    if (task) {
        if (linearTheme()) {
            drawerReturnTask = task;
            state.drawerTask = task;
        }
        else
            state.expanded.add(task);
    }
    if (state.airView === 'timeline')
        state.airView = 'grid';
    history.pushState(null, '', `#project/${id}`);
    render(state.drawerTask ? '#task-drawer-title' : '');
    document.getElementById(`project-${id}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function close() {
    if (state.drawerTask && !state.modal && !state.reviews && !state.settingsOpen) {
        closeTaskDrawer();
        return;
    }
    state.settingsOpen = false;
    state.modal = null;
    state.reviews = false;
    state.themeOpen = false;
    render();
    if (returnFocus) {
        const selector = returnFocus.tagName + Array.from(returnFocus.classList).map(c => `.${CSS.escape(c)}`).join('') + Object.entries(returnFocus.dataset).map(([key, value]) => `[data-${key}="${CSS.escape(value)}"]`).join('');
        document.querySelector(selector)?.focus();
    }
}
function action(el) {
    const a = el.dataset.action, id = el.dataset.id || '', v = el.dataset.value || '';
    if (a === 'task' || a === 'summary-task' || a === 'drawer-step')
        correctionEditor = null;
    if (a === 'pilot-answer') {
        void savePilotReview(id, v);
        return;
    }
    if (a === 'home') {
        state.projectStatus = 'all';
        state.project = '';
        state.topic = '전체';
        state.owner = '전체';
        state.query = '';
        state.modal = null;
        state.reviews = false;
        history.pushState(null, '', '#home');
        render();
        window.scrollTo({ top: 0, behavior: 'instant' });
        return;
    }
    if (a === 'project-pin') {
        togglePin(id);
        render();
        return;
    }
    if (a === 'correction-cancel') {
        correctionEditor = null;
        render();
        return;
    }
    if (a === 'correction-save') {
        const form = document.querySelector('#correction-form');
        if (!form || !correctionEditor)
            return;
        const fields = {};
        for (const input of Array.from(form.querySelectorAll('input,select'))) {
            if (correctionEditor.entity === 'worklog' && correctionEditor.op === 'update' && input instanceof HTMLInputElement && input.name === 'performed_at' && input.value === input.defaultValue)
                continue;
            fields[input.name] = input.value || null;
        }
        const e = correctionEditor;
        void sendCorrection(e.entity, e.op, e.id, fields);
        return;
    }
    if (a === 'correction') {
        if (!editable())
            return;
        const entity = el.dataset.entity, op = el.dataset.op, id = el.dataset.id;
        if (op === 'remove') {
            if (window.confirm('삭제하시겠습니까?'))
                void sendCorrection(entity, op, id, {});
            return;
        }
        if (op === 'reopen') {
            void sendCorrection(entity, op, id, {});
            return;
        }
        correctionEditor = { entity, op, id, project: el.dataset.project || '', task: el.dataset.task || '' };
        if (entity === 'task' && op === 'create')
            state.drawerTask = '';
        render('#correction-form input');
        return;
    }
    if (a === 'summary-toggle') {
        state.summaryOpen = !state.summaryOpen;
        render('[data-action="summary-toggle"][data-source="' + (el.dataset.source || 'card') + '"]');
        return;
    }
    if (a === 'projects-all') {
        const list = filtered(), close = list.every(projectOpen);
        state.project = '';
        state.openProjects.clear();
        if (!close)
            list.forEach(p => state.openProjects.add(p.id));
        render();
        return;
    }
    if (a === 'project-files') {
        state.modal = { project: id };
        render();
        return;
    }
    if (a === 'project') {
        if (state.openProjects.has(id)) {
            state.openProjects.delete(id);
            state.project = '';
        }
        else
            state.project = state.project === id ? '' : id;
        state.tab = 'topic';
        history.pushState(null, '', state.project ? `#project/${id}` : '#home');
        render(`[data-action="project"][data-id="${id}"]`);
        return;
    }
    if (a === 'record' || a === 'reveal') {
        reveal(id, el.dataset.task);
        return;
    }
    if (a === 'drawer-close') {
        closeTaskDrawer();
        return;
    }
    if (a === 'drawer-step') {
        const p = projects.find(p => p.tasks.some(t => t.id === state.drawerTask));
        if (p) {
            const tasks = drawerTasks(p), index = tasks.findIndex(t => t.id === state.drawerTask);
            state.drawerTask = tasks[index + Number(el.dataset.step)]?.id || state.drawerTask;
            render('#task-drawer-title');
        }
        return;
    }
    if (a === 'summary-task') {
        drawerReturnSummary = true;
        drawerReturnTask = el.dataset.task;
        state.drawerTask = el.dataset.task;
        render('#task-drawer-title');
        return;
    }
    if (a === 'summary-more') {
        state.summaryLimit += 10;
        render();
        return;
    }
    if (a === 'summary-status' || a === 'project-status') {
        if (a === 'summary-status') {
            state.summaryStatus = v;
            state.summaryLimit = 10;
        }
        else
            state.projectStatus = v;
        render('[data-action="' + a + '"][data-value="' + v + '"]');
        return;
    }
    if (a === 'task') {
        drawerReturnSummary = false;
        const t = el.dataset.task;
        if (linearTheme()) {
            drawerReturnTask = t;
            state.drawerTask = t;
            render('#task-drawer-title');
            return;
        }
        state.expanded.has(t) ? state.expanded.delete(t) : state.expanded.add(t);
        render(`[data-action="task"][data-task="${t}"]`);
        return;
    }
    if (a === 'settings') {
        returnFocus = el;
        state.settingsOpen = true;
        state.reviews = false;
        state.themeOpen = false;
        state.modal = null;
        render('.settings-dialog .icon-button');
        return;
    }
    if (a === 'integration') {
        state.integration = state.integration === v ? '' : v;
        render(`[data-action="integration"][data-value="${v}"]`);
        return;
    }
    if (a === 'summary-unit') {
        state.summaryUnit = v;
        state.week = 0;
        state.summaryLimit = 10;
        render(`[data-action="summary-unit"][data-value="${v}"]`);
        return;
    }
    if (a === 'heatmap-day') {
        state.summaryUnit = 'day';
        state.week = Math.round((Date.parse(v) - Date.parse(M.day(AX_DATA.demoAsOf))) / 86400000);
        state.weekOwner = state.owner;
        render('#weekSelect');
        document.querySelector('.weekly-section')?.scrollIntoView({ block: 'start' });
        return;
    }
    if (a === 'week-person') {
        state.weekOwner = v;
        render(`[data-action="week-person"][data-value="${v}"]`);
        return;
    }
    if (a === 'episode-task') {
        state.tab = 'topic';
        if (linearTheme()) {
            drawerReturnTask = el.dataset.task;
            state.drawerTask = el.dataset.task;
            render('#task-drawer-title');
            return;
        }
        state.expanded.add(el.dataset.task);
        render(`[data-action="task"][data-task="${el.dataset.task}"]`);
        return;
    }
    if (a === 'timeline-month') {
        state.timelineMonth += Number(el.dataset.step);
        render(`[data-action="timeline-month"][data-step="${el.dataset.step}"]`);
        return;
    }
    if (a === 'review-task') {
        openTaskReview(id);
        return;
    }
    if (a === 'review-answer') {
        answerReview(id, v);
        return;
    }
    if (a === 'topic')
        state.topic = v;
    if (a === 'owner')
        state.owner = state.owner === v ? '전체' : v;
    if (a === 'week')
        state.week = Math.min(0, state.week + Number(el.dataset.step));
    if (a === 'tab')
        state.tab = v;
    if (a === 'themes') {
        returnFocus = el;
        state.themeOpen = true;
        render('.theme-menu .theme-choice');
        return;
    }
    if (a === 'theme') {
        state.theme = v;
        state.themeOpen = false;
        try {
            localStorage.setItem('ax_theme', v);
        }
        catch { }
    }
    if (a === 'airview')
        state.airView = v;
    if (a === 'fields')
        state.hideFields = !state.hideFields;
    if (a === 'group')
        state.grouped = !state.grouped;
    if (a === 'reviews') {
        returnFocus = el;
        state.reviews = true;
        state.themeOpen = false;
        render('.review-drawer .icon-button');
        return;
    }
    if (a === 'reset-reviews') {
        if (localPoc) {
            void loadLocal().then(() => { saveStatus = '저장됨'; render(); }).catch(() => { saveStatus = '저장 실패 · 다시 시도'; render(); });
            return;
        }
        state.reviewed.clear();
        state.reviewAnswers.clear();
        state.taskStates.clear();
    }
    if (a === 'folder-file') {
        const file = projects.find(p => p.id === id)?.files.find(f => f.id === el.dataset.file);
        if (!file || file.previewable === false)
            return;
        state.modal = { project: id, file: file.id };
        render(`[data-action="folder-file"][data-id="${CSS.escape(id)}"][data-file="${CSS.escape(file.id)}"]`);
        return;
    }
    if (a === 'file' || a === 'artifact') {
        returnFocus = el;
        state.modal = { project: id, file: el.dataset.file, task: el.dataset.task, subtask: el.dataset.subtask };
        render('.file-dialog .icon-button');
        return;
    }
    if (a === 'close') {
        close();
        return;
    }
    if (a === 'clear') {
        state.query = '';
        state.topic = '전체';
        state.owner = '전체';
    }
    render(a === 'themes' || a === 'theme' ? '.theme-launcher' : ['topic', 'owner', 'airview', 'fields', 'group', 'clear', 'home'].includes(a || '') ? `[data-action="${a}"]${el.dataset.value ? `[data-value="${v}"]` : ''}` : a === 'week' ? `[data-action="week"][data-step="${el.dataset.step}"]` : a === 'tab' ? `[data-action="tab"][data-value="${v}"]` : a === 'sources' ? `[data-action="sources"][data-id="${id}"]` : '');
}
function init() {
    try {
        const t = localStorage.getItem('ax_theme');
        if (THEMES.some(x => x.id === t))
            state.theme = t;
    }
    catch { }
    const fromHash = () => { state.project = projects.some(p => `#project/${p.id}` === location.hash) ? location.hash.split('/')[1] : ''; render(); };
    fromHash();
    window.addEventListener('popstate', fromHash);
    document.addEventListener('pointerdown', () => document.body.removeAttribute('data-keyboard-navigation'));
    document.addEventListener('focusin', event => {
        if (state.drawerTask && !state.modal && !state.reviews && !state.settingsOpen && !event.target.closest('.task-drawer')) {
            document.getElementById('task-drawer-title')?.focus();
        }
    });
    document.addEventListener('click', event => {
        const target = event.target, button = target.closest('[data-action]');
        if (state.drawerTask && !state.modal && !target.closest('.task-drawer') && button?.dataset.action !== 'task') {
            closeTaskDrawer();
            return;
        }
        if (button) {
            action(button);
            return;
        }
        if (state.themeOpen && !target.closest('.theme-picker-anchor')) {
            close();
        }
    });
    document.addEventListener('input', event => {
        const e = event.target;
        if (e.id === 'homeSearch') {
            state.query = e.value;
            render('homeSearch');
        }
    });
    document.addEventListener('change', event => {
        const e = event.target;
        if (e.id === 'weekSelect') {
            state.week = Math.min(0, Number(e.value));
            render('#weekSelect');
            return;
        }
        if (e.id === 'ownerFilter') {
            state.owner = e.value;
            render('#ownerFilter');
        }
    });
    document.addEventListener('keydown', event => {
        const target = event.target;
        if (event.key === 'Tab' || event.key === '/')
            document.body.toggleAttribute('data-keyboard-navigation', true);
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (event.key === '/' && !state.themeOpen && !state.settingsOpen && !state.reviews && !state.modal && !state.drawerTask && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
            event.preventDefault();
            document.getElementById('homeSearch')?.focus();
        }
        if (event.key === 'Tab' && (state.modal || state.reviews || state.settingsOpen || state.themeOpen || state.drawerTask)) {
            const dialog = document.querySelector(state.modal ? '.file-dialog' : state.drawerTask ? '.task-drawer' : '[aria-modal="true"]'), els = Array.from(dialog?.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]') || []), first = els[0], last = els.at(-1);
            if (event.shiftKey && (document.activeElement === first || !els.includes(document.activeElement))) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && (document.activeElement === last || !els.includes(document.activeElement))) {
                event.preventDefault();
                first?.focus();
            }
        }
        if (['ArrowLeft', 'ArrowRight'].includes(event.key) && target.matches('[role="tab"]')) {
            event.preventDefault();
            state.tab = state.tab === 'topic' ? 'episode' : 'topic';
            render(`[role="tab"][data-value="${state.tab}"]`);
        }
    });
}
async function loadLocal() {
    if (!sessionInfo) {
        const me = await fetch('/api/me');
        if (me.status === 401) {
            location.href = '/';
            throw new Error('login');
        }
        if (me.ok)
            sessionInfo = await me.json();
    }
    const response = await fetch(pilotMode ? '/api/view?data=pilot' : realMode ? '/api/view?data=real' : '/api/view');
    if (!response.ok)
        throw new Error('load failed');
    const data = await response.json();
    projects.splice(0, projects.length, ...data.projects);
    AX_DATA.reviews = data.reviews;
    correctionReady = !!data.correctionReady;
    correctionData = data.correctionData || { persons: [], tasks: [], worklogs: [], reviews: [] };
    AX_DATA.folders = data.folders || {};
    pilotReviews = data.pilotReviews || [];
    if (data.demoAsOf)
        AX_DATA.demoAsOf = data.demoAsOf;
    if (data.demoNotice)
        AX_DATA.demoNotice = data.demoNotice;
    state.reviewed.clear();
    state.reviewAnswers.clear();
    state.taskStates.clear();
    for (const task of data.taskStates) {
        localVersions.set(task.id, task.version);
        if (task.status === 'completed')
            state.taskStates.set(task.id, '완료');
    }
    for (const r of data.decisions) {
        state.reviewed.add(r.review_id);
        state.reviewAnswers.set(r.review_id, r.decision);
    }
}
async function saveLocalReview(id, value) {
    if (editable() && (realMode || correctionReady || (correctionData.reviews.find(r => r.id === id)?.version || 1) > 1)) {
        void sendCorrection('review', 'decide', id, { decision: value });
        return;
    }
    if (sessionInfo?.role === 'viewer' || saving || state.reviewed.has(id))
        return;
    const review = completionReviews().find(r => r.id === id);
    if (!review)
        return;
    saving = true;
    saveStatus = '판단함 · 저장 중';
    render();
    const key = id + ':' + value;
    if (!pendingDecisions.has(key))
        pendingDecisions.set(key, crypto.randomUUID());
    try {
        const response = await fetch(realMode ? '/api/decision?data=real' : '/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ review_id: id, answer: value, change_id: pendingDecisions.get(key), expected_version: localVersions.get(review.taskId) }) });
        if (!response.ok)
            throw new Error('save failed');
        await loadLocal();
        saveStatus = '저장됨';
    }
    catch {
        saveStatus = '저장 실패 · 다시 시도';
    }
    saving = false;
    render();
}
if (localPoc) {
    loadLocal().then(() => { saveStatus = state.reviewed.size ? '저장됨' : ''; init(); }).catch(() => { saveStatus = '저장 실패 · 다시 시도'; projects.splice(0); AX_DATA.reviews = []; init(); });
}
else
    init();
function pilotReviewCards() { return pilotReviews.map(r => '<article class="review-record"><h3>' + esc(r.proposal || r.kind) + '</h3><p>' + esc((r.candidate_task_ids || []).join(', ')) + '</p><div>' + (r.kind === 'link' ? '<button data-action="pilot-answer" data-id="' + esc(r.id) + '" data-value="accepted">제안 확정</button><button data-action="pilot-answer" data-id="' + esc(r.id) + '" data-value="corrected">태스크 변경</button>' : '') + '<button data-action="pilot-answer" data-id="' + esc(r.id) + '" data-value="unable">판단 불가</button></div></article>').join(''); }
async function savePilotReview(id, answer) {
    if (saving)
        return;
    const review = pilotReviews.find(r => r.id === id);
    if (!review)
        return;
    const task = answer === 'corrected' ? window.prompt('연결할 태스크 ID') : undefined;
    if (answer === 'corrected' && !task)
        return;
    saving = true;
    const key = id + ':' + answer + ':' + (task || '');
    if (!pendingDecisions.has(key))
        pendingDecisions.set(key, crypto.randomUUID());
    try {
        const response = await fetch('/api/pilot-decision', { method: 'POST', headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, body: JSON.stringify({ review_id: id, answer, task_id: task, expected_version: review.version, change_id: pendingDecisions.get(key) }) });
        if (!response.ok)
            throw new Error('save failed');
        await loadLocal();
        saveStatus = '저장됨';
    }
    catch {
        saveStatus = '저장 실패 · 다시 시도';
    }
    saving = false;
    render();
}
document.addEventListener('click', async (event) => { if (event.target.closest('[data-action=logout]')) {
    const r = await fetch('/auth/logout', { method: 'POST', headers: csrfHeaders() });
    if (r.ok)
        location.href = '/';
} });
document.addEventListener('submit', event => { if (event.target.id === 'correction-form') {
    event.preventDefault();
    document.querySelector('[data-action="correction-save"]')?.click();
} });
