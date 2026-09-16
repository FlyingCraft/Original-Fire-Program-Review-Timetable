const SUPABASE_URL="https://czydcsdgoiwivwpnggiq.supabase.co";
const SUPABASE_KEY="sb_publishable_YYkORrCLJzGuWOaAqLX0uQ_VimButZj";
const DAYS=[{date:"2026-09-25",weekday:"周五",label:"9月25日"},{date:"2026-09-26",weekday:"周六",label:"9月26日"},{date:"2026-09-27",weekday:"周日",label:"9月27日"}];
const TIMES=Array.from({length:28},(_,i)=>{const m=480+i*30;return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")});
const key=(date,time)=>date+"T"+time;
const end=time=>{const [h,m]=time.split(":").map(Number),n=h*60+m+30;return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0")};
const $=id=>document.getElementById(id);
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),2600)}
async function rpc(name,body){const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify(body)});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.message||"请求失败");return data}
function headers(){return '<div class="corner">时间</div>'+DAYS.map(d=>'<div class="date-head"><span>'+d.weekday+'</span><strong>'+d.label+'</strong></div>').join("")}

if(document.body.dataset.page==="form"){
  const selected=new Set(JSON.parse(localStorage.getItem("of29-slots")||"[]"));
  function render(){
    $("picker").innerHTML=headers()+TIMES.map((time,i)=>'<div class="grid-row"><div class="time-label '+(i%2?"half":"")+'">'+(i%2?"":time)+'</div>'+DAYS.map(day=>{const slot=key(day.date,time);return '<button class="slot '+(selected.has(slot)?"selected":"")+'" data-slot="'+slot+'" aria-label="'+day.label+" "+time+"至"+end(time)+'">'+(selected.has(slot)?"✓":"")+'</button>'}).join("")+'</div>').join("")+'<div class="end-label">22:00</div>';
    $("selected-count").textContent="已选 "+selected.size+" 格 · 共 "+selected.size*30+" 分钟";
    document.querySelectorAll(".slot").forEach(button=>button.onclick=()=>{const slot=button.dataset.slot;selected.has(slot)?selected.delete(slot):selected.add(slot);render()});
  }
  let saved=JSON.parse(localStorage.getItem("of29-response")||"null");
  if(saved){$("existing").classList.remove("hidden");$("name").value=saved.name||"";$("group").value=saved.group||"";$("note").value=saved.note||"";$("submit").textContent="更新我的时间"}
  render();
  $("edit-again").onclick=()=>$("success").classList.add("hidden");
  $("submit").onclick=async()=>{
    const name=$("name").value.trim();if(!name)return toast("请先填写姓名");if(!selected.size)return toast("请至少选择一个时段");
    $("submit").disabled=true;$("submit").textContent="正在保存…";
    try{
      const result=await rpc("submit_program_review",{p_id:saved?.id||null,p_edit_token:saved?.editToken||null,p_name:name,p_group_name:$("group").value.trim(),p_note:$("note").value.trim(),p_slots:[...selected].sort()});
      const record={id:result.id,editToken:result.edit_token,name,group:$("group").value.trim(),note:$("note").value.trim()};
      localStorage.setItem("of29-response",JSON.stringify(record));localStorage.setItem("of29-slots",JSON.stringify([...selected]));
      saved=record;
      $("existing").classList.remove("hidden");$("success").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});
    }catch(error){toast(error.message||"保存失败，请稍后重试")}finally{$("submit").disabled=false;$("submit").textContent=saved?"更新我的时间":"提交可用时间"}
  };
}

if(document.body.dataset.page==="stats"){
  let rows=[],active=null;
  function heat(count,max){if(!count)return"h0";const r=count/Math.max(max,1);return r>.8?"h5":r>.6?"h4":r>.4?"h3":r>.2?"h2":"h1"}
  function renderStats(){
    const counts=new Map();rows.forEach(p=>p.slots.forEach(s=>counts.set(s,(counts.get(s)||0)+1)));const max=Math.max(0,...counts.values());
    $("heatmap").innerHTML=headers()+TIMES.map((time,i)=>'<div class="grid-row"><div class="time-label '+(i%2?"half":"")+'">'+(i%2?"":time)+'</div>'+DAYS.map(day=>{const slot=key(day.date,time),count=counts.get(slot)||0;return '<button class="heat '+heat(count,max)+(active===slot?" active":"")+'" data-slot="'+slot+'"><strong>'+(count||"")+'</strong></button>'}).join("")+'</div>').join("")+'<div class="end-label">22:00</div>';
    document.querySelectorAll(".heat").forEach(button=>button.onclick=()=>{active=button.dataset.slot;renderStats();renderRoster()});
  }
  function renderRoster(){
    const people=rows.filter(p=>p.slots.includes(active)),day=DAYS.find(d=>active.startsWith(d.date)),time=active.slice(11);
    $("roster").innerHTML='<small>所选时段</small><h2>'+day.label+'</h2><h3>'+time+"—"+end(time)+'</h3><div class="roster-count"><b>'+people.length+'</b><span>人可到场</span></div><div class="people">'+people.map(p=>'<div class="person"><span class="avatar">'+escapeHtml(p.name.slice(0,1))+'</span><div><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.group_name||"未填写组别")+(p.note?" · "+escapeHtml(p.note):"")+'</small></div></div>').join("")+'</div>';
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  async function load(){
    const adminKey=$("admin-key").value||sessionStorage.getItem("of29-admin-key");if(!adminKey)return;
    try{rows=await rpc("get_program_review_stats",{p_admin_key:adminKey});sessionStorage.setItem("of29-admin-key",adminKey);$("login-card").classList.add("hidden");$("stats-card").classList.remove("hidden");$("roster").classList.remove("hidden");$("total").textContent=rows.length+" 份提交";renderStats()}
    catch{$("login-error").textContent="管理员密钥不正确，或网络连接失败。"}
  }
  $("load-stats").onclick=load;$("admin-key").onkeydown=e=>{if(e.key==="Enter")load()};$("refresh").onclick=load;
  if(sessionStorage.getItem("of29-admin-key")){$("admin-key").value=sessionStorage.getItem("of29-admin-key");load()}
}
