const {test}=require('node:test'),a=require('node:assert/strict'),M=require('../src/model.js');
const row=(owner,title,topic='기획·설계')=>({project:{name:'반복 금지 프로젝트'},task:{id:title,topic,title},subtask:{owner,title}});
test('summary groups a person across tasks, uses topic particles and never repeats the project',()=>{
 const text=M.workSummary([row('박성진','원본 접근 정보 명세'),row('김지현','테마별 목록 비교안','제작·구현'),row('박성진','데이터 참조 관계도'),row('김지현','프로젝트 홈 와이어프레임','제작·구현')]);
 a.equal(text,'박성진은 원본 접근 정보 명세와 데이터 참조 관계도를 정리했습니다. 김지현은 테마별 목록 비교안과 프로젝트 홈 와이어프레임을 만들었습니다.');a.doesNotMatch(text,/반복 금지 프로젝트|작업을 진행/);
});
test('summary limits more than three records to two representatives with the full count',()=>{
 a.equal(M.workSummary(['초안','결과서','안내문','보고서'].map(t=>row('Eunju Ji',t,'검증'))),'Eunju Ji는 초안과 결과서 등 4건을 확인했습니다.');
});
test('all work categories select their own verb and mixed categories stay one sentence per person',()=>{
 for(const [topic,verb] of [['기획·설계','정리했습니다'],['조사·분석','조사했습니다'],['제작·구현','만들었습니다'],['검증','확인했습니다'],['운영·지원','처리했습니다']])a.equal(M.workSummary([row('민수','자료',topic)]),'민수는 자료를 '+verb+'.');
 const text=M.workSummary([row('민수','문서'),row('민수','화면','제작·구현')]);a.equal(text,'민수는 문서를 정리하고, 화면을 만들었습니다.');
});
test('Korean final consonants and English names choose the correct particles',()=>{
 for(const [word,vowel,consonant,expected] of [['지현','가','이','이'],['민수','가','이','가'],['지현','는','은','은'],['민수','는','은','는'],['화면','를','을','을'],['자료','를','을','를'],['화면','와','과','과'],['자료','와','과','와'],['Eunju Ji','는','은','는'],['Alex','가','이','가']])a.equal(M.particle(word,vowel,consonant),expected);
});
