// REST fields are checked byte-for-byte against client.cjs/model.cjs in Node tests.
var FILE_FIELDS='id,driveId,name,mimeType,parents,createdTime,modifiedTime,trashed,lastModifyingUser(displayName,emailAddress,permissionId)';
var DETAIL='create(new),edit,delete(type),rename(newTitle),move(addedParents(driveItem(name)),removedParents(driveItem(name))),comment(post(subtype),assignment(subtype),suggestion(subtype))';
var ACTIVITY_FIELDS='nextPageToken,activities(primaryActionDetail('+DETAIL+'),actors(user(knownUser(personName))),actions(detail('+DETAIL+'),actor(user(knownUser(personName))),target(driveItem(name)),timestamp,timeRange),targets(driveItem(name)),timestamp,timeRange)';
function doGet(e){
  var started=Date.now(),p=e.parameter||{},out;
  function json(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
  function request(resource,params,body,activity){
    var url=(activity?'https://driveactivity.googleapis.com/v2/':'https://www.googleapis.com/drive/v3/')+resource;
    var query=Object.keys(params).filter(function(k){return params[k]!==undefined;}).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);}).join('&');
    for(var n=0;n<4;n++){
      if(Date.now()-started>=300000)throw new Error('deadline');
      var response=UrlFetchApp.fetch(url+'?'+query,{method:body?'post':'get',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},contentType:'application/json',payload:body?JSON.stringify(body):undefined,muteHttpExceptions:true,followRedirects:false});
      var status=response.getResponseCode();if(status>=200&&status<300)return JSON.parse(response.getContentText());
      if((status===429||status>=500)&&n<3){Utilities.sleep(500*Math.pow(2,n));continue;}
      if(status===403&&/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/.test(response.getContentText()))throw new Error('api_disabled');
      throw new Error('API request failed');
    }
  }
  var stage='files',token=p.filesPageToken||undefined;
  try{
    if(!/^[A-Za-z0-9_-]+$/.test(p.driveId||''))throw new Error('Invalid drive ID');
    var since=p.since||new Date(started-14*86400000).toISOString(),date=new Date(since);
    if(!Number.isFinite(date.getTime())||date.getTime()>started||started-date.getTime()>90*86400000||(/^\d{4}-\d{2}-\d{2}$/.test(since)&&date.toISOString().slice(0,10)!==since))throw new Error('since must be within the last 90 days');
    since=date.toISOString();
    // drives.get needs the drive.readonly scope; read the shared drive root folder (id == driveId) with metadata scope instead.
    var drive=request('files/'+encodeURIComponent(p.driveId),{supportsAllDrives:true,fields:'id,name,driveId,mimeType'});
    if(drive.id!==p.driveId||drive.driveId!==p.driveId||drive.mimeType!=='application/vnd.google-apps.folder')throw new Error('Not a shared drive root');
    // Name is informational: the docs do not guarantee the root folder name equals the shared drive display name. The ID the user confirmed is the identity check.
    var start=request('changes/startPageToken',{driveId:p.driveId,supportsAllDrives:true,fields:'startPageToken'});
    out={format:'ax-drive-export',version:1,exportedAt:new Date(started).toISOString(),driveId:drive.id,driveName:drive.name,since:since,startPageToken:start.startPageToken,filesPages:[],activityPages:[]};
    if(p.stage||p.filesPageToken||p.activityPageToken)out.partial=true;
    if(p.stage!=='activity')do{
      var page=request('files',{driveId:p.driveId,supportsAllDrives:true,includeItemsFromAllDrives:true,corpora:'drive',q:'trashed = false',pageSize:1000,pageToken:token,fields:'nextPageToken,files('+FILE_FIELDS+')'});
      out.filesPages.push(page);token=page.nextPageToken;
    }while(token);
    stage='activity';token=p.activityPageToken||undefined;
    do{
      var page=request('activity:query',{fields:ACTIVITY_FIELDS},{ancestorName:'items/'+p.driveId,pageSize:100,pageToken:token,filter:'time >= "'+since+'"',consolidationStrategy:{none:{}}},true);
      out.activityPages.push(page);token=page.nextPageToken;
    }while(token);
    return json(out);
  }catch(error){
    if(out&&error.message==='deadline'){out.truncated=true;out.resume={stage:stage,since:out.since,filesPageToken:stage==='files'?token:null,activityPageToken:stage==='activity'?token:null};return json(out);}
    if(error.message==='api_disabled')return json({error:'Drive API or Drive Activity API is not enabled for this script. In the editor add Services > Drive API (v3) and Drive Activity API (v2), save, then run again.'});
    return json({error:'Export failed: check AX-TF ID, date (maximum 90 days), authorization and API availability.'});
  }
}
