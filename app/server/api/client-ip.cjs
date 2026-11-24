'use strict';
const {BlockList,isIP}=require('node:net');

function canonicalIP(value){
 if(typeof value!=='string'||value.includes('%')||!isIP(value))return null;
 if(isIP(value)===4)return value;
 const normalized=new URL('http://['+value+']/').hostname.slice(1,-1);
 const mapped=/^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
 if(!mapped)return normalized;
 const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);
 return [high>>8,high&255,low>>8,low&255].join('.');
}

function trustedProxies(setting=''){
 const list=new BlockList();
 if(setting.trim())for(const entry of setting.split(',')){
  const [address,prefix,...rest]=entry.trim().split('/'),version=isIP(address);
  if(!version||address.includes('%')||rest.length||prefix!==undefined&&(!/^\d+$/.test(prefix)||Number(prefix)>(version===4?32:128)))throw Error('TRUSTED_PROXIES');
  const type=version===4?'ipv4':'ipv6';
  if(prefix===undefined)list.addAddress(address,type);else list.addSubnet(address,Number(prefix),type);
 }
 return address=>!!address&&list.check(address,isIP(address)===4?'ipv4':'ipv6');
}

function clientIP(req,isTrusted){
 const peer=canonicalIP(req.socket.remoteAddress);
 if(!peer||!isTrusted(peer))return peer||req.socket.remoteAddress;
 const xff=req.headers['x-forwarded-for'];
 if(typeof xff!=='string'||xff.length>8192)return peer;
 const chain=xff.split(',');if(chain.length>128)return peer;
 let current=peer;
 // Stop at the first untrusted hop: anything to its left can be client supplied.
 for(let i=chain.length-1;i>=0&&isTrusted(current);i--){
  const next=canonicalIP(chain[i].trim());if(!next)return peer;
  current=next;
 }
 return current;
}
module.exports={canonicalIP,trustedProxies,clientIP};
