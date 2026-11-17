const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../assets/domain.js');
const job = {result1Criteria:'A',result2Criteria:'B'};
for (const [name,record,status,complete] of [
 ['empty results are pending',{},'pending',false],
 ['NA is pending',{result1:'NA'},'pending',false],
 ['partial OK is pending',{result1:'OK'},'pending',false],
 ['partial NG stays NG',{result1:'NG'},'NG',false],
 ['complete OK',{result1:'OK',result2:'OK'},'OK',true],
 ['complete NG',{result1:'OK',result2:'NG'},'NG',true],
 ['stale aggregate does not override edited criteria',{result1:'OK',result2:'OK',overallResult:'NG'},'OK',true],
 ['legacy NG is visible but incomplete',{overallResult:'NG'},'NG',false]
]) test(name,()=>{const result=domain.inspection(job,record);assert.equal(result.status,status);assert.equal(result.complete,complete)});
test('no criteria cannot count as completed',()=>assert.equal(domain.inspection({},{}).complete,false));
test('one criterion works',()=>assert.equal(domain.inspection({result1Criteria:'A'},{result1:'OK'}).status,'OK'));
test('totals partition records and track incomplete NG separately',()=>{
 assert.deepEqual(domain.summary([{...job,records:[{result1:'NG'},{result1:'OK',result2:'OK'},{},{result1:'NG',deleted:true}]}]),{total:3,OK:1,NG:1,pending:1,incomplete:2,complete:1});
});
for(const [raw,expected] of [[' ab-123 ','AB-123'],['{"serial":"ab_123","model":"L"}','AB_123'],['SN=abc.123|MODEL=L5018','ABC.123'],['serialNumber=ABC;LOT=111','ABC']]) test('QR supports '+raw,()=>assert.equal(domain.parseQR(raw),expected));
for(const raw of ['','https://example.com/ABC','{"serial":"ABC","SN":"DEF"}','SN=ABC|serial=DEF','X=ABC|MODEL=L','SN=ABC|garbage','ab c','{"serial":123}','{','a'.repeat(2049)]) test('QR rejects ambiguous/invalid '+raw.slice(0,50),()=>assert.throws(()=>domain.parseQR(raw)));
test('strict dates reject overflow and future dates',()=>{
 assert.equal(domain.validDate('2026-02-30','2026-11-16'),false);
 assert.equal(domain.validDate('2026-11-17','2026-11-16'),false);
 assert.equal(domain.validDate('2024-02-29','2026-11-16'),true);
});
test('Microsoft field names and hyperlink objects normalize',()=>{
 const job=domain.normalizeFields({fields:{JobKey:'J-1',ID:7,OKPictureURL:{Url:'https://example.com/a'},Result1Criteria:'A',Model:'L'}},'job');
 assert.equal(job.id,'J-1');assert.equal(job.okPictureUrl,'https://example.com/a');assert.equal(job.sharePointItemId,7);
 const record=domain.normalizeFields({SerialNumber:'S-1',PhotoURL1:{Url:'https://example.com/b'},Result1:'NG'},'record');
 assert.equal(record.serial,'S-1');assert.equal(record.photoUrl1,'https://example.com/b');assert.equal(record.result1,'NG');
});
