/// <reference path="icons.ts" />
type Theme = 'linear-notion' | 'linear' | 'notion' | 'attio' | 'airtable' | 'clickup';
interface Subtask {
    id: string;
    title: string;
    artifact: string;
    sourceId?: string;
    performedAtPrecision?: 'exact' | 'date' | 'unknown';
    owner: string;
    performedAt: string;
    summary: string;
}
interface Task {
    wbsCode?: string;
    startDate?: string;
    planSource?: string;
    dueDate?: string;
    status?: string;
    weeklySummary: string;
    id: string;
    topic: string;
    title: string;
    summary: string;
    owner: string;
    detail: string;
    decision: string;
    createdAt: string;
    subtasks: Subtask[];
}
interface SourceFile {
    folderId?: string;
    folderPath?: string[];
    folderUrl?: string;
    url?: string;
    previewable?: boolean;
    subtaskId?: string;
    owner?: string;
    id: string;
    name: string;
    type: string;
    source: string;
    summary: string;
    topic: string;
    createdAt: string;
    taskId: string;
}
interface Project {
    id: string;
    name: string;
    desc: string;
    owner: string;
    tasks: Task[];
    files: SourceFile[];
}
interface Review {
    kind?: string;
    taskId: string;
    id: string;
    project: string;
    title: string;
    desc: string;
    source: string;
}
interface RecordItem {
    project: Project;
    task: Task;
    subtask: Subtask;
}
interface DateRange {
    start: string;
    end: string;
}
declare const AX_DATA: {
    projects: Project[];
    reviews: Review[];
    demoAsOf: string;
    demoNotice: string;
};
declare const AX_ASSETS: Record<string, string>;
declare const AXModel: {
    owners: (p: Project[]) => string[];
    progress: (p: Project, date: string) => {percent: number; schedule: number | null; behind: boolean; planned: boolean; done: number; total: number};
    taskState: (t: Task, date: string) => string;
    deadline: (t: Task, date: string) => string;
    summaryRange: (date: string, unit: string, offset: number) => DateRange;
    categories: string[];
    monthRange: (date: string, offset: number) => DateRange & {
        days: number;
        label: string;
    };
    day: (s: string) => string;
    addDays: (s: string, n: number) => string;
    weekRange: (s: string, n: number) => DateRange;
    latestTask: (p: Project) => string;
    sortProjects: (p: Project[]) => Project[];
    weekRecords: (p: Project[], r: DateRange) => RecordItem[];
    sortedSources: (f: SourceFile[]) => SourceFile[];
    projectRange: (p: Project) => DateRange | null;
};
const pilotMode = /(?:^|[?&])data=pilot(?:&|$)/.test(location.search || '');
const realMode = /(?:^|[?&])data=real(?:&|$)/.test(location.search || '');
const localPoc = pilotMode || realMode || /(?:^|[?&])data=local(?:&|$)/.test(location.search || '');
let pilotReviews: {id: string; kind: string; version: number; proposal?: string; candidate_task_ids?: string[]}[] = [];
let saveStatus = '';
let saving = false;
const localVersions = new Map<string, number>();
const pendingDecisions = new Map<string, string>();
const M = AXModel, projects = AX_DATA.projects;
const THEMES: {
    id: Theme;
    name: string;
    hint: string;
}[] = [{ id: 'linear', name: 'Linear', hint: '이슈 목록 · 속성 레일' }, { id: 'linear-notion', name: 'Linear · Notion 색상', hint: 'Linear 구조 · Notion 팔레트' }, { id: 'notion', name: 'Notion', hint: '문서 · 갤러리 · 타임라인' }, { id: 'attio', name: 'Attio', hint: '레코드 · 관계 속성' }, { id: 'airtable', name: 'Airtable', hint: '베이스 · Views · 그리드' }, { id: 'clickup', name: 'ClickUp', hint: '보드 · 담당자별 업무' }];
const state = { theme: 'linear-notion' as Theme, query: '', topic: '전체', owner: '전체', week: 0, summaryUnit: 'week', project: '', tab: 'topic', expanded: new Set<string>(), themeOpen: false, settingsOpen: false, integration: '', weekOwner: '전체', timelineMonth: 0, reviews: false, reviewed: new Set<string>(), reviewAnswers: new Map<string, string>(), taskStates: new Map<string, string>(), modal: null as null | {
        project: string;
        file?: string;
        task?: string;
        subtask?: string;
    }, airView: 'grid', hideFields: false, grouped: false };
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const asset = (k: string) => AX_ASSETS[k] || `assets/${k}.png`;
const thumb = (p: Project) => ({ ax: 'architecture', media: 'report', dashboard: 'dashboard', interview: 'document', pipeline: 'pipeline', taskmail: 'timeline', customer: 'wireframe' }[p.id] || 'document');
const fileThumb = (f: SourceFile, p: Project) => /구조|아키텍처/.test(f.name) ? 'architecture' : /시안|화면/.test(f.name) ? 'dashboard' : /연결표|작업/.test(f.name) ? 'timeline' : thumb(p);
const avatar = (n: string) => `<span class="avatar avatar-${n === '김지현' ? 1 : n === '박성진' ? 2 : 3}" aria-hidden="true">${esc(n.slice(0,1))}</span>`;
const date = (s: string) => s ? M.day(s).slice(5).replace('-', '.') : '—';
const fullDate = (s: string) => s ? M.day(s).replaceAll('-', '.') : '—';
const week = () => M.summaryRange(AX_DATA.demoAsOf, state.summaryUnit, state.week);
// Legacy data has no kind; operational data must explicitly be completion.
const completionReviews = () => AX_DATA.reviews.filter(r => (!r.kind || r.kind === 'completion') && projects.some(p => p.id === r.project && p.tasks.some(t => t.id === r.taskId)));
const reviewCount = (id?: string) => (id ? 0 : pilotReviews.length) + completionReviews().filter(r => !state.reviewed.has(r.id) && (!id || r.project === id)).length;
const count = (p: Project) => p.tasks.reduce((n, t) => n + t.subtasks.length, 0);
const people = (p: Project) => M.owners([p]);
const tag = (s: string, c = '') => `<span class="tag ${c}">${esc(s)}</span>`;
const empty = (s: string, body: string) => `<div class="empty">${icon('search', 24)}<strong>${s}</strong><p>${body}</p></div>`;
function filtered() { return M.sortProjects(projects.filter(p => p.tasks.some(t => (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.owner === state.owner || t.subtasks.some(s => s.owner === state.owner))) && (!state.query || [p.name, p.desc, ...p.tasks.flatMap(t => [t.title, ...t.subtasks.map(s => s.title)])].join(' ').toLowerCase().includes(state.query.toLowerCase())))); }
function records() { return M.weekRecords(projects, week()).filter(r => state.weekOwner === '전체' || r.subtask.owner === state.weekOwner); }
function header() {
    return `<header class="global-header"><button class="brand" data-action="home" aria-label="프로젝트 홈으로 돌아가기"><span class="brand-symbol">AX</span><strong>프로젝트 관리장</strong></button><span class="header-divider"></span><span class="breadcrumb">${icon('layers', 16)} AX팀 <span>/</span><b>프로젝트</b></span><div class="header-right">${localPoc ? `<span class="demo-mark" role="status">${esc(saveStatus)}</span>` : ''}<span class="demo-mark"><i></i>${pilotMode ? 'AX-TF 공유 드라이브 기록' : realMode ? '실데이터 · Drive·Chat·Gmail' : '예시 데이터'}</span><button class="review-trigger ${reviewCount() ? 'needs-review' : ''}" data-action="reviews" aria-haspopup="dialog">${icon('bell', 17)} 검토 필요 <b>${reviewCount()}</b></button><button class="settings-trigger icon-button" data-action="settings" aria-label="설정 및 서비스 연동" title="설정 및 서비스 연동">${icon('settings', 21)}</button></div></header>`;
}
function summaryLabel(range: DateRange) { return state.summaryUnit === 'day' ? fullDate(range.start) : state.summaryUnit === 'month' ? range.start.slice(0,7).replace('-', '년 ') + '월' : weekLabel(range); }
function weekly() {
    const rows = records(), owners = ['전체', ...M.owners(projects)];
    const offsets = [...new Set([state.week, ...Array.from({ length: 26 }, (_, i) => -i)])].sort((a, b) => b - a);
    const groups = projects.map(project => ({ project, rows: rows.filter(r => r.project.id === project.id) })).filter(g => g.rows.length);
    const distribution = M.categories.map((category, i) => ({ category, index: i, count: rows.filter(r => r.task.topic === category).length }));
    const visibleOwners = state.weekOwner === '전체' ? owners.slice(1) : [state.weekOwner];
    return `<section class="weekly-section" aria-labelledby="weekly-heading"><div class="section-top weekly-header"><div class="weekly-heading-date"><h2 id="weekly-heading">${state.summaryUnit === 'day' ? '하루의 업무' : state.summaryUnit === 'month' ? '한 달의 업무' : '한 주의 업무'}</h2><div class="summary-unit-tabs" aria-label="요약 기간">${[['day','일간'],['week','주간'],['month','월간']].map(([unit,label]) => `<button data-action="summary-unit" data-value="${unit}" aria-pressed="${state.summaryUnit === unit}">${label}</button>`).join('')}</div><div class="week-control"><button class="icon-button" data-action="week" data-step="-1" aria-label="이전 ${state.summaryUnit === 'day' ? '날' : state.summaryUnit === 'month' ? '월' : '주'}">${icon('back', 15)}</button><label class="week-select"><span class="sr-only">요약 기간 선택</span><select id="weekSelect">${offsets.map(offset => { const w = M.summaryRange(AX_DATA.demoAsOf, state.summaryUnit, offset); return `<option value="${offset}" ${state.week === offset ? 'selected' : ''}>${summaryLabel(w)}</option>`; }).join('')}</select></label><button class="icon-button" data-action="week" data-step="1" aria-label="다음 ${state.summaryUnit === 'day' ? '날' : state.summaryUnit === 'month' ? '월' : '주'}" ${state.week === 0 ? 'disabled' : ''}>${icon('arrow', 15)}</button></div></div><div class="weekly-person-tabs" aria-label="주간 요약 담당자 선택">${owners.map(owner => `<button data-action="week-person" data-value="${esc(owner)}" class="${state.weekOwner === owner ? 'active' : ''}" aria-pressed="${state.weekOwner === owner}">${esc(owner)}</button>`).join('')}</div></div><div class="weekly-layout"><div class="week-summary"><span class="summary-caption">${icon('chart',18)} ${state.weekOwner === '전체' ? '팀 전체' : esc(state.weekOwner)} 업무 요약</span><div class="summary-number"><span class="summary-main-icon">${icon('deliverable',25)}</span><strong>${rows.length}</strong><span class="summary-unit">건의 작업 내역</span></div><div class="summary-meta"><span>${icon('folder',18)}<b>${groups.length}</b>개 프로젝트</span><span>${icon('people',18)}<b>${new Set(rows.map(r => r.subtask.owner).filter(Boolean)).size}</b>명 참여</span></div><div class="summary-task-count">${icon('layers',18)}<span>태스크 <strong>${new Set(rows.map(r => r.task.id)).size}</strong>개</span></div></div><div class="weekly-content"><div class="weekly-report" tabindex="0" role="region" aria-label="주간 업무 요약 내용">${groups.map(g => `<article class="weekly-project-summary"><header><button data-action="reveal" data-id="${g.project.id}">${esc(g.project.name)}</button><span>${g.rows.length}건</span></header><p class="weekly-prose">${workNarrative(g.rows)}</p><details class="weekly-details"><summary>작업 내역 ${g.rows.length}건 보기</summary><ul>${g.rows.map(r => `<li><button data-action="record" data-id="${g.project.id}" data-task="${r.task.id}"><strong>${esc(r.subtask.title)}</strong><span>${esc(r.subtask.owner)} · ${clockTime(r.subtask.performedAt)}</span></button></li>`).join('')}</ul></details></article>`).join('') || '<p class="no-activity">기록된 업무가 없습니다.</p>'}</div></div><aside class="weekly-visual"><div class="work-distribution"><h3>업무 유형별 작업 내역</h3><div class="distribution-bar" role="img" aria-label="${distribution.map(d => `${d.category} ${d.count}건`).join(', ')}">${distribution.filter(d => d.count).map(d => `<i class="category-${d.index}" style="width:${d.count / Math.max(rows.length, 1) * 100}%" title="${d.category} ${d.count}건"></i>`).join('')}</div><div class="distribution-legend">${distribution.filter(d => d.count).map(d => `<span><i class="record-dot category-${d.index}"></i>${d.category}<b>${d.count}</b></span>`).join('') || '<span>기록 없음</span>'}</div></div><div class="weekly-owner-table"><h3>담당자별 작업</h3><table><thead><tr><th>담당자</th><th>작업 내역</th><th>태스크</th><th>확인 요청</th></tr></thead><tbody>${visibleOwners.map(owner => { const mine = rows.filter(r => r.subtask.owner === owner), tasks = new Set(mine.map(r => r.task.id)), review = completionReviews().filter(r => !state.reviewed.has(r.id) && tasks.has(r.taskId)).length; return `<tr><th>${esc(owner)}</th><td><span class="owner-count">${mine.length}건<i style="width:${mine.length / Math.max(rows.length, 1) * 100}%"></i></span></td><td>${tasks.size}개</td><td class="${review ? 'has-review' : ''}">${review}건</td></tr>`; }).join('')}</tbody></table></div></aside></div></section>`;
}
function projectToolbar() { return `<div class="project-toolbar">${state.theme.startsWith('linear') ? '' : `<strong class="project-list-label">모든 프로젝트 <span>${projects.length}</span></strong>`}<div class="toolbar-filters"><label class="searchbox">${icon('search', 16)}<input id="homeSearch" aria-label="프로젝트·태스크 검색" placeholder="프로젝트·태스크 검색" value="${esc(state.query)}"><kbd>/</kbd></label><label class="select-filter"><span class="sr-only">담당자</span><select id="ownerFilter">${['전체', ...M.owners(projects)].map(x => `<option ${state.owner === x ? 'selected' : ''} value="${esc(x)}">${x === '전체' ? '모든 담당자' : esc(x)}</option>`).join('')}</select></label></div></div>${state.theme.startsWith('linear') ? '' : `<div class="project-sort-note">${icon('sort', 14)} 최근 생긴 태스크부터</div>`}`; }
function projectButton(p: Project, i: number, variant = 'row') { const open = state.project === p.id; return `<button class="project-toggle ${variant} ${open ? 'selected' : ''}" data-action="project" data-id="${p.id}" aria-expanded="${open}" aria-controls="project-${p.id}"><span class="project-name-cell"><span class="expand-chevron">${icon('chevron', 14)}</span><span class="project-glyph glyph-${i % 5}">${icon('folder', 16)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.desc)}</small></span></span><span class="people-cell">${people(p).map(avatar).join('')}</span><span class="number-cell">${p.tasks.length}</span><span class="number-cell secondary-field">${count(p)}</span><time>${date(M.latestTask(p))}</time><span class="secondary-field">${reviewCount(p.id) ? tag(`검토 ${reviewCount(p.id)}`, 'review-tag') : '—'}</span></button>`; }
function expanded(p: Project) { return state.project === p.id ? `<div class="inline-project" id="project-${p.id}">${projectDetail(p)}</div>` : ''; }
const tableHead = () => `<div class="table-labels"><span>프로젝트</span><span>참여자</span><span>태스크</span><span>작업 내역</span><span>최근 태스크</span><span>검토</span></div>`;
function linearList(list: Project[]) { return timeline(list, false, true); }
function activityPeople() { return `<div class="heading-people" aria-label="담당자 빠른 필터">${M.owners(projects).map(o => `<button data-action="owner" data-value="${esc(o)}" aria-pressed="${state.owner === o}">${avatar(o)}<span>${esc(o)}</span></button>`).join('')}</div>`; }
function effectiveTask(t: Task): Task { const value = state.taskStates.get(t.id); return {...t, status: value ? value === '완료' ? 'completed' : 'in_progress' : t.status}; }
function dueLabel(t: Task) { if (!M.day(t.dueDate || '')) return ''; const urgency = M.deadline(effectiveTask(t), AX_DATA.demoAsOf); return `<span class="due-label ${urgency}">마감 ${Number(t.dueDate!.slice(5,7))}/${Number(t.dueDate!.slice(8))}${urgency === 'late' ? ' · 지연' : ''}</span>`; }
function projectInfo(p: Project) { const progress = M.progress({...p, tasks:p.tasks.map(effectiveTask)}, AX_DATA.demoAsOf); return `<span class="project-info"><strong>${esc(p.name)}</strong><span class="project-description">${esc(p.desc)}</span><span class="project-metadata"><span>${people(p).map(avatar).join('')}</span><span>태스크 ${p.tasks.length}개 · 작업 내역 ${count(p)}건</span><span>최근 태스크 ${date(M.latestTask(p))}</span>${reviewCount(p.id) ? tag('검토 '+reviewCount(p.id),'review-tag') : ''}</span><span class="project-progress ${progress.behind ? 'behind' : ''}">진척 ${progress.percent}%${progress.planned ? ' · 완료 '+progress.done+'/'+progress.total+(progress.schedule === null ? ' · 일정 미정' : ' · 계획 '+progress.schedule+'%') : ' · 계획 없음'}<span class="progress-track"><i style="width:${progress.percent}%"></i></span></span></span>`; }
document.addEventListener('keydown', (event: KeyboardEvent) => {
 const target = event.target as HTMLElement;
 if (!target.matches('[data-action="heatmap-day"]')) return;
 const step = {ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1}[event.key];
 if (step === undefined) return;
 event.preventDefault();
 const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-action="heatmap-day"]'));
 const next = cells[Math.max(0, Math.min(cells.length-1, cells.indexOf(target)+step))];
 target.tabIndex = -1; next.tabIndex = 0; next.focus();
});
function heatmap() {
 const today = M.day(AX_DATA.demoAsOf), start = M.addDays(M.weekRange(today,0).start,-25*7);
 const rows = M.weekRecords(projects,{start,end:today}).filter(r => state.owner === '전체' || r.subtask.owner === state.owner);
 const counts = new Map<string,number>(), pairs = new Map<string,Set<string>>();
 rows.forEach(r => { const d=M.day(r.subtask.performedAt); counts.set(d,(counts.get(d)||0)+1); if(!pairs.has(d))pairs.set(d,new Set());pairs.get(d)!.add(JSON.stringify([r.subtask.owner,r.task.id])); });
 const total=[...pairs.values()].reduce((sum,set)=>sum+set.size,0);
 return `<section class="activity-heatmap" aria-label="작업 내역 히트맵"><div class="section-top"><h2>작업 내역</h2><span class="section-note">최근 26주 · ${state.owner === '전체' ? '팀 전체' : esc(state.owner)} · 태스크·일 ${total}</span></div><div class="heatmap-scroll"><div class="heatmap-grid"><div class="heatmap-weekdays"><span></span>${['월','화','수','목','금','토','일'].map(d=>`<span>${d}</span>`).join('')}</div>${Array.from({length:26},(_,w)=>{const first=M.addDays(start,w*7);return `<div class="heatmap-week"><span class="heatmap-month">${w===0 || first.slice(5,7)!==M.addDays(first,-7).slice(5,7) ? Number(first.slice(5,7))+'월' : ''}</span>${Array.from({length:7},(_,d)=>{const at=M.addDays(first,d),n=pairs.get(at)?.size||0,label=Number(at.slice(5,7))+'월 '+Number(at.slice(8))+'일 · 태스크 '+n+'개 · 기록 '+(counts.get(at)||0)+'건';return at>today ? '<span class="heatmap-future"></span>' : `<button tabindex="${at === today ? 0 : -1}" class="heatmap-cell level-${n>=5?4:n>=3?3:n}" data-action="heatmap-day" data-value="${at}" title="${label}" aria-label="${label}"></button>`;}).join('')}</div>`;}).join('')}</div></div><div class="heatmap-legend">하루에 손댄 태스크 수 ${['0','1','2','3–4','5+'].map((label,n)=>`<span><i class="heatmap-cell level-${n}"></i>${label}</span>`).join('')}</div></section>`;
}
function gallery(list: Project[]) { return `<div class="project-gallery">${list.map(p => `<article class="gallery-project ${state.project === p.id ? 'is-open' : ''}"><button class="gallery-toggle" data-action="project" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-controls="project-${p.id}"><div class="project-cover"><img src="${asset(thumb(p))}" alt="${esc(p.name)} 관련 자료"></div><div class="gallery-copy"><span class="gallery-icon">${icon('folder', 19)}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><dl><div><dt>참여자</dt><dd>${people(p).map(avatar).join('')}</dd></div><div><dt>최근 태스크</dt><dd>${fullDate(M.latestTask(p))}</dd></div></dl><footer><span>${p.tasks.length}개 태스크 · ${count(p)}건의 작업 내역</span>${icon('chevron', 14)}</footer></div></button>${expanded(p)}</article>`).join('')}</div>`; }
function attioList(list: Project[]) { return `<div class="attio-directory"><div class="directory-caption">${icon('layers', 15)} 전체 레코드 <span>${list.length}</span><small>작업 생성일 ↓</small></div><div class="project-table">${tableHead()}${list.map((p, i) => `<article class="project-entry">${projectButton(p, i, 'record-row')}${expanded(p)}</article>`).join('')}</div><div class="directory-foot">${list.length}개 레코드 <span>${list.reduce((n, p) => n + count(p), 0)}건의 작업 내역</span></div></div>`; }
function airGrid(list: Project[]) { const groups = state.grouped ? ['검토 필요', '검토 없음'] : ['전체']; return `<div class="air-grid ${state.hideFields ? 'hide-fields' : ''}"><div class="table-scroll"><div class="project-table">${tableHead()}${groups.map(label => { const rows = label === '전체' ? list : list.filter(p => label === '검토 필요' ? reviewCount(p.id) > 0 : reviewCount(p.id) === 0); return `${state.grouped ? `<div class="air-group">${label} · ${rows.length}개</div>` : ''}${rows.map((p, i) => `<article class="project-entry">${projectButton(p, i, 'grid-row')}${expanded(p)}</article>`).join('')}`; }).join('')}</div></div><div class="directory-foot">${list.length}개 프로젝트</div></div>`; }
function airBase(list: Project[]) { return `<div class="air-base"><header class="air-base-title"><span class="air-base-icon">${icon('layers', 24)}</span><div><h3>AX 프로젝트 베이스</h3><p>프로젝트와 연결된 작업 내역</p></div><span class="air-base-label">${list.length}개 프로젝트</span></header><div class="air-table-tabs"><span>프로젝트</span><small>팀 공통 업무 기록</small></div><div class="air-base-layout"><nav class="air-views" aria-label="프로젝트 보기"><h4>Views</h4>${[['grid', 'grid', '그리드'], ['gallery', 'columns', '갤러리'], ['timeline', 'calendar', '타임라인']].map(([id, ico, label]) => `<button data-action="airview" data-value="${id}" class="${state.airView === id ? 'active' : ''}">${icon(ico, 15)} ${label}</button>`).join('')}<button data-action="clear">모든 프로젝트</button></nav><section class="air-canvas"><div class="air-tools"><strong>${state.airView === 'grid' ? '그리드' : state.airView === 'gallery' ? '갤러리' : '타임라인'} 보기</strong>${state.airView === 'grid' ? `<button data-action="fields" aria-pressed="${state.hideFields}">${icon('columns', 14)} ${state.hideFields ? '전체 필드' : '필드 숨기기'}</button><button data-action="group" aria-pressed="${state.grouped}">${icon('layers', 14)} ${state.grouped ? '그룹 해제' : '검토 여부로 묶기'}</button>` : ''}</div>${state.airView === 'grid' ? airGrid(list) : state.airView === 'gallery' ? gallery(list) : timeline(list, true)}</section></div></div>`; }
function clickupBoard(list: Project[]) { return `<div class="resource-board">${list.map((p, i) => `<article class="board-project ${state.project === p.id ? 'is-open' : ''}"><button class="board-toggle" data-action="project" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-controls="project-${p.id}"><div class="board-card-top"><span class="project-glyph glyph-${i % 5}">${icon('folder', 17)}</span>${reviewCount(p.id) ? tag(`검토 ${reviewCount(p.id)}`, 'review-tag') : ''}</div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="board-activity"><strong>${count(p)}</strong><span>작업 내역</span><small>${p.tasks.length}개 태스크</small></div><footer><span>${people(p).map(avatar).join('')}</span><time>최근 태스크 ${date(M.latestTask(p))}</time></footer></button>${expanded(p)}</article>`).join('')}</div>`; }
function timeline(list: Project[], inside = false, unified = false): string {
    const month = M.monthRange(AX_DATA.demoAsOf, state.timelineMonth), days = month.days;
    const today = M.day(AX_DATA.demoAsOf), todayIndex = Math.round((Date.parse(today) - Date.parse(month.start)) / 86400000);
    const todayVisible = todayIndex >= 0 && todayIndex < days, todayLeft = (todayIndex + .5) / days * 100;
    const ticks = [1, 5, 10, 15, 20, 25, ...(days >= 30 ? [30] : [days])];
    return `<section class="timeline-section calendar-month ${inside ? 'inside' : ''} ${unified ? 'unified-timeline' : ''}" aria-label="프로젝트 타임라인"><div class="section-top ${unified ? 'unified-timeline-top' : ''}">${unified ? `<div class="project-sort-note">${icon('sort', 14)} 최근 생긴 태스크부터 · ${icon('calendar', 14)} 월간 타임라인</div>` : `<div><span class="eyebrow">PROJECT TIMELINE</span><h2>${icon('calendar', 16)} 프로젝트 타임라인</h2></div>`}<div class="month-controls"><button class="icon-button" data-action="timeline-month" data-step="-1" aria-label="이전 달">${icon('back', 14)}</button><span>${month.label}</span><button class="icon-button" data-action="timeline-month" data-step="1" aria-label="다음 달">${icon('arrow', 14)}</button></div></div><div class="timeline-scroll"><div class="timeline-grid"><div class="timeline-head"><span>프로젝트</span><div class="month-axis">${ticks.map(d => `<span style="left:${(d - 1) / days * 100}%">${d}일</span>`).join('')}${todayVisible ? `<b class="today-label" style="left:${todayLeft}%">오늘</b>` : ''}</div></div>${list.map((p, i) => {
        const range = M.projectRange(p) || {start: today, end: today};
        const from = Math.round((Date.parse(range.start) - Date.parse(month.start)) / 86400000), to = Math.round((Date.parse(range.end) - Date.parse(month.start)) / 86400000);
        const left = Math.max(0, from) / days * 100, right = Math.min(days, to + 1) / days * 100;
        return `<div class="timeline-row"><button class="${unified ? 'project-toggle unified-toggle' : ''}" data-action="${unified ? 'project' : 'reveal'}" data-id="${p.id}" aria-expanded="${state.project === p.id}" ${unified ? `aria-controls="project-${p.id}"` : ''}>${unified ? projectInfo(p) : `<span class="project-glyph glyph-${i % 5}">${icon('folder', 13)}</span>${esc(p.name)}`}</button><div class="timeline-lane" style="--month-days:${days}">${todayVisible ? `<span class="today-line" style="left:${todayLeft}%" title="오늘 ${fullDate(today)}"></span>` : ''}${right > left ? `<button class="timeline-bar bar-${i % 3}" style="left:${left}%;width:${right - left}%" data-action="${unified ? 'project' : 'reveal'}" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-label="${esc(p.name)} ${range.start}부터 ${range.end}까지"><span>${from < 0 ? `<b class="timeline-continuation" title="${fullDate(range.start)}부터 이어진 프로젝트">← ${date(range.start)}부터</b>` : ''}${esc(p.name)}</span><small>${count(p)}건</small></button>` : `<span class="timeline-outside">이 달의 기록 없음 · ${date(range.start)} — ${date(range.end)}</span>`}</div></div>${unified ? expanded(p) : ''}`;
    }).join('')}</div></div><p class="timeline-foot">${month.label} · 작업 생성부터 최근 태스크 내역까지</p></section>`;
}
const planDate = (s?: string) => s ? Number(s.slice(5,7))+'/'+Number(s.slice(8,10)) : '—';
function planStatus(t: Task) {const status=M.taskState(effectiveTask(t),AX_DATA.demoAsOf);return tag(({completed:'완료',late:'지연',active:'진행 중',upcoming:'예정',undated:'일정 미정'} as Record<string,string>)[status], 'plan-status '+status);}
function taskItem(t: Task, p: Project) {
    const open = state.expanded.has(t.id), pending = taskReviews(t.id);
    return `<article class="task-item ${open ? 'is-expanded' : ''}"><button class="task-toggle" data-action="task" data-task="${t.id}" aria-expanded="${open}" aria-controls="task-${t.id}"><span class="expand-chevron">${icon('chevron', 14)}</span><code>${esc(t.planSource === 'wbs' ? t.wbsCode || t.id : t.id)}</code><span class="task-copy"><strong>${esc(t.title)} ${t.planSource === 'wbs' ? planStatus(t) : workStatus(t.id)+' '+dueLabel(t)} ${pending.length ? `<span class="task-review-marker">${icon('bell', 12)} 검토 필요 ${pending.length}</span>` : ''}</strong><small>${t.planSource === 'wbs' ? esc(t.owner || '담당 미정')+' · '+planDate(t.startDate)+'~'+planDate(t.dueDate) : esc(t.summary)}</small></span><span class="task-output-count">${t.subtasks.length}건의 작업 내역</span><time>${date(t.createdAt)}</time></button>${open ? `<div class="task-expanded" id="task-${t.id}">${taskReviewForm(t, p)}<p class="task-description">${esc(t.detail)}</p><div class="subtask-heading"><span>작업 내역</span><small>담당자 / 기록 시각 / 관련 자료</small></div><div class="subtask-list">${t.subtasks.map(s => `<article class="subtask-row"><span class="subtask-branch">└</span><div><strong>${esc(s.title)}</strong><div class="subtask-execution-log"><span class="execution-log-label">작업 내역</span><time datetime="${s.performedAt}">${clockTime(s.performedAt)}</time><p>${esc(s.summary)}</p></div>${artifactButton(p, t, s)}</div><span class="subtask-person">${avatar(s.owner)}${esc(s.owner)}</span></article>`).join('')}</div><div class="task-decision"><span>${icon('info', 14)} 결정사항</span><p>${esc(t.decision)}</p></div></div>` : ''}</article>`;
}
function taskPanel(p: Project) {
    const tasks = p.tasks.filter(t => (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.owner === state.owner || t.subtasks.some(s => s.owner === state.owner)));
    if(p.tasks.some(t=>t.planSource==='wbs')) {
     const plan=tasks.filter(t=>t.planSource==='wbs').sort((a,b)=>(a.wbsCode||'').localeCompare(b.wbsCode||'',undefined,{numeric:true})||a.id.localeCompare(b.id)),activity=tasks.filter(t=>t.planSource!=='wbs');
     return `<section class="work-section"><div class="work-section-header"><h3>태스크 <span>${tasks.length}</span></h3></div><div class="work-body"><section class="task-group"><h4>계획 태스크 <span>${plan.length}</span></h4>${plan.map(t=>taskItem(t,p)).join('')}</section>${activity.length?`<section class="task-group"><h4>계획 외 업무 <span>${activity.length}</span></h4>${activity.map(t=>taskItem(t,p)).join('')}</section>`:''}</div></section>`;
    }
    return `<section class="work-section"><div class="work-section-header"><h3>태스크 <span>${tasks.length}</span></h3><div class="view-tabs" role="tablist" aria-label="작업 보기">${[['topic', '주제별'], ['episode', '에피소드별']].map(([id, title]) => `<button role="tab" aria-selected="${state.tab === id}" data-action="tab" data-value="${id}" class="${state.tab === id ? 'active' : ''}">${title}</button>`).join('')}</div></div><div class="work-body">${state.tab === 'topic' ? M.categories.map(c => { const ts = tasks.filter(t => t.topic === c); return ts.length ? `<section class="task-group"><h4><i class="record-dot category-${M.categories.indexOf(c)}"></i>${c}<span>${ts.length}</span></h4>${ts.map(t => taskItem(t, p)).join('')}</section>` : ''; }).join('') : executionEpisodes(p, tasks)}</div></section>`;
}
function sources(p: Project) {
    const files = M.sortedSources(p.files), repos = p.files.filter(f => f.source === 'GitHub').length;
    return `<aside class="source-rail"><section class="sources"><div class="source-heading"><h3>관련 자료</h3><span>${p.files.length - repos}개 문서${repos ? ` · ${repos}개 저장소` : ''}</span></div><p class="source-caption">작업 내역의 관련 자료 포함 · 주제별 최신순</p><div class="source-scroll" data-project="${p.id}" tabindex="0" role="region" aria-label="관련 자료 목록">${M.categories.map(c => { const fs = files.filter(f => f.topic === c); return fs.length ? `<div class="source-group"><h4>${c}</h4>${fs.map(f => `<button class="source-row" data-action="file" data-id="${p.id}" data-file="${f.id}"${f.previewable === false ? ' disabled' : ''} aria-label="${esc(f.name)} 미리보기"><span class="source-kind ${f.source === 'GitHub' ? 'repository' : ''}">${f.source === 'GitHub' ? '저장소' : '문서'}</span><span class="source-info"><strong>${esc(f.name)}</strong><small>${esc(f.source)} · ${f.subtaskId ? '작업 내역 자료' : '프로젝트 자료'} · ${date(f.createdAt)}</small></span>${icon('external', 16)}</button>`).join('')}</div>` : ''; }).join('')}</div></section><section class="project-properties"><h3>프로젝트 속성</h3><dl><div><dt>참여자</dt><dd>${people(p).map(avatar).join('')}</dd></div><div><dt>최근 태스크</dt><dd>${fullDate(M.latestTask(p))}</dd></div><div><dt>작업 내역</dt><dd>${count(p)}건</dd></div></dl></section></aside>`;
}
function projectDetail(p: Project) {
    const pending = completionReviews().filter(r => r.project === p.id && !state.reviewed.has(r.id));
    return `<section class="project-detail" aria-label="${esc(p.name)} 내용"><header class="inline-detail-head"><div><span class="eyebrow">${p.id.toUpperCase()} / PROJECT</span><h2>${esc(p.name)}</h2><p>${esc(p.desc)}</p></div><button class="icon-button" data-action="project" data-id="${p.id}" aria-label="프로젝트 접기">${icon('x', 18)}</button></header>${pending.length ? `<div class="project-review-alert"><div>${icon('bell', 19)}<strong>검토가 필요한 사항 ${pending.length}건</strong></div>${pending.map(r => `<button data-action="review-task" data-id="${r.id}"><span>${esc(r.title)}</span>${icon('arrow', 15)}</button>`).join('')}</div>` : ''}${state.theme.startsWith('linear') ? '' : `<div class="project-local-timeline">${timeline([p], true)}</div>`}<div class="detail-layout">${taskPanel(p)}${sources(p)}</div></section>`;
}
function projectArea() { const list = filtered(); return `<div class="section-top project-section-top"><div><span class="eyebrow">PROJECTS</span><h2>전체 프로젝트 <span>${list.length}</span></h2></div><span class="section-note">프로젝트를 눌러 업무 기록을 펼쳐 보세요</span></div>${projectToolbar()}<div id="project-results">${list.length ? ({ linear: linearList, 'linear-notion': linearList, notion: gallery, attio: attioList, airtable: airBase, clickup: clickupBoard }[state.theme])(list) : empty('검색 결과가 없습니다.', '검색어나 필터를 바꿔 보세요.')}<div class="results-count" aria-live="polite">${list.length}개 프로젝트${list.length === 0 ? ' · <button data-action="clear">필터 초기화</button>' : ''}</div></div>${heatmap()}`; }
function themePicker() { const mini = (id: string) => `<span class="theme-mini mini-${id}"><i></i><b></b><b></b><b></b></span>`; return `<div class="theme-picker-anchor">${state.themeOpen ? `<div class="theme-menu" role="dialog" aria-modal="true" aria-label="UI 테마 선택"><header><strong>화면 테마</strong><small>업무에 맞는 화면으로 살펴보세요</small></header>${THEMES.map(t => `<button class="theme-choice ${t.id === state.theme ? 'selected' : ''}" data-action="theme" data-value="${t.id}">${mini(t.id)}<span><strong>${t.name}</strong><small>${t.hint}</small></span>${t.id === state.theme ? icon('check', 15) : ''}</button>`).join('')}</div>` : ''}<button class="theme-launcher" data-action="themes" aria-expanded="${state.themeOpen}">${mini(state.theme)}<span><strong>${THEMES.find(t => t.id === state.theme)!.name}</strong><small>화면 테마</small></span>${icon('chevron', 14)}</button></div>`; }
function reviewDrawer() { return state.reviews ? `<div class="overlay-backdrop" data-action="close"></div><aside class="review-drawer" role="dialog" aria-modal="true" aria-label="검토함"><header><div><span class="eyebrow">REVIEW INBOX</span><h2>확인할 일 <span>${reviewCount()}</span></h2></div><button class="icon-button" data-action="close" aria-label="검토함 닫기">${icon('x', 18)}</button></header><p class="drawer-caption">각 태스크에서 근거를 보고, 끝난 일이 맞는지 확인해 주세요.</p><div class="drawer-scroll">${pilotReviewCards()}${completionReviews().filter(r => !state.reviewed.has(r.id)).map(r => `<article class="review-record">${tag(projects.find(p => p.id === r.project)?.name || '')}<h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p><small>${esc(r.source)}</small><div><button class="primary" data-action="review-task" data-id="${r.id}">태스크에서 확인 ${icon('arrow', 13)}</button></div></article>`).join('') || empty('모두 확인했습니다.', '현재 남아 있는 확인 요청이 없습니다.')}</div><footer>${localPoc ? '저장된 판단을 다시 불러옵니다.' : '판단 결과는 이 화면에서만 유지됩니다.'}<button data-action="reset-reviews">초기화</button></footer></aside>` : ''; }
function folderBrowser(f: SourceFile) {
 const entries = f.folderId ? [...new Map(projects.flatMap(p=>p.files.filter(file=>file.folderId===f.folderId).map(file=>({p,file}))).map(entry=>[entry.file.id,entry])).values()].sort((a,b)=>a.file.name.localeCompare(b.file.name,'ko')) : projects.flatMap(p=>p.files.filter(file=>file===f).map(file=>({p,file})));
 return `<div class="folder-browser"><nav class="folder-breadcrumb" aria-label="자료 폴더 경로">${f.folderPath!.map(part=>`<span>${esc(part)}</span>`).join('<span aria-hidden="true"> / </span>')}</nav><p>관리장에 연결된 자료만</p><ul class="folder-files" aria-label="같은 폴더의 자료">${entries.map(({p,file})=>`<li><button data-action="folder-file" data-id="${esc(p.id)}" data-file="${esc(file.id)}" ${file.id===f.id?'aria-current="true"':''} ${file.previewable===false?'disabled':''}>${icon('file',16)}<span>${esc(file.name)}</span>${file.id===f.id?'<small>현재 자료</small>':''}</button></li>`).join('')}</ul>${f.folderUrl?`<a class="folder-open primary" href="${esc(f.folderUrl)}" target="_blank" rel="noopener noreferrer">폴더 열기 ${icon('external',13)}</a>`:''}</div>`;
}
function modal() {
    if (!state.modal)
        return '';
    const m = state.modal, p = projects.find(p => p.id === m.project)!;
    const f = p.files.find(f => f.id === m.file), t = p.tasks.find(t => t.id === m.task), s = t?.subtasks.find(s => s.id === m.subtask);
    const title = f?.name || s?.artifact || t?.title || p.name;
    return `<div class="modal-wrap"><div class="overlay-backdrop" data-action="close"></div><section class="file-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)} 미리보기"><header><div><strong>${esc(title)}</strong><small>${s ? `${s.owner} · ${fullDate(s.performedAt)}` : f ? `${f.source} · ${f.topic}` : p.name}</small></div><button class="icon-button" data-action="close" aria-label="미리보기 닫기">${icon('x', 18)}</button></header>${f?.folderPath?.length ? folderBrowser(f) : f?.url ? '' : `<img src="${asset(f ? fileThumb(f, p) : thumb(p))}" alt="${esc(title)} 관련 예시 이미지">`}<footer><p>${esc(s?.summary || f?.summary || t?.summary)}</p>${f?.url ? `<a class="primary" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.source)}에서 원본 열기 ${icon('arrow', 13)}</a>` : '<small>관련 내용을 보여 주는 예시 이미지입니다. 원본 서비스는 연결되지 않았습니다.</small>'}</footer></section></div>`;
}
function clockTime(value: string) { if (!value || !Number.isFinite(Date.parse(value))) return '시각 미상'; if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''; return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
function weekLabel(range: DateRange) { const [y, m, d] = range.start.split('-').map(Number); return `${y}년 ${m}월 ${d}일 – ${Number(range.end.slice(5, 7)) !== m ? `${Number(range.end.slice(5, 7))}월 ` : ''}${Number(range.end.slice(8))}일`; }
function taskReviews(taskId: string) { return completionReviews().filter(r => r.taskId === taskId && !state.reviewed.has(r.id)); }
function artifactButton(p: Project, t: Task, s: Subtask) { if (!s.sourceId) return ''; const disabled = p.files.find(f => f.id === s.sourceId)?.previewable === false; return `<button class="artifact-link" data-action="file" data-id="${p.id}" data-file="${s.sourceId}"${disabled ? ' disabled' : ''}>${icon('file', 14)}${esc(s.artifact)}${icon('external', 13)}</button>`; }
function executionEpisodes(p: Project, tasks: Task[]) {
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
function workNarrative(rows: RecordItem[]) { const tasks = [...new Map(rows.map(r => [r.task.id, r.task])).values()]; return tasks.map(t => { if (t.weeklySummary) return esc(t.weeklySummary); const own = rows.filter(r => r.task.id === t.id).sort((x, y) => Date.parse(y.subtask.performedAt) - Date.parse(x.subtask.performedAt)); const latest = own[0]?.subtask.title || ''; return esc(`${t.title} — ${latest}${own.length > 1 ? ` 외 ${own.length - 1}건` : ''}.`); }).join(' '); }
function workStatus(taskId: string) { const value = state.taskStates.get(taskId); return value ? `<span class="task-status ${value === '완료' ? 'status-complete' : 'status-ongoing'}">${esc(value)}</span>` : ''; }
function taskReviewForm(t: Task, p: Project) { const reviews = completionReviews().filter(r => r.taskId === t.id); return reviews.length ? `<section class="task-review-form" aria-label="태스크 완료 여부 확인">${reviews.map(r => { const answer = state.reviewAnswers.get(r.id); return `<div data-review-id="${r.id}"><h4>${esc(r.title)}</h4><p>${esc(r.desc)}</p><small>${esc(r.source)}</small><strong class="review-question">이 태스크가 끝난 게 맞나요?</strong><div class="review-answer-buttons"><button data-action="review-answer" data-id="${r.id}" data-value="완료" aria-pressed="${answer === '완료'}">맞아요 · 완료</button><button data-action="review-answer" data-id="${r.id}" data-value="진행 중" aria-pressed="${answer === '진행 중'}">아니요 · 진행 중</button></div>${answer ? `<p class="review-result" role="status">${answer === '완료' ? '완료한 작업으로 표시했습니다.' : '아직 진행 중인 작업으로 표시했습니다.'} 판단을 바꾸려면 다시 선택하세요.</p>` : ''}</div>`; }).join('')}</section>` : ''; }
function openTaskReview(id: string) { const r = completionReviews().find(r => r.id === id); if (!r)
    return; reveal(r.project, r.taskId); const panel = document.querySelector<HTMLElement>(`[data-review-id="${id}"]`); panel?.scrollIntoView({ block: 'center', behavior: 'instant' }); panel?.querySelector<HTMLElement>('button')?.focus(); }
function answerReview(id: string, value: string) { const r = completionReviews().find(r => r.id === id); if (!r || !['완료', '진행 중'].includes(value))
    return; if (localPoc) { void saveLocalReview(id, value); return; } state.reviewAnswers.set(id, value); state.taskStates.set(r.taskId, value); state.reviewed.add(id); render(`[data-action="review-answer"][data-id="${id}"][data-value="${value}"]`); }
let returnFocus: HTMLElement | null = null;
function render(focusKey = '') {
    const oldSources = document.querySelector<HTMLElement>('.source-scroll'), oldSourceProject = oldSources?.dataset.project, oldSourceTop = oldSources?.scrollTop ?? 0;
    const input = document.activeElement as HTMLInputElement, position = input?.id === 'homeSearch' ? input.selectionStart : null;
    document.body.dataset.theme = state.theme === 'linear-notion' ? 'linear' : state.theme;
    document.body.dataset.palette = state.theme === 'linear-notion' ? 'notion' : '';
    document.getElementById('app')!.innerHTML = header() + `<main id="main"><div class="page-heading"><div><div class="eyebrow">AX팀 업무 기록</div><h1>팀의 일, 한눈에.</h1><p>누가 어떤 일을 했는지, 프로젝트에서 작업 내역까지.</p></div><div class="heading-right">${activityPeople()}<span class="page-date">${icon('calendar', 14)} ${fullDate(AX_DATA.demoAsOf)} 기준</span></div></div>${weekly()}<section class="projects-section">${projectArea()}</section><footer class="page-footer"><span>AX 프로젝트 관리장</span><small>${esc(AX_DATA.demoNotice)}</small></footer></main>` + themePicker() + settingsDialog() + reviewDrawer() + modal();
    const newSources = document.querySelector<HTMLElement>('.source-scroll');
    if(newSources && newSources.dataset.project === oldSourceProject) newSources.scrollTop = oldSourceTop;
    const overlay = Boolean(state.reviews || state.modal || state.settingsOpen);
    const focusBlocked = overlay || state.themeOpen;
    document.querySelector('.skip-link')?.toggleAttribute('inert', focusBlocked);
    document.querySelector('.global-header')?.toggleAttribute('inert', focusBlocked);
    document.querySelector('main')?.toggleAttribute('inert', focusBlocked);
    document.querySelector('.theme-launcher')?.toggleAttribute('inert', state.themeOpen);
    document.querySelector('.theme-picker-anchor')?.toggleAttribute('inert', overlay);
    document.body.classList.toggle('overlay-open', overlay);
    if (focusKey === 'homeSearch') {
        const e = document.getElementById('homeSearch') as HTMLInputElement;
        e.focus();
        if (position !== null)
            e.setSelectionRange(position, position);
    }
    else if (focusKey)
        document.querySelector<HTMLElement>(focusKey)?.focus();
}
function reveal(id: string, task?: string) {
    state.settingsOpen = false;
    state.project = id;
    state.tab = 'topic';
    state.reviews = false;
    state.modal = null;

    state.topic = '전체';
    state.owner = '전체';
    state.query = '';
    if (task)
        state.expanded.add(task);
    if (state.airView === 'timeline')
        state.airView = 'grid';
    history.pushState(null, '', `#project/${id}`);
    render();
    document.getElementById(`project-${id}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function close() {
    state.settingsOpen = false;
    state.modal = null;
    state.reviews = false;
    state.themeOpen = false;
    render();
    if (returnFocus) {
        const selector = returnFocus.tagName + Array.from(returnFocus.classList).map(c => `.${CSS.escape(c)}`).join('') + Object.entries(returnFocus.dataset).map(([key, value]) => `[data-${key}="${CSS.escape(value!)}"]`).join('');
        document.querySelector<HTMLElement>(selector)?.focus();
    }
}
function action(el: HTMLElement) {
    const a = el.dataset.action, id = el.dataset.id || '', v = el.dataset.value || '';
    if (a === 'pilot-answer') { void savePilotReview(id, v); return; }
    if (a === 'home') {
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
    if (a === 'project') {
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
    if (a === 'task') {
        const t = el.dataset.task!;
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
    if (a === 'summary-unit') { state.summaryUnit = v; state.week = 0; render(`[data-action="summary-unit"][data-value="${v}"]`); return; }
    if (a === 'heatmap-day') { state.summaryUnit = 'day'; state.week = Math.round((Date.parse(v)-Date.parse(M.day(AX_DATA.demoAsOf)))/86400000); state.weekOwner = state.owner; render('#weekSelect'); document.querySelector('.weekly-section')?.scrollIntoView({block:'start'}); return; }
    if (a === 'week-person') {
        state.weekOwner = v;
        render(`[data-action="week-person"][data-value="${v}"]`);
        return;
    }
    if (a === 'episode-task') {
        state.tab = 'topic';
        state.expanded.add(el.dataset.task!);
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
        state.theme = v as Theme;
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
        if (localPoc) { void loadLocal().then(() => { saveStatus = '저장됨'; render(); }).catch(() => { saveStatus = '저장 실패 · 다시 시도'; render(); }); return; }
        state.reviewed.clear();
        state.reviewAnswers.clear();
        state.taskStates.clear();
    }
    if (a === 'folder-file') {
        const file = projects.find(p => p.id === id)?.files.find(f => f.id === el.dataset.file);
        if (!file || file.previewable === false) return;
        state.modal = {project:id,file:file.id};
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
            state.theme = t as Theme;
    }
    catch { }
    const fromHash = () => { state.project = projects.some(p => `#project/${p.id}` === location.hash) ? location.hash.split('/')[1] : ''; render(); };
    fromHash();
    window.addEventListener('popstate', fromHash);
    document.addEventListener('pointerdown', () => document.body.removeAttribute('data-keyboard-navigation'));
    document.addEventListener('click', event => {
        const target = event.target as HTMLElement, button = target.closest<HTMLElement>('[data-action]');
        if (button) {
            action(button);
            return;
        }
        if (state.themeOpen && !target.closest('.theme-picker-anchor')) {
            close();
        }
    });
    document.addEventListener('input', event => {
        const e = event.target as HTMLInputElement;
        if (e.id === 'homeSearch') {
            state.query = e.value;
            render('homeSearch');
        }
    });
    document.addEventListener('change', event => {
        const e = event.target as HTMLSelectElement;
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
        const target = event.target as HTMLElement;
        if (event.key === 'Tab' || event.key === '/')
            document.body.toggleAttribute('data-keyboard-navigation', true);
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (event.key === '/' && !state.themeOpen && !state.settingsOpen && !state.reviews && !state.modal && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
            event.preventDefault();
            document.getElementById('homeSearch')?.focus();
        }
        if (event.key === 'Tab' && (state.modal || state.reviews || state.settingsOpen || state.themeOpen)) {
            const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]'), els = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,[tabindex="0"]') || []), first = els[0], last = els.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
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
    const response = await fetch(pilotMode ? '/api/view?data=pilot' : realMode ? '/api/view?data=real' : '/api/view');
    if (!response.ok) throw new Error('load failed');
    const data = await response.json();
    projects.splice(0, projects.length, ...data.projects);
    AX_DATA.reviews = data.reviews;
    pilotReviews = data.pilotReviews || [];
    if (data.demoAsOf) AX_DATA.demoAsOf = data.demoAsOf;
    if (data.demoNotice) AX_DATA.demoNotice = data.demoNotice;
    state.reviewed.clear(); state.reviewAnswers.clear(); state.taskStates.clear();
    for (const task of data.taskStates) { localVersions.set(task.id, task.version); if (task.status === 'completed') state.taskStates.set(task.id, '완료'); }
    for (const r of data.decisions) { state.reviewed.add(r.review_id); state.reviewAnswers.set(r.review_id, r.decision); }
}
async function saveLocalReview(id: string, value: string) {
    if (saving || state.reviewed.has(id)) return;
    const review = completionReviews().find(r => r.id === id);
    if (!review) return;
    saving = true; saveStatus = '판단함 · 저장 중'; render();
    const key = id + ':' + value;
    if (!pendingDecisions.has(key)) pendingDecisions.set(key, crypto.randomUUID());
    try {
        const response = await fetch(realMode ? '/api/decision?data=real' : '/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_id: id, answer: value, change_id: pendingDecisions.get(key), expected_version: localVersions.get(review.taskId) }) });
        if (!response.ok) throw new Error('save failed');
        await loadLocal(); saveStatus = '저장됨';
    } catch { saveStatus = '저장 실패 · 다시 시도'; }
    saving = false; render();
}
if (localPoc) {
    loadLocal().then(() => { saveStatus = state.reviewed.size ? '저장됨' : ''; init(); }).catch(() => { saveStatus = '저장 실패 · 다시 시도'; projects.splice(0); AX_DATA.reviews = []; init(); });
} else init();

function pilotReviewCards() { return pilotReviews.map(r => '<article class="review-record"><h3>' + esc(r.proposal || r.kind) + '</h3><p>' + esc((r.candidate_task_ids || []).join(', ')) + '</p><div>' + (r.kind === 'link' ? '<button data-action="pilot-answer" data-id="' + esc(r.id) + '" data-value="accepted">제안 확정</button><button data-action="pilot-answer" data-id="' + esc(r.id) + '" data-value="corrected">태스크 변경</button>' : '') + '<button data-action="pilot-answer" data-id="' + esc(r.id) + '" data-value="unable">판단 불가</button></div></article>').join(''); }
async function savePilotReview(id: string, answer: string) {
    if (saving) return;
    const review = pilotReviews.find(r => r.id === id); if (!review) return;
    const task = answer === 'corrected' ? window.prompt('연결할 태스크 ID') : undefined;
    if (answer === 'corrected' && !task) return;
    saving = true;
    const key = id + ':' + answer + ':' + (task || '');
    if (!pendingDecisions.has(key)) pendingDecisions.set(key, crypto.randomUUID());
    try {
        const response = await fetch('/api/pilot-decision', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({review_id:id,answer,task_id:task,expected_version:review.version,change_id:pendingDecisions.get(key)})});
        if (!response.ok) throw new Error('save failed');
        await loadLocal(); saveStatus = '저장됨';
    } catch { saveStatus = '저장 실패 · 다시 시도'; }
    saving = false; render();
}
