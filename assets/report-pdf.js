/* Vector A4 Stock Inspection PDF. Thai Sarabun is embedded by pdfmake. */
(function(){
'use strict';
const GREEN='#16803c',DARK='#173c29',MUTED='#728077',BORDER='#dce6df';
const str=(x)=>x==null||x===''?'—':String(x);
const pct=(n,total)=>total?((Number(n)||0)*100/total).toFixed(1)+'%':'0.0%';
const safeFile=(s)=>String(s||'job').replace(/[^A-Za-z0-9_-]/g,'_');
let libraryPromise;
function script(src){
 return new Promise((resolve,reject)=>{
  const tag=document.createElement('script');tag.src=src;tag.async=true;
  tag.onload=resolve;tag.onerror=()=>reject(Error('โหลดเครื่องมือสร้าง PDF ไม่ได้'));
  document.head.appendChild(tag);
 });
}
async function ready(){
 if(typeof window.pdfMake==='object'&&typeof window.pdfMake.createPdf==='function')return window.pdfMake;
 if(!libraryPromise)libraryPromise=(async()=>{
  await script('https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js');
  if(!window.pdfMake?.createPdf)throw Error('ไม่สามารถเริ่มตัวสร้าง PDF ได้');
  return window.pdfMake;
 })().catch(e=>{libraryPromise=null;throw e});
 return libraryPromise;
}
async function asDataUrl(url){
 if(!url)return null;
 if(String(url).startsWith('data:image/'))return url;
 const res=await fetch(url,{mode:'cors',cache:'no-store'});
 if(!res.ok)throw Error('เปิดรูปภาพไม่ได้ (HTTP '+res.status+')');
 const blob=await res.blob();
 if(!blob.type.startsWith('image/'))throw Error('ข้อมูลที่ได้รับไม่ใช่รูปภาพ');
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(Error('อ่านรูปภาพไม่สำเร็จ'));reader.readAsDataURL(blob);
 });
}
function section(number,title){
 // Number-free, left-aligned report section with a light bottom rule.
 return {stack:[
  {text:title,bold:true,color:DARK,fontSize:10.5,margin:[0,0,0,5]},
  {canvas:[{type:'line',x1:0,y1:0,x2:535,y2:0,lineColor:BORDER,lineWidth:.7}]}
 ],margin:[0,8,0,7]};
}
function info(label,value){
 return {stack:[{text:label,fontSize:7.5,color:MUTED,margin:[0,0,0,2]},
 {text:str(value),fontSize:9,bold:true,color:DARK}],margin:[0,0,0,6]};
}
function metric(label,value,sub,color){
 return {stack:[{text:label,fontSize:8,color:MUTED,alignment:'center'},
 {text:str(value),fontSize:17,bold:true,color:color||DARK,alignment:'center',margin:[0,1,0,1]},
 {text:str(sub),fontSize:7.5,color:MUTED,alignment:'center'}],fillColor:'#f5faf6',margin:[2,4,2,4]};
}
function imageCell(label,image){
 // Border, pale header, and a fixed image area match the website preview.
 const picture=image?{image,fit:[212,76],alignment:'center',margin:[0,5,0,1]}:
  {text:'ไม่มีรูปอ้างอิง',fontSize:8,color:MUTED,alignment:'center',margin:[0,32,0,0]};
 return {table:{widths:['*'],body:[
  [{text:label,bold:true,fontSize:8,color:GREEN,fillColor:'#edf5f0',margin:[6,4,3,3]}],
  [{stack:[picture,{text:' ',fontSize:1,margin:[0,0,0,0]}],fillColor:'#fbfdfb',margin:[3,0,3,4]}]
 ]},layout:{hLineColor:()=>BORDER,vLineColor:()=>BORDER,
  paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0}};
}
function bodyCell(value,options={}){
 return {
  text:str(value),fontSize:options.fontSize||7.5,color:options.color||DARK,
  bold:Boolean(options.bold),alignment:options.align||'left',
  noWrap:Boolean(options.noWrap),margin:[0,1,0,1],
  characterSpacing:0
 };
}
function cleanResult(v){return v==='NG'?'NG':v==='OK'?'OK':v==='NA'?'NA':str(v)}
function resultCell(value){
 return bodyCell(cleanResult(value),{
  align:'center',color:value==='NG'?'#b42333':value==='OK'?GREEN:DARK,
  bold:value==='NG'||value==='OK',noWrap:true,fontSize:8
 });
}
function tableRows(data){
 const head=['#','Date','Model','Serial Number','Lot No.','1','2','3','4','Result'];
 const aligned=new Set([0,5,6,7,8,9]);
 const header=head.map((label,i)=>({
  text:label,fontSize:7.3,bold:true,color:'#255b39',
  fillColor:'#eaf4ee',alignment:aligned.has(i)?'center':'left',
  noWrap:true,margin:[0,2,0,2]
 }));
 return [header,...data.rows.map((record,index)=>[
  bodyCell(index+1,{align:'center',bold:true,fontSize:8,noWrap:true}),
  bodyCell(record.date,{fontSize:7.5,noWrap:true}),
  bodyCell(record.model,{fontSize:7.5}),
  bodyCell(record.serial,{fontSize:7.6,bold:true}),
  bodyCell(record.lot,{fontSize:7.4}),
  ...[0,1,2,3].map(i=>resultCell(record.results?.[i])),
  resultCell(record.overall)
 ])];
}
async function download(data){
 const pdf=await ready();
 // pdfmake accepts public TTF font URLs and embeds those TTF bytes in the output.
 const base='https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/';
 pdf.addFonts({Sarabun:{
  normal:base+'Sarabun-Regular.ttf',bold:base+'Sarabun-Bold.ttf',
  italics:base+'Sarabun-Italic.ttf',bolditalics:base+'Sarabun-BoldItalic.ttf'
 }});
 const images=await Promise.allSettled([asDataUrl(data.logo),asDataUrl(data.okPhoto),asDataUrl(data.ngPhoto)]);
 const [logo,okPhoto,ngPhoto]=images.map(v=>v.status==='fulfilled'?v.value:null);
 const photoErrors=[];
 if(data.okPhoto&&!okPhoto)photoErrors.push('OK');
 if(data.ngPhoto&&!ngPhoto)photoErrors.push('NG');
 if(photoErrors.length)throw Error('ยังดึงรูป '+photoErrors.join('/')+' ไม่สำเร็จ กรุณาลองดาวน์โหลดอีกครั้ง');
 const total=Number(data.total)||0;
 const detailCols=[
  {width:'*',stack:[info('Problem / ชื่อปัญหา',data.title),info('Checking Location',data.location)]},
  {width:'*',stack:[info('Product',data.product),info('Model',data.model)]},
  {width:'*',stack:[info('Claim Type',data.claimType),info('DocNo2',data.docNo2)]}
 ];
 const content=[
  {columns:[logo?{image:logo,width:90}:{text:'KUBOTA',bold:true,fontSize:21,color:'#00a58e'},
   {text:'QUALITY ASSURANCE / STOCK INSPECTION',alignment:'right',bold:true,color:GREEN,fontSize:8,margin:[0,10,0,0]}],
   margin:[0,0,0,8]},
  {columns:[
   {width:'*',stack:[{text:'Confirm Tractor in Stock Report',bold:true,fontSize:19,color:DARK},
    {text:'รายงานสรุปผลการตรวจสต็อก · STOCK INSPECTION SUMMARY',fontSize:8.5,color:MUTED,margin:[0,3,0,0]}]},
   {width:83,stack:[{text:'INSPECTION',fontSize:8,color:MUTED,alignment:'center'},
     {text:String(total),fontSize:27,bold:true,color:GREEN,alignment:'center'},
     {text:'UNITS',fontSize:8,color:MUTED,alignment:'center'}]}
  ],margin:[0,0,0,6]},
  {text:'JOB REF: '+str(data.id)+' · DocNo2: '+str(data.docNo2),fontSize:8,color:MUTED,margin:[0,0,0,6]},
  {canvas:[{type:'line',x1:0,y1:0,x2:535,y2:0,lineColor:GREEN,lineWidth:1.5}]},
  section('01','ข้อมูลปัญหา'),
  {columns:detailCols,columnGap:12},
  section('02','รูปตัวอย่างและวิธีการตรวจสอบ'),
  {columns:[
   {width:'*',...imageCell('OK REFERENCE',okPhoto)},
   {width:'*',...imageCell('NG REFERENCE',ngPhoto)}
  ],columnGap:9,margin:[0,0,0,3]},
  {columns:[
   {width:'*',stack:[
    {text:'Checking Method',fontSize:8,color:MUTED,margin:[0,0,0,2]},
    {text:str(data.method),fontSize:9,color:DARK}
   ]},
   {width:'*',stack:[
    {text:'Acceptance Criteria',fontSize:8,color:MUTED,margin:[0,0,0,2]},
    {text:str(data.criteria),fontSize:9,color:DARK}
   ]}
  ],columnGap:10,margin:[0,5,0,1]},
  section('03','ผลการตรวจสต็อก'),
  {table:{headerRows:1,dontBreakRows:true,keepWithHeaderRows:1,
   widths:[18,62,55,132,34,27,27,27,27,38],body:tableRows(data)},
   layout:{
    hLineColor:()=>BORDER,vLineColor:()=>BORDER,
    hLineWidth:()=>0.55,vLineWidth:()=>0.55,
    paddingLeft:()=>4,paddingRight:()=>4,
    paddingTop:()=>5,paddingBottom:()=>5
   }},
  {text:'แสดง '+data.rows.length+' จาก '+total+' คัน · ยอดรวมคำนวณจากข้อมูลรถทั้งหมด',fontSize:7.5,color:MUTED,margin:[0,4,0,5]},
  {table:{widths:['*','*','*','*'],body:[[
   {stack:[{text:'TOTAL',fontSize:8,color:MUTED,alignment:'center'},
           {text:String(total),fontSize:17,bold:true,color:DARK,alignment:'center'},
           {text:'Units',fontSize:7,color:MUTED,alignment:'center'}],fillColor:'#f8fbf9'},
   {stack:[{text:'OK',fontSize:8,color:MUTED,alignment:'center'},
           {text:String(data.ok),fontSize:17,bold:true,color:GREEN,alignment:'center'},
           {text:pct(data.ok,total),fontSize:7,color:MUTED,alignment:'center'}],fillColor:'#f8fbf9'},
   {stack:[{text:'NG',fontSize:8,color:MUTED,alignment:'center'},
           {text:String(data.ng),fontSize:17,bold:true,color:'#bd2433',alignment:'center'},
           {text:pct(data.ng,total),fontSize:7,color:MUTED,alignment:'center'}],fillColor:'#f8fbf9'},
   {stack:[{text:'% NG',fontSize:8,color:MUTED,alignment:'center'},
           {text:pct(data.ng,total),fontSize:17,bold:true,color:'#bd2433',alignment:'center'},
           {text:'NG / Total',fontSize:7,color:MUTED,alignment:'center'}],fillColor:'#f8fbf9'}
  ]]},layout:{hLineColor:()=>BORDER,vLineColor:()=>BORDER,
       paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>6,paddingBottom:()=>6}},
  {text:'สรุปผลตรวจ '+total+' คัน · OK '+data.ok+' คัน · NG '+data.ng+' คัน ('+pct(data.ng,total)+')'+
   (data.pending?' · อยู่ระหว่างตรวจ '+data.pending+' คัน':''),fontSize:8,color:DARK,margin:[0,6,0,6]},
  {columns:[
   {width:'*',stack:[{text:'Inspector / ผู้ตรวจ',fontSize:8,color:MUTED},{text:str(data.inspector),bold:true,fontSize:9}]},
   {width:'*',stack:[{text:'Report Generated',fontSize:8,color:MUTED},{text:str(data.generated),bold:true,fontSize:9}]},
   {width:'*',stack:[{text:'Review / Approval',fontSize:8,color:MUTED},{text:'________________________',fontSize:9}]}
  ],margin:[0,1,0,3]}
 ];
 const definition={
  pageSize:'A4',pageMargins:[30,23,30,26],
  defaultStyle:{font:'Sarabun',fontSize:8.5,lineHeight:1.04,color:DARK},
  content,footer:(page,pages)=>({columns:[
   {text:'KUBOTA · STOCK INSPECTION',fontSize:7,color:MUTED},
   {text:str(data.id)+'  ·  '+page+'/'+pages,alignment:'right',fontSize:7,color:MUTED}
  ],margin:[30,0,30,0]})
 };
 const filename='Stock_Inspection_'+safeFile(data.id)+'.pdf';
 await new Promise((resolve,reject)=>{
  try{
   pdf.createPdf(definition).getBlob(blob=>{
    if(!blob||!blob.size){reject(Error('ไม่สามารถสร้างไฟล์ PDF ได้'));return}
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);resolve();
   });
  }catch(error){reject(error)}
 });
 return filename;
}
window.StockReportPdf=Object.freeze({download});
})();