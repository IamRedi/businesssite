// Local-only SDK simulator for the disposable premium UX browser suite.
if (process.env.UX_LOCAL_BLOB_SIMULATOR !== "true") throw new Error("Explicit local simulator opt-in required");
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.custom-site-private/blob-mock'),authority='store_localux000000001';mkdirSync(root,{recursive:true});
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:3013'),key=url.searchParams.get('pathname')??url.pathname.slice(1);
 if(req.method==='PUT'){
  if(req.headers['x-vercel-blob-store-id']!==authority.slice(6)||!/^sites\/[a-z0-9-]+\/custom\/[A-Za-z0-9_-]+\.(webp|mp4)$/.test(key))throw Error('Invalid local scope');
  const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>4300000)throw Error('Oversize');chunks.push(c);}
  const filename=resolve(root,encodeURIComponent(key));writeFileSync(filename,Buffer.concat(chunks));const type=req.headers['x-content-type'];writeFileSync(filename+'.json',JSON.stringify({type}));
  const publicUrl=`https://${authority.slice(6)}.public.blob.vercel-storage.com/${key}`;appendFileSync(resolve(root,'receipts.jsonl'),JSON.stringify({method:'PUT',bytes,type})+'\n');
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({url:publicUrl,downloadUrl:publicUrl,pathname:key,contentType:type,contentDisposition:'inline',etag:'"local-etag"'}));
 }else if(req.method==='GET'){
  const file=resolve(root,encodeURIComponent(key));if(!existsSync(file)){res.writeHead(404);return res.end();}const data=readFileSync(file),{type}=JSON.parse(readFileSync(file+'.json'));res.writeHead(200,{'content-type':type,'content-length':data.length,'access-control-allow-origin':'*'});res.end(data);
 }else if(req.method==='POST'&&url.pathname==='/delete'){res.writeHead(200,{'content-type':'application/json'});res.end('{}');}
 else{res.writeHead(405);res.end();}
 }catch{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'bad_request',message:'Local mock rejected'}}));}
}).listen(3013,'127.0.0.1',()=>console.log('Local Blob simulator 127.0.0.1:3013 (no hosted provider)'));
