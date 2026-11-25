const REDIRECTS = new Set([301,302,303,307,308]);
const MAX_HOPS_DEFAULT = 10;
const TIMEOUT_DEFAULT = 12000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const corsOrigin = allowed === "*" ? "*" : (origin === allowed ? origin : allowed);
    const cors = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
    const url = new URL(request.url);
    if (url.pathname !== "/check") return json({error:"Use POST /check"},404,cors);
    if (request.method !== "POST") return json({error:"Method not allowed"},405,cors);

    let body;
    try { body=await request.json(); } catch { return json({error:"Invalid JSON body"},400,cors); }
    const oldUrl=String(body.oldUrl||"").trim(), expectedUrl=String(body.expectedUrl||"").trim();
    if(!validHttpUrl(oldUrl)||!validHttpUrl(expectedUrl)) return json({error:"Old URL and expected URL must be valid HTTP or HTTPS URLs"},400,cors);

    const maxHops=Math.min(20,Math.max(1,Number(env.MAX_HOPS)||MAX_HOPS_DEFAULT));
    const timeout=Math.min(30000,Math.max(1000,Number(env.TIMEOUT_MS)||TIMEOUT_DEFAULT));
    const chain=[],seen=new Set();let current=oldUrl,status=0,issue="",finalUrl="",hops=0;
    try {
      for(let step=0;step<=maxHops;step++){
        const normalized=normalizeForLoop(current);
        if(seen.has(normalized)){issue="Redirect loop detected";finalUrl=current;break;}
        seen.add(normalized);chain.push(current);
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),timeout);
        let response;
        try {
          response=await fetch(current,{method:"GET",redirect:"manual",signal:controller.signal,headers:{"User-Agent":"RedirectCheckerQA/1.0"}});
        } finally { clearTimeout(timer); }
        status=response.status;
        if(REDIRECTS.has(status)){
          const location=response.headers.get("Location");
          if(!location){issue=`HTTP ${status} response has no Location header`;finalUrl=current;break;}
          if(step===maxHops){issue=`Redirect chain exceeded ${maxHops} hops`;finalUrl=current;break;}
          let next;
          try{next=new URL(location,current).href;}catch{issue="Invalid redirect Location header";finalUrl=current;break;}
          hops++;current=next;continue;
        }
        finalUrl=current;
        if(status>=400)issue=`Final destination returned HTTP ${status}`;
        break;
      }
    } catch(err) {
      issue=err.name==="AbortError"?"Request timed out":`Network/request error: ${String(err.message||err).slice(0,180)}`;
      finalUrl=current;
    }

    const matches=finalUrl && equivalentUrl(finalUrl,expectedUrl);
    let result="PASS";
    if(issue) result=(issue.startsWith("Network/request error")||issue==="Request timed out")?"BLOCKED":"FAIL";
    else if(!matches) {result="FAIL";issue="Final URL does not match expected destination";}
    else if(status<200||status>=400){result="FAIL";issue=`Unexpected final HTTP status ${status}`;}
    else if(hops===0 && !equivalentUrl(oldUrl,expectedUrl)){result="FAIL";issue="Source URL did not redirect to expected destination";}
    return json({old:oldUrl,expected:expectedUrl,actual:finalUrl,status,hops,result,issue,chain},200,cors);
  }
};
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});}
function validHttpUrl(s){try{const u=new URL(s);return u.protocol==="http:"||u.protocol==="https:";}catch{return false;}}
function normalizeForLoop(s){try{const u=new URL(s);u.hash="";return u.href;}catch{return s;}}
function equivalentUrl(a,b){
  try{
    const x=new URL(a),y=new URL(b);
    x.hash="";y.hash="";
    if(x.protocol!==y.protocol||x.hostname.toLowerCase()!==y.hostname.toLowerCase())return false;
    const port=u=>u.port||((u.protocol==="https:")?"443":"80");
    if(port(x)!==port(y))return false;
    const path=u=>u.pathname==="/"?"":u.pathname.replace(/\/+$/,"");
    if(path(x)!==path(y))return false;
    const sortParams=u=>[...u.searchParams.entries()].sort(([ak,av],[bk,bv])=>ak.localeCompare(bk)||av.localeCompare(bv)).map(([k,v])=>[k,v]);
    return JSON.stringify(sortParams(x))===JSON.stringify(sortParams(y));
  }catch{return false;}
}
