const $ = id => document.getElementById(id);
let rows = [], results = [], stopRequested = false;
const setMessage = (s, error=false) => { $("message").textContent=s; $("message").style.color=error?"#a52822":"#526071"; };

$("fileInput").addEventListener("change", async e => {
  const file=e.target.files[0]; if(!file)return;
  try {
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{type:"array"});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
    if(!raw.length) throw new Error("The first sheet is empty.");
    const headers=Object.keys(raw[0]);
    const oldKey=headers.find(h=>/^(old|old url|source|source url|from)$/i.test(h.trim())) ||
                  headers.find(h=>/old.*url|source.*url/i.test(h));
    const newKey=headers.find(h=>/^(new|new url|target|target url|destination|destination url|to)$/i.test(h.trim())) ||
                  headers.find(h=>/new.*url|target.*url|destination.*url/i.test(h));
    if(!oldKey||!newKey) throw new Error("Could not find Old URL and New URL columns. Rename the headers to Old URL and New URL.");
    rows=raw.map((r,i)=>({row:i+2,old:String(r[oldKey]||"").trim(),expected:String(r[newKey]||"").trim()}))
      .filter(r=>r.old||r.expected);
    results=[]; render();
    $("fileInfo").textContent=`${file.name} · ${rows.length} rows detected`;
    $("startBtn").disabled=!rows.length;
    setMessage("File loaded. Ready to check.");
  } catch(err){setMessage(err.message,true);$("startBtn").disabled=true;}
});

$("startBtn").addEventListener("click",runChecks);
$("stopBtn").addEventListener("click",()=>{stopRequested=true;setMessage("Stopping after current requests…");});

async function runChecks(){
  const endpoint=$("workerUrl").value.trim().replace(/\/+$/,"");
  if(!/^https:\/\/.+/i.test(endpoint)){setMessage("Enter your HTTPS Cloudflare Worker URL first.",true);return;}
  if(!rows.length)return;
  stopRequested=false;results=[];$("startBtn").disabled=true;$("stopBtn").disabled=false;
  $("exportAll").disabled=true;$("exportBugs").disabled=true;render();
  let next=0,done=0;const concurrency=Number($("concurrency").value);
  async function worker(){
    while(!stopRequested){
      const idx=next++;if(idx>=rows.length)return;
      const r=rows[idx];let result;
      if(!r.old||!r.expected){
        result={...r,actual:"",status:"",hops:0,result:"FAIL",issue:"Missing Old URL or New URL",chain:[]};
      }else{
        try{
          const response=await fetch(endpoint+"/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldUrl:r.old,expectedUrl:r.expected})});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||`Backend HTTP ${response.status}`);
          result={...r,...data};
        }catch(err){
          result={...r,actual:"",status:"",hops:0,result:"BLOCKED",issue:err.message||"Request failed",chain:[]};
        }
      }
      results[idx]=result;done++;updateProgress(done,rows.length);render();
    }
  }
  await Promise.all(Array.from({length:concurrency},worker));
  $("startBtn").disabled=false;$("stopBtn").disabled=true;
  $("exportAll").disabled=!results.filter(Boolean).length;$("exportBugs").disabled=!results.some(x=>x&&(x.result==="FAIL"||x.result==="BLOCKED"));
  setMessage(stopRequested?`Stopped. ${done} of ${rows.length} rows checked.`:`Completed. ${done} of ${rows.length} rows checked.`);
}
function updateProgress(done,total){$("progressBar").style.width=(total?done/total*100:0)+"%";$("progressText").textContent=`${done} / ${total} checked`;}
function render(){
  const valid=results.filter(Boolean);
  $("total").textContent=rows.length;$("passed").textContent=valid.filter(x=>x.result==="PASS").length;
  $("failed").textContent=valid.filter(x=>x.result==="FAIL").length;$("blocked").textContent=valid.filter(x=>x.result==="BLOCKED").length;
  const body=$("resultsBody");
  if(!rows.length){body.innerHTML='<tr><td colspan="8" class="empty">Upload a file to begin.</td></tr>';return;}
  body.innerHTML=rows.map((r,i)=>{
    const x=results[i];if(!x)return `<tr><td>${i+1}</td><td>${esc(r.old)}</td><td>${esc(r.expected)}</td><td colspan="5">Pending</td></tr>`;
    return `<tr><td>${i+1}</td><td>${esc(x.old)}</td><td>${esc(x.expected)}</td><td>${esc(x.actual||"—")}</td><td>${esc(String(x.status||"—"))}</td><td>${esc(String(x.hops??"—"))}</td><td><span class="pill ${esc(x.result)}">${esc(x.result)}</span></td><td>${esc((x.issue||"—")+(x.chain?.length?" | "+x.chain.join(" → "):""))}</td></tr>`;
  }).join("");
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function csvEscape(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
function exportCsv(items,name){
  const cols=["row","old","expected","actual","status","hops","result","issue","chain"];
  const lines=[cols.join(","),...items.map(x=>cols.map(k=>csvEscape(k==="chain"?(x.chain||[]).join(" -> "):x[k])).join(","))];
  const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
$("exportAll").addEventListener("click",()=>exportCsv(results.filter(Boolean),"redirect-check-results.csv"));
$("exportBugs").addEventListener("click",()=>exportCsv(results.filter(x=>x&&(x.result==="FAIL"||x.result==="BLOCKED")),"redirect-check-bugs.csv"));
