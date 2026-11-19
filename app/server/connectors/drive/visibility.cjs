// Evaluate ancestors from retained metadata, but never expose names from an
// unavailable or missing ancestor. Cycles also fail closed.
function hiddenAncestor(file,byId,driveId){const seen=new Set();let id=file?.parents?.[0];while(id&&id!==driveId){if(seen.has(id))return true;seen.add(id);const s=byId.get(id);if(!s||s.availability!=='available')return true;id=s.file?.parents?.[0];}return false;}
function currentName(source){return source?.availability==='available'?source.file?.name||'(접근 불가 폴더)':'(접근 불가 폴더)';}
function currentPath(file,byId,driveId){const parts=[],seen=new Set();let id=file?.id;while(id&&id!==driveId){if(seen.has(id)){parts.unshift('(접근 불가 폴더)');break;}seen.add(id);const s=byId.get(id);if(!s){parts.unshift('(접근 불가 폴더)');break;}parts.unshift(currentName(s));id=s.file?.parents?.[0];}if(id===driveId)parts.unshift('AX-TF');return parts.join('/');}
function presentReview(data,source,byId,driveId){if(!data.signals)return data;const file=source?.file;return {...data,signals:{...data.signals,folderPath:file?currentPath(file,byId,driveId):null,...(source?.availability!=='available'?{fileName:null,availability:source?.availability||'unknown'}:{})}};}
module.exports={hiddenAncestor,currentName,currentPath,presentReview};
