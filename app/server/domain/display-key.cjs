const KEY=/^[A-Za-z0-9_-]{1,64}$/;
function validKey(value){return typeof value==='string'&&KEY.test(value);}
function assertKey(value){if(!validKey(value))throw Error('invalid project/task key');}
module.exports={validKey,assertKey};
