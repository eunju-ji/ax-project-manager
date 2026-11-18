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
const M = AXModel, projects = AX_DATA.projects;
const THEMES = [{ id: 'linear', name: 'Linear', hint: '이슈 목록 · 속성 레일' }, { id: 'linear-notion', name: 'Linear · Notion 색상', hint: 'Linear 구조 · Notion 팔레트' }, { id: 'notion', name: 'Notion', hint: '문서 · 갤러리 · 타임라인' }, { id: 'attio', name: 'Attio', hint: '레코드 · 관계 속성' }, { id: 'airtable', name: 'Airtable', hint: '베이스 · Views · 그리드' }, { id: 'clickup', name: 'ClickUp', hint: '보드 · 담당자별 업무' }];
const state = { theme: 'linear', query: '', topic: '전체', owner: '전체', week: 0, project: '', tab: 'topic', expanded: new Set(), themeOpen: false, settingsOpen: false, integration: '', weekOwner: '전체', timelineMonth: 0, reviews: false, reviewed: new Set(), reviewAnswers: new Map(), taskStates: new Map(), modal: null, airView: 'grid', hideFields: false, grouped: false };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asset = (k) => AX_ASSETS[k] || `assets/${k}.png`;
const thumb = (p) => ({ ax: 'architecture', media: 'report', dashboard: 'dashboard', interview: 'document', pipeline: 'pipeline', taskmail: 'timeline', customer: 'wireframe' }[p.id] || 'document');
const fileThumb = (f, p) => /구조|아키텍처/.test(f.name) ? 'architecture' : /시안|화면/.test(f.name) ? 'dashboard' : /연결표|작업/.test(f.name) ? 'timeline' : thumb(p);
const avatar = (n) => `<span class="avatar avatar-${n === '김지현' ? 1 : n === '박성진' ? 2 : 3}" aria-hidden="true">${esc(n.slice(0, 1))}</span>`;
const date = (s) => s ? M.day(s).slice(5).replace('-', '.') : '—';
const fullDate = (s) => s ? M.day(s).replaceAll('-', '.') : '—';
const week = () => M.weekRange(AX_DATA.demoAsOf, state.week);
const reviewCount = (id) => AX_DATA.reviews.filter(r => !state.reviewed.has(r.id) && (!id || r.project === id)).length;
const count = (p) => p.tasks.reduce((n, t) => n + t.subtasks.length, 0);
const people = (p) => [...new Set(p.tasks.flatMap(t => t.subtasks.map(s => s.owner)))];
const tag = (s, c = '') => `<span class="tag ${c}">${esc(s)}</span>`;
const empty = (s, body) => `<div class="empty">${icon('search', 24)}<strong>${s}</strong><p>${body}</p></div>`;
function filtered() { return M.sortProjects(projects.filter(p => p.tasks.some(t => (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.subtasks.some(s => s.owner === state.owner))) && (!state.query || [p.name, p.desc, ...p.tasks.flatMap(t => [t.title, ...t.subtasks.map(s => s.title)])].join(' ').toLowerCase().includes(state.query.toLowerCase())))); }
function records() { return M.weekRecords(projects, week()).filter(r => state.weekOwner === '전체' || r.subtask.owner === state.weekOwner); }
function header() {
    return `<header class="global-header"><button class="brand" data-action="home" aria-label="프로젝트 홈으로 돌아가기"><span class="brand-symbol">AX</span><strong>프로젝트 관리장</strong></button><span class="header-divider"></span><span class="breadcrumb">${icon('layers', 16)} AX팀 <span>/</span><b>프로젝트</b></span><div class="header-right"><span class="demo-mark"><i></i>예시 데이터</span><button class="review-trigger ${reviewCount() ? 'needs-review' : ''}" data-action="reviews" aria-haspopup="dialog">${icon('bell', 17)} 검토 필요 <b>${reviewCount()}</b></button><button class="settings-trigger icon-button" data-action="settings" aria-label="설정 및 서비스 연동" title="설정 및 서비스 연동">${icon('settings', 21)}</button></div></header>`;
}
function weekly() {
    const rows = records(), owners = ['전체', '김지현', '박성진', '이수민'];
    const offsets = [...new Set([state.week, ...Array.from({ length: 26 }, (_, i) => -i)])].sort((a, b) => b - a);
    const groups = projects.map(project => ({ project, rows: rows.filter(r => r.project.id === project.id) })).filter(g => g.rows.length);
    const distribution = M.categories.map((category, i) => ({ category, index: i, count: rows.filter(r => r.task.topic === category).length }));
    const visibleOwners = state.weekOwner === '전체' ? owners.slice(1) : [state.weekOwner];
    return `<section class="weekly-section" aria-labelledby="weekly-heading"><div class="section-top weekly-header"><div class="weekly-heading-date"><h2 id="weekly-heading">한 주의 업무</h2><div class="week-control"><button class="icon-button" data-action="week" data-step="-1" aria-label="이전 주">${icon('back', 15)}</button><label class="week-select"><span class="sr-only">요약 주간 선택</span><select id="weekSelect">${offsets.map(offset => { const w = M.weekRange(AX_DATA.demoAsOf, offset); return `<option value="${offset}" ${state.week === offset ? 'selected' : ''}>${weekLabel(w)}</option>`; }).join('')}</select></label><button class="icon-button" data-action="week" data-step="1" aria-label="다음 주" ${state.week === 0 ? 'disabled' : ''}>${icon('arrow', 15)}</button></div></div><div class="weekly-person-tabs" aria-label="주간 요약 담당자 선택">${owners.map(owner => `<button data-action="week-person" data-value="${owner}" class="${state.weekOwner === owner ? 'active' : ''}" aria-pressed="${state.weekOwner === owner}">${owner}</button>`).join('')}</div></div><div class="weekly-layout"><div class="week-summary"><span class="summary-caption">${icon('chart', 18)} ${state.weekOwner === '전체' ? '팀 전체' : esc(state.weekOwner)} 업무 요약</span><div class="summary-number"><span class="summary-main-icon">${icon('deliverable', 25)}</span><strong>${rows.length}</strong><span class="summary-unit">건의 작업 내역</span></div><div class="summary-meta"><span>${icon('folder', 18)}<b>${groups.length}</b>개 프로젝트</span><span>${icon('people', 18)}<b>${new Set(rows.map(r => r.subtask.owner)).size}</b>명 참여</span></div><div class="summary-task-count">${icon('layers', 18)}<span>태스크 <strong>${new Set(rows.map(r => r.task.id)).size}</strong>개</span></div></div><div class="weekly-content"><div class="weekly-report" tabindex="0" role="region" aria-label="주간 업무 요약 내용">${groups.map(g => `<article class="weekly-project-summary"><header><button data-action="reveal" data-id="${g.project.id}">${esc(g.project.name)}</button><span>${g.rows.length}건</span></header><p class="weekly-prose">${workNarrative(g.rows)}</p><details class="weekly-details"><summary>작업 내역 ${g.rows.length}건 보기</summary><ul>${g.rows.map(r => `<li><button data-action="record" data-id="${g.project.id}" data-task="${r.task.id}"><strong>${esc(r.subtask.title)}</strong><span>${esc(r.subtask.owner)} · ${clockTime(r.subtask.performedAt)}</span></button></li>`).join('')}</ul></details></article>`).join('') || '<p class="no-activity">기록된 업무가 없습니다.</p>'}</div></div><aside class="weekly-visual"><div class="work-distribution"><h3>업무 유형별 작업 내역</h3><div class="distribution-bar" role="img" aria-label="${distribution.map(d => `${d.category} ${d.count}건`).join(', ')}">${distribution.filter(d => d.count).map(d => `<i class="category-${d.index}" style="width:${d.count / Math.max(rows.length, 1) * 100}%" title="${d.category} ${d.count}건"></i>`).join('')}</div><div class="distribution-legend">${distribution.filter(d => d.count).map(d => `<span><i class="record-dot category-${d.index}"></i>${d.category}<b>${d.count}</b></span>`).join('') || '<span>기록 없음</span>'}</div></div><div class="weekly-owner-table"><h3>담당자별 작업</h3><table><thead><tr><th>담당자</th><th>작업 내역</th><th>태스크</th><th>확인 요청</th></tr></thead><tbody>${visibleOwners.map(owner => { const mine = rows.filter(r => r.subtask.owner === owner), tasks = new Set(mine.map(r => r.task.id)), review = AX_DATA.reviews.filter(r => !state.reviewed.has(r.id) && tasks.has(r.taskId)).length; return `<tr><th>${owner}</th><td><span class="owner-count">${mine.length}건<i style="width:${mine.length / Math.max(rows.length, 1) * 100}%"></i></span></td><td>${tasks.size}개</td><td class="${review ? 'has-review' : ''}">${review}건</td></tr>`; }).join('')}</tbody></table></div></aside></div></section>`;
}
function projectToolbar() { return `<div class="project-toolbar"><strong class="project-list-label">모든 프로젝트 <span>${projects.length}</span></strong><div class="toolbar-filters"><label class="searchbox">${icon('search', 16)}<input id="homeSearch" aria-label="프로젝트·태스크 검색" placeholder="프로젝트·태스크 검색" value="${esc(state.query)}"><kbd>/</kbd></label><label class="select-filter"><span class="sr-only">담당자</span><select id="ownerFilter">${['전체', '김지현', '박성진', '이수민'].map(x => `<option ${state.owner === x ? 'selected' : ''} value="${x}">${x === '전체' ? '모든 담당자' : x}</option>`).join('')}</select></label></div></div><div class="project-sort-note">${icon('sort', 14)} 최근 생긴 태스크부터</div>`; }
function projectButton(p, i, variant = 'row') { const open = state.project === p.id; return `<button class="project-toggle ${variant} ${open ? 'selected' : ''}" data-action="project" data-id="${p.id}" aria-expanded="${open}" aria-controls="project-${p.id}"><span class="project-name-cell"><span class="expand-chevron">${icon('chevron', 14)}</span><span class="project-glyph glyph-${i % 5}">${icon('folder', 16)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.desc)}</small></span></span><span class="people-cell">${people(p).map(avatar).join('')}</span><span class="number-cell">${p.tasks.length}</span><span class="number-cell secondary-field">${count(p)}</span><time>${date(M.latestTask(p))}</time><span class="secondary-field">${reviewCount(p.id) ? tag(`검토 ${reviewCount(p.id)}`, 'review-tag') : '—'}</span></button>`; }
function expanded(p) { return state.project === p.id ? `<div class="inline-project" id="project-${p.id}">${projectDetail(p)}</div>` : ''; }
const tableHead = () => `<div class="table-labels"><span>프로젝트</span><span>참여자</span><span>태스크</span><span>작업 내역</span><span>최근 태스크</span><span>검토</span></div>`;
function linearList(list) { return `<div class="linear-layout"><section class="project-table">${tableHead()}${list.map((p, i) => `<article class="project-entry">${projectButton(p, i)}${expanded(p)}</article>`).join('')}</section><aside class="project-right-rail">${activityPeople(list)}</aside></div>`; }
function activityPeople(list) {
    const activity = list.flatMap(p => p.tasks.map(t => ({ p, t, at: t.subtasks.reduce((latest, s) => Date.parse(s.performedAt) > Date.parse(latest) ? s.performedAt : latest, t.createdAt) }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
    return `<section class="rail-activity"><header><span>ACTIVITY</span>${icon('clock', 15)}</header><div class="activity-timeline">${activity.map(({ p, t, at }) => `<button data-action="record" data-id="${p.id}" data-task="${t.id}"><i></i><strong>${esc(t.title)}</strong><small>${esc(p.name)} · ${esc(t.owner)}</small><time class="activity-time" datetime="${at}">${clockTime(at)}</time></button>`).join('') || '<p class="no-activity">최근 태스크가 없습니다.</p>'}</div></section><section class="rail-people"><div class="rail-people-main"><span class="eyebrow">PEOPLE</span><h3>함께하는 사람</h3>${['김지현', '박성진', '이수민'].map(o => `<button class="rail-person" data-action="owner" data-value="${o}">${avatar(o)}<strong>${o}</strong><small>${projects.filter(p => people(p).includes(o)).length}개 프로젝트</small></button>`).join('')}</div><p class="rail-sort-description">${icon('clock', 14)} 최근 태스크 생성일을 기준으로 정렬합니다.</p></section>`;
}
function gallery(list) { return `<div class="project-gallery">${list.map(p => `<article class="gallery-project ${state.project === p.id ? 'is-open' : ''}"><button class="gallery-toggle" data-action="project" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-controls="project-${p.id}"><div class="project-cover"><img src="${asset(thumb(p))}" alt="${esc(p.name)} 관련 자료"></div><div class="gallery-copy"><span class="gallery-icon">${icon('folder', 19)}</span><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><dl><div><dt>참여자</dt><dd>${people(p).map(avatar).join('')}</dd></div><div><dt>최근 태스크</dt><dd>${fullDate(M.latestTask(p))}</dd></div></dl><footer><span>${p.tasks.length}개 태스크 · ${count(p)}건의 작업 내역</span>${icon('chevron', 14)}</footer></div></button>${expanded(p)}</article>`).join('')}</div>`; }
function attioList(list) { return `<div class="attio-directory"><div class="directory-caption">${icon('layers', 15)} 전체 레코드 <span>${list.length}</span><small>작업 생성일 ↓</small></div><div class="project-table">${tableHead()}${list.map((p, i) => `<article class="project-entry">${projectButton(p, i, 'record-row')}${expanded(p)}</article>`).join('')}</div><div class="directory-foot">${list.length}개 레코드 <span>${list.reduce((n, p) => n + count(p), 0)}건의 작업 내역</span></div></div>`; }
function airGrid(list) { const groups = state.grouped ? ['검토 필요', '검토 없음'] : ['전체']; return `<div class="air-grid ${state.hideFields ? 'hide-fields' : ''}"><div class="table-scroll"><div class="project-table">${tableHead()}${groups.map(label => { const rows = label === '전체' ? list : list.filter(p => label === '검토 필요' ? reviewCount(p.id) > 0 : reviewCount(p.id) === 0); return `${state.grouped ? `<div class="air-group">${label} · ${rows.length}개</div>` : ''}${rows.map((p, i) => `<article class="project-entry">${projectButton(p, i, 'grid-row')}${expanded(p)}</article>`).join('')}`; }).join('')}</div></div><div class="directory-foot">${list.length}개 프로젝트</div></div>`; }
function airBase(list) { return `<div class="air-base"><header class="air-base-title"><span class="air-base-icon">${icon('layers', 24)}</span><div><h3>AX 프로젝트 베이스</h3><p>프로젝트와 연결된 작업 내역</p></div><span class="air-base-label">${list.length}개 프로젝트</span></header><div class="air-table-tabs"><span>프로젝트</span><small>팀 공통 업무 기록</small></div><div class="air-base-layout"><nav class="air-views" aria-label="프로젝트 보기"><h4>Views</h4>${[['grid', 'grid', '그리드'], ['gallery', 'columns', '갤러리'], ['timeline', 'calendar', '타임라인']].map(([id, ico, label]) => `<button data-action="airview" data-value="${id}" class="${state.airView === id ? 'active' : ''}">${icon(ico, 15)} ${label}</button>`).join('')}<button data-action="clear">모든 프로젝트</button></nav><section class="air-canvas"><div class="air-tools"><strong>${state.airView === 'grid' ? '그리드' : state.airView === 'gallery' ? '갤러리' : '타임라인'} 보기</strong>${state.airView === 'grid' ? `<button data-action="fields" aria-pressed="${state.hideFields}">${icon('columns', 14)} ${state.hideFields ? '전체 필드' : '필드 숨기기'}</button><button data-action="group" aria-pressed="${state.grouped}">${icon('layers', 14)} ${state.grouped ? '그룹 해제' : '검토 여부로 묶기'}</button>` : ''}</div>${state.airView === 'grid' ? airGrid(list) : state.airView === 'gallery' ? gallery(list) : timeline(list, true)}</section></div></div>`; }
function clickupBoard(list) { return `<div class="resource-board">${list.map((p, i) => `<article class="board-project ${state.project === p.id ? 'is-open' : ''}"><button class="board-toggle" data-action="project" data-id="${p.id}" aria-expanded="${state.project === p.id}" aria-controls="project-${p.id}"><div class="board-card-top"><span class="project-glyph glyph-${i % 5}">${icon('folder', 17)}</span>${reviewCount(p.id) ? tag(`검토 ${reviewCount(p.id)}`, 'review-tag') : ''}</div><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="board-activity"><strong>${count(p)}</strong><span>작업 내역</span><small>${p.tasks.length}개 태스크</small></div><footer><span>${people(p).map(avatar).join('')}</span><time>최근 태스크 ${date(M.latestTask(p))}</time></footer></button>${expanded(p)}</article>`).join('')}</div>`; }
function timeline(list, inside = false) {
    const month = M.monthRange(AX_DATA.demoAsOf, state.timelineMonth), days = month.days;
    const today = M.day(AX_DATA.demoAsOf), todayIndex = Math.round((Date.parse(today) - Date.parse(month.start)) / 86400000);
    const todayVisible = todayIndex >= 0 && todayIndex < days, todayLeft = (todayIndex + .5) / days * 100;
    const ticks = [1, 5, 10, 15, 20, 25, ...(days >= 30 ? [30] : [days])];
    return `<section class="timeline-section calendar-month ${inside ? 'inside' : ''}" aria-label="프로젝트 타임라인"><div class="section-top"><div><span class="eyebrow">PROJECT TIMELINE</span><h2>${icon('calendar', 16)} 프로젝트 타임라인</h2></div><div class="month-controls"><button class="icon-button" data-action="timeline-month" data-step="-1" aria-label="이전 달">${icon('back', 14)}</button><span>${month.label}</span><button class="icon-button" data-action="timeline-month" data-step="1" aria-label="다음 달">${icon('arrow', 14)}</button></div></div><div class="timeline-scroll"><div class="timeline-grid"><div class="timeline-head"><span>프로젝트</span><div class="month-axis">${ticks.map(d => `<span style="left:${(d - 1) / days * 100}%">${d}일</span>`).join('')}${todayVisible ? `<b class="today-label" style="left:${todayLeft}%">오늘</b>` : ''}</div></div>${list.map((p, i) => {
        const range = M.projectRange(p);
        if (!range)
            return '';
        const from = Math.round((Date.parse(range.start) - Date.parse(month.start)) / 86400000), to = Math.round((Date.parse(range.end) - Date.parse(month.start)) / 86400000);
        const left = Math.max(0, from) / days * 100, right = Math.min(days, to + 1) / days * 100;
        return `<div class="timeline-row"><button data-action="reveal" data-id="${p.id}"><span class="project-glyph glyph-${i % 5}">${icon('folder', 13)}</span>${esc(p.name)}</button><div class="timeline-lane" style="--month-days:${days}">${todayVisible ? `<span class="today-line" style="left:${todayLeft}%" title="오늘 ${fullDate(today)}"></span>` : ''}${right > left ? `<button class="timeline-bar bar-${i % 3}" style="left:${left}%;width:${right - left}%" data-action="reveal" data-id="${p.id}" aria-label="${esc(p.name)} ${range.start}부터 ${range.end}까지"><span>${from < 0 ? `<b class="timeline-continuation" title="${fullDate(range.start)}부터 이어진 프로젝트">← ${date(range.start)}부터</b>` : ''}${esc(p.name)}</span><small>${count(p)}건</small></button>` : `<span class="timeline-outside">이 달의 기록 없음 · ${date(range.start)} — ${date(range.end)}</span>`}</div></div>`;
    }).join('')}</div></div><p class="timeline-foot">${month.label} · 작업 생성부터 최근 태스크 내역까지</p></section>`;
}
function taskItem(t, p) {
    const open = state.expanded.has(t.id), pending = taskReviews(t.id);
    return `<article class="task-item ${open ? 'is-expanded' : ''}"><button class="task-toggle" data-action="task" data-task="${t.id}" aria-expanded="${open}" aria-controls="task-${t.id}"><span class="expand-chevron">${icon('chevron', 14)}</span><code>${t.id}</code><span class="task-copy"><strong>${esc(t.title)} ${workStatus(t.id)} ${pending.length ? `<span class="task-review-marker">${icon('bell', 12)} 검토 필요 ${pending.length}</span>` : ''}</strong><small>${esc(t.summary)}</small></span><span class="task-output-count">${t.subtasks.length}건의 작업 내역</span><time>${date(t.createdAt)}</time></button>${open ? `<div class="task-expanded" id="task-${t.id}">${taskReviewForm(t, p)}<p class="task-description">${esc(t.detail)}</p><div class="subtask-heading"><span>작업 내역</span><small>담당자 / 기록 시각 / 관련 자료</small></div><div class="subtask-list">${t.subtasks.map(s => `<article class="subtask-row"><span class="subtask-branch">└</span><div><strong>${esc(s.title)}</strong><div class="subtask-execution-log"><span class="execution-log-label">작업 내역</span><time datetime="${s.performedAt}">${clockTime(s.performedAt)}</time><p>${esc(s.summary)}</p></div>${artifactButton(p, t, s)}</div><span class="subtask-person">${avatar(s.owner)}${esc(s.owner)}</span></article>`).join('')}</div><div class="task-decision"><span>${icon('info', 14)} 결정사항</span><p>${esc(t.decision)}</p></div></div>` : ''}</article>`;
}
function taskPanel(p) {
    const tasks = p.tasks.filter(t => (state.topic === '전체' || t.topic === state.topic) && (state.owner === '전체' || t.subtasks.some(s => s.owner === state.owner)));
    return `<section class="work-section"><div class="work-section-header"><h3>태스크 <span>${tasks.length}</span></h3><div class="view-tabs" role="tablist" aria-label="작업 보기">${[['topic', '주제별'], ['episode', '에피소드별']].map(([id, title]) => `<button role="tab" aria-selected="${state.tab === id}" data-action="tab" data-value="${id}" class="${state.tab === id ? 'active' : ''}">${title}</button>`).join('')}</div></div><div class="work-body">${state.tab === 'topic' ? M.categories.map(c => { const ts = tasks.filter(t => t.topic === c); return ts.length ? `<section class="task-group"><h4><i class="record-dot category-${M.categories.indexOf(c)}"></i>${c}<span>${ts.length}</span></h4>${ts.map(t => taskItem(t, p)).join('')}</section>` : ''; }).join('') : executionEpisodes(p, tasks)}</div></section>`;
}
function sources(p) {
    const files = M.sortedSources(p.files), repos = p.files.filter(f => f.source === 'GitHub').length;
    return `<aside class="source-rail"><section class="sources"><div class="source-heading"><h3>관련 자료</h3><span>${p.files.length - repos}개 문서${repos ? ` · ${repos}개 저장소` : ''}</span></div><p class="source-caption">작업 내역의 관련 자료 포함 · 주제별 최신순</p><div class="source-scroll" data-project="${p.id}" tabindex="0" role="region" aria-label="관련 자료 목록">${M.categories.map(c => { const fs = files.filter(f => f.topic === c); return fs.length ? `<div class="source-group"><h4>${c}</h4>${fs.map(f => `<button class="source-row" data-action="file" data-id="${p.id}" data-file="${f.id}" aria-label="${esc(f.name)} 미리보기"><span class="source-kind ${f.source === 'GitHub' ? 'repository' : ''}">${f.source === 'GitHub' ? '저장소' : '문서'}</span><span class="source-info"><strong>${esc(f.name)}</strong><small>${esc(f.source)} · ${f.subtaskId ? '작업 내역 자료' : '프로젝트 자료'} · ${date(f.createdAt)}</small></span>${icon('external', 16)}</button>`).join('')}</div>` : ''; }).join('')}</div></section><section class="project-properties"><h3>프로젝트 속성</h3><dl><div><dt>참여자</dt><dd>${people(p).map(avatar).join('')}</dd></div><div><dt>최근 태스크</dt><dd>${fullDate(M.latestTask(p))}</dd></div><div><dt>작업 내역</dt><dd>${count(p)}건</dd></div></dl></section></aside>`;
}
function projectDetail(p) {
    const pending = AX_DATA.reviews.filter(r => r.project === p.id && !state.reviewed.has(r.id));
    return `<section class="project-detail" aria-label="${esc(p.name)} 내용"><header class="inline-detail-head"><div><span class="eyebrow">${p.id.toUpperCase()} / PROJECT</span><h2>${esc(p.name)}</h2><p>${esc(p.desc)}</p></div><button class="icon-button" data-action="project" data-id="${p.id}" aria-label="프로젝트 접기">${icon('x', 18)}</button></header>${pending.length ? `<div class="project-review-alert"><div>${icon('bell', 19)}<strong>검토가 필요한 사항 ${pending.length}건</strong></div>${pending.map(r => `<button data-action="review-task" data-id="${r.id}"><span>${esc(r.title)}</span>${icon('arrow', 15)}</button>`).join('')}</div>` : ''}<div class="project-local-timeline">${timeline([p], true)}</div><div class="detail-layout">${taskPanel(p)}${sources(p)}</div></section>`;
}
function projectArea() { const list = filtered(); return `<div class="section-top project-section-top"><div><span class="eyebrow">PROJECTS</span><h2>전체 프로젝트 <span>${list.length}</span></h2></div><span class="section-note">프로젝트를 눌러 업무 기록을 펼쳐 보세요</span></div>${projectToolbar()}<div id="project-results">${list.length ? ({ linear: linearList, 'linear-notion': linearList, notion: gallery, attio: attioList, airtable: airBase, clickup: clickupBoard }[state.theme])(list) : empty('검색 결과가 없습니다.', '검색어나 필터를 바꿔 보세요.')}<div class="results-count" aria-live="polite">${list.length}개 프로젝트${list.length === 0 ? ' · <button data-action="clear">필터 초기화</button>' : ''}</div></div>${timeline(list)}`; }
function themePicker() { const mini = (id) => `<span class="theme-mini mini-${id}"><i></i><b></b><b></b><b></b></span>`; return `<div class="theme-picker-anchor">${state.themeOpen ? `<div class="theme-menu" role="dialog" aria-label="UI 테마 선택"><header><strong>화면 테마</strong><small>업무에 맞는 화면으로 살펴보세요</small></header>${THEMES.map(t => `<button class="theme-choice ${t.id === state.theme ? 'selected' : ''}" data-action="theme" data-value="${t.id}">${mini(t.id)}<span><strong>${t.name}</strong><small>${t.hint}</small></span>${t.id === state.theme ? icon('check', 15) : ''}</button>`).join('')}</div>` : ''}<button class="theme-launcher" data-action="themes" aria-expanded="${state.themeOpen}">${mini(state.theme)}<span><strong>${THEMES.find(t => t.id === state.theme).name}</strong><small>화면 테마</small></span>${icon('chevron', 14)}</button></div>`; }
function reviewDrawer() { return state.reviews ? `<div class="overlay-backdrop" data-action="close"></div><aside class="review-drawer" role="dialog" aria-modal="true" aria-label="검토함"><header><div><span class="eyebrow">REVIEW INBOX</span><h2>확인할 일 <span>${reviewCount()}</span></h2></div><button class="icon-button" data-action="close" aria-label="검토함 닫기">${icon('x', 18)}</button></header><p class="drawer-caption">각 태스크에서 근거를 보고, 끝난 일이 맞는지 확인해 주세요.</p><div class="drawer-scroll">${AX_DATA.reviews.filter(r => !state.reviewed.has(r.id)).map(r => `<article class="review-record">${tag(projects.find(p => p.id === r.project)?.name || '')}<h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p><small>${esc(r.source)}</small><div><button class="primary" data-action="review-task" data-id="${r.id}">태스크에서 확인 ${icon('arrow', 13)}</button></div></article>`).join('') || empty('모두 확인했습니다.', '현재 남아 있는 확인 요청이 없습니다.')}</div><footer>판단 결과는 이 화면에서만 유지됩니다.<button data-action="reset-reviews">초기화</button></footer></aside>` : ''; }
function modal() {
    if (!state.modal)
        return '';
    const m = state.modal, p = projects.find(p => p.id === m.project);
    const f = p.files.find(f => f.id === m.file), t = p.tasks.find(t => t.id === m.task), s = t?.subtasks.find(s => s.id === m.subtask);
    const title = f?.name || s?.artifact || t?.title || p.name;
    return `<div class="modal-wrap"><div class="overlay-backdrop" data-action="close"></div><section class="file-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)} 미리보기"><header><div><strong>${esc(title)}</strong><small>${s ? `${s.owner} · ${fullDate(s.performedAt)}` : f ? `${f.source} · ${f.topic}` : p.name}</small></div><button class="icon-button" data-action="close" aria-label="미리보기 닫기">${icon('x', 18)}</button></header><img src="${asset(f ? fileThumb(f, p) : thumb(p))}" alt="${esc(title)} 관련 예시 이미지"><footer><p>${esc(s?.summary || f?.summary || t?.summary)}</p><small>관련 내용을 보여 주는 예시 이미지입니다. 원본 서비스는 연결되지 않았습니다.</small></footer></section></div>`;
}
function clockTime(value) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
function weekLabel(range) { const [y, m, d] = range.start.split('-').map(Number); return `${y}년 ${m}월 ${d}일 – ${Number(range.end.slice(5, 7)) !== m ? `${Number(range.end.slice(5, 7))}월 ` : ''}${Number(range.end.slice(8))}일`; }
function taskReviews(taskId) { return AX_DATA.reviews.filter(r => r.taskId === taskId && !state.reviewed.has(r.id)); }
function artifactButton(p, t, s) { return `<button class="artifact-link" data-action="file" data-id="${p.id}" data-file="${s.sourceId}">${icon('file', 14)}${esc(s.artifact)}${icon('external', 13)}</button>`; }
function executionEpisodes(p, tasks) {
    const entries = tasks.flatMap(task => task.subtasks.map(subtask => ({ task, subtask }))).filter(r => state.owner === '전체' || r.subtask.owner === state.owner).sort((a, b) => Date.parse(b.subtask.performedAt) - Date.parse(a.subtask.performedAt));
    const dates = [...new Set(entries.map(r => M.day(r.subtask.performedAt)))];
    return `<div class="execution-episodes"><p class="episode-description">태스크별 작업 내역을 최신순으로 모았습니다.</p>${dates.map(day => `<section class="execution-day"><h4>${fullDate(day)}</h4>${entries.filter(r => M.day(r.subtask.performedAt) === day).map(({ task, subtask: s }) => `<article class="execution-entry"><div class="execution-time"><time datetime="${s.performedAt}">${clockTime(s.performedAt).split(' ').at(-1)}</time><span>${esc(s.owner)}</span></div><div class="execution-body"><span class="execution-parent">${esc(task.title)} · ${task.id}</span><h4>${esc(s.title)}</h4><p>${esc(s.summary)}</p>${artifactButton(p, task, s)}<button class="execution-task-link" data-action="episode-task" data-task="${task.id}">태스크에서 보기 ${icon('arrow', 13)}</button></div></article>`).join('')}</section>`).join('') || empty('해당하는 작업 내역이 없습니다.', '선택한 담당자의 기록을 확인해 보세요.')}</div>`;
}
function settingsDialog() {
    if (!state.settingsOpen)
        return '';
    const integrations = [{ id: 'gws', name: 'Google Workspace', description: 'Drive 문서, Gmail, Sheets 등 업무 자료', initial: 'G' }, { id: 'github', name: 'GitHub', description: '저장소, 커밋, 이슈 등 개발 기록', initial: 'GH' }];
    return `<div class="overlay-backdrop" data-action="close"></div><section class="settings-dialog" role="dialog" aria-modal="true" aria-label="설정 및 서비스 연동"><header><div><span class="eyebrow">SETTINGS</span><h2>설정</h2></div><button class="icon-button" data-action="close" aria-label="설정 닫기">${icon('x', 20)}</button></header><div class="settings-body"><h3>서비스 연동</h3><p>프로젝트에 필요한 업무 자료를 연결하는 공간입니다.</p>${integrations.map(i => `<article class="integration-card"><div class="integration-logo">${i.initial}</div><div><h4>${i.name}</h4><p>${i.description}</p><small>연결되지 않음</small></div><button data-action="integration" data-value="${i.id}" aria-expanded="${state.integration === i.id}">설정 보기</button>${state.integration === i.id ? `<div class="integration-detail"><strong>${i.name} 연결 설정</strong><p>연동 화면을 준비 중입니다. 이 실행본에서는 계정 연결이나 외부 자료 조회를 수행하지 않습니다.</p></div>` : ''}</article>`).join('')}<div class="settings-note">연동할 서비스와 접근 범위를 확인한 뒤 연결할 수 있도록 구성할 예정입니다.</div></div></section>`;
}
function workNarrative(rows) { const tasks = [...new Map(rows.map(r => [r.task.id, r.task])).values()]; return tasks.map(t => esc(t.weeklySummary || `${t.title}에 필요한 내용을 정리했습니다.`)).join(' '); }
function workStatus(taskId) { const value = state.taskStates.get(taskId); return value ? `<span class="task-status ${value === '완료' ? 'status-complete' : 'status-ongoing'}">${esc(value)}</span>` : ''; }
function taskReviewForm(t, p) { const reviews = AX_DATA.reviews.filter(r => r.taskId === t.id); return reviews.length ? `<section class="task-review-form" aria-label="태스크 완료 여부 확인">${reviews.map(r => { const answer = state.reviewAnswers.get(r.id); return `<div data-review-id="${r.id}"><h4>${esc(r.title)}</h4><p>${esc(r.desc)}</p><small>${esc(r.source)}</small><strong class="review-question">이 태스크가 끝난 게 맞나요?</strong><div class="review-answer-buttons"><button data-action="review-answer" data-id="${r.id}" data-value="완료" aria-pressed="${answer === '완료'}">맞아요 · 완료</button><button data-action="review-answer" data-id="${r.id}" data-value="진행 중" aria-pressed="${answer === '진행 중'}">아니요 · 진행 중</button></div>${answer ? `<p class="review-result" role="status">${answer === '완료' ? '완료한 작업으로 표시했습니다.' : '아직 진행 중인 작업으로 표시했습니다.'} 판단을 바꾸려면 다시 선택하세요.</p>` : ''}</div>`; }).join('')}</section>` : ''; }
function openTaskReview(id) {
    const r = AX_DATA.reviews.find(r => r.id === id);
    if (!r)
        return;
    reveal(r.project, r.taskId);
    const panel = document.querySelector(`[data-review-id="${id}"]`);
    panel?.scrollIntoView({ block: 'center', behavior: 'instant' });
    panel?.querySelector('button')?.focus();
}
function answerReview(id, value) {
    const r = AX_DATA.reviews.find(r => r.id === id);
    if (!r || !['완료', '진행 중'].includes(value))
        return;
    state.reviewAnswers.set(id, value);
    state.taskStates.set(r.taskId, value);
    state.reviewed.add(id);
    render(`[data-action="review-answer"][data-id="${id}"][data-value="${value}"]`);
}
let returnFocus = null;
function render(focusKey = '') {
    const oldSources = document.querySelector('.source-scroll'), oldSourceProject = oldSources?.dataset.project, oldSourceTop = oldSources?.scrollTop ?? 0;
    const input = document.activeElement, position = input?.id === 'homeSearch' ? input.selectionStart : null;
    document.body.dataset.theme = state.theme === 'linear-notion' ? 'linear' : state.theme;
    document.body.dataset.palette = state.theme === 'linear-notion' ? 'notion' : '';
    document.getElementById('app').innerHTML = header() + `<main id="main"><div class="page-heading"><div><div class="eyebrow">AX팀 업무 기록</div><h1>팀의 일, 한눈에.</h1><p>누가 어떤 일을 했는지, 프로젝트에서 작업 내역까지.</p></div><span class="page-date">${icon('calendar', 14)} ${fullDate(AX_DATA.demoAsOf)} 기준</span></div>${weekly()}<section class="projects-section">${projectArea()}</section><footer class="page-footer"><span>AX 프로젝트 관리장</span><small>${esc(AX_DATA.demoNotice)}</small></footer></main>` + themePicker() + settingsDialog() + reviewDrawer() + modal();
    const newSources = document.querySelector('.source-scroll');
    if (newSources && newSources.dataset.project === oldSourceProject)
        newSources.scrollTop = oldSourceTop;
    const overlay = Boolean(state.reviews || state.modal || state.settingsOpen);
    document.querySelector('.global-header')?.toggleAttribute('inert', overlay);
    document.querySelector('main')?.toggleAttribute('inert', overlay);
    document.querySelector('.theme-picker-anchor')?.toggleAttribute('inert', overlay);
    document.body.classList.toggle('overlay-open', overlay);
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
        const a = returnFocus.dataset.action, id = returnFocus.dataset.id;
        document.querySelector(`[data-action="${a}"]${id ? `[data-id="${id}"]` : ''}`)?.focus();
    }
}
function action(el) {
    const a = el.dataset.action, id = el.dataset.id || '', v = el.dataset.value || '';
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
        const t = el.dataset.task;
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
    if (a === 'week-person') {
        state.weekOwner = v;
        render(`[data-action="week-person"][data-value="${v}"]`);
        return;
    }
    if (a === 'episode-task') {
        state.tab = 'topic';
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
    if (a === 'themes')
        state.themeOpen = !state.themeOpen;
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
        state.reviewed.clear();
        state.reviewAnswers.clear();
        state.taskStates.clear();
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
    render(a === 'themes' || a === 'theme' ? '.theme-launcher' : a === 'week' ? `[data-action="week"][data-step="${el.dataset.step}"]` : a === 'tab' ? `[data-action="tab"][data-value="${v}"]` : a === 'sources' ? `[data-action="sources"][data-id="${id}"]` : '');
}
function init() {
    try {
        const t = document.body.dataset.initialTheme || localStorage.getItem('ax_theme');
        if (THEMES.some(x => x.id === t))
            state.theme = t;
    }
    catch { }
    const fromHash = () => { state.project = projects.some(p => `#project/${p.id}` === location.hash) ? location.hash.split('/')[1] : ''; render(); };
    fromHash();
    window.addEventListener('popstate', fromHash);
    document.addEventListener('click', event => {
        const target = event.target, button = target.closest('[data-action]');
        if (button) {
            action(button);
            return;
        }
        if (state.themeOpen && !target.closest('.theme-picker-anchor')) {
            state.themeOpen = false;
            render();
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
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
            event.preventDefault();
            document.getElementById('homeSearch')?.focus();
        }
        if (event.key === 'Tab' && (state.modal || state.reviews || state.settingsOpen)) {
            const dialog = document.querySelector('[aria-modal="true"]'), els = Array.from(dialog?.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]') || []), first = els[0], last = els.at(-1);
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
init();
