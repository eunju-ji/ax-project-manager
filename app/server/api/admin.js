'use strict';
(async()=>{
 const me=await (await fetch('/api/me')).json();
 const status=document.getElementById('status');
 async function save(value){const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify(value)});status.textContent=r.ok?'저장됨':'저장 실패';if(r.ok)await load();}
 function select(options,value){const s=document.createElement('select');for(const [v,label] of options){const o=document.createElement('option');o.value=v;o.textContent=label;s.append(o);}s.value=value;return s;}
 async function load(){const response=await fetch('/api/admin/users');if(!response.ok){status.textContent='접근 불가';return;}const rows=await response.json(),list=document.getElementById('users');list.replaceChildren();for(const u of rows){const tr=document.createElement('tr'),email=document.createElement('td');email.textContent=u.email;tr.append(email);const role=select([['viewer','보기'],['member','구성원'],['admin','관리자']],u.role),state=select([['invited','초대됨'],['active','활성'],['disabled','비활성']],u.status),person=document.createElement('input');person.value=u.person_id||'';role.setAttribute('aria-label',u.email+' 역할');state.setAttribute('aria-label',u.email+' 상태');person.setAttribute('aria-label',u.email+' 담당자 ID');for(const e of [role,state,person]){const td=document.createElement('td');td.append(e);tr.append(td);}const td=document.createElement('td'),b=document.createElement('button');b.textContent='저장';b.onclick=()=>save({email:u.email,role:role.value,status:state.value,person_id:person.value||null});td.append(b);tr.append(td);list.append(tr);}}
 document.getElementById('invite').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));void save({...d,status:'invited',person_id:d.person_id||null});};
 await load();
})().catch(()=>{document.getElementById('status').textContent='불러오기 실패';});
