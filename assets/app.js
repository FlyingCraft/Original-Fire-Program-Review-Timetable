const SUPABASE_URL="https://czydcsdgoiwivwpnggiq.supabase.co";
const SUPABASE_KEY="sb_publishable_YYkORrCLJzGuWOaAqLX0uQ_VimButZj";
const DAYS=[{date:"2026-09-25",weekday:"周五",label:"9月25日"},{date:"2026-09-26",weekday:"周六",label:"9月26日"},{date:"2026-09-27",weekday:"周日",label:"9月27日"}];
const TIMES=Array.from({length:28},(_,i)=>{const m=480+i*30;return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")});
const HOURS=TIMES.filter(time=>time.endsWith(":00"));
const key=(date,time)=>date+"T"+time;
const end=time=>{const [h,m]=time.split(":").map(Number),n=h*60+m+30;return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0")};
const $=id=>document.getElementById(id);
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),2600)}
async function rpc(name,body){const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify(body)});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.message||"请求失败");return data}
function headers(){return '<div class="corner">时间</div>'+DAYS.map(d=>'<div class="date-head"><span>'+d.weekday+'</span><strong>'+d.label+'</strong></div>').join("")}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function bindSwitch(id,current,onChange){const root=$(id);root.querySelectorAll("button").forEach(button=>{button.classList.toggle("active",Number(button.dataset.minutes)===current);button.onclick=()=>{const next=Number(button.dataset.minutes);root.querySelectorAll("button").forEach(item=>item.classList.toggle("active",item===button));onChange(next)}})}
function durationLabel(slotCount){const hours=slotCount/2;return Number.isInteger(hours)?hours+" 小时":hours.toFixed(1)+" 小时"}

if(document.body.dataset.page==="form"){
  const selected=new Set();
  let granularity=Number(localStorage.getItem("of29-form-granularity")||30);
  localStorage.removeItem("of29-response");
  localStorage.removeItem("of29-slots");
  function renderThirty(){return TIMES.map((time,i)=>'<div class="grid-row"><div class="time-label '+(i%2?"half":"")+'">'+(i%2?"":time)+'</div>'+DAYS.map(day=>{const slot=key(day.date,time);return '<button class="slot '+(selected.has(slot)?"selected":"")+'" data-slot="'+slot+'" aria-label="'+day.label+" "+time+"至"+end(time)+'">'+(selected.has(slot)?"✓":"")+'</button>'}).join("")+'</div>').join("")}
  function renderHours(){return HOURS.map(time=>'<div class="grid-row"><div class="time-label hour">'+time+'</div>'+DAYS.map(day=>{const first=key(day.date,time),second=key(day.date,end(time));return '<button class="hour-slot" data-first="'+first+'" data-second="'+second+'" aria-label="'+day.label+" "+time+"至"+end(end(time))+'"><span class="hour-half '+(selected.has(first)?"selected":"")+'">✓</span><span class="hour-half '+(selected.has(second)?"selected":"")+'">✓</span></button>'}).join("")+'</div>').join("")}
  function render(){
    $("picker").innerHTML=headers()+(granularity===30?renderThirty():renderHours())+'<div class="end-label">22:00</div>';
    $("selected-count").textContent="已选 "+durationLabel(selected.size)+"，可在右侧切换选择时段长度";
    document.querySelectorAll(".slot").forEach(button=>button.onclick=()=>{const slot=button.dataset.slot;selected.has(slot)?selected.delete(slot):selected.add(slot);render()});
    document.querySelectorAll(".hour-slot").forEach(button=>button.onclick=()=>{const slots=[button.dataset.first,button.dataset.second],both=slots.every(slot=>selected.has(slot));slots.forEach(slot=>both?selected.delete(slot):selected.add(slot));render()});
  }
  bindSwitch("form-granularity",granularity,next=>{granularity=next;localStorage.setItem("of29-form-granularity",next);render()});
  render();
  $("edit-again").onclick=()=>$("success").classList.add("hidden");
  $("submit").onclick=async()=>{
    const internalId=$("name").value.trim(),modificationCode=$("group").value;
    if(!internalId)return toast("请先填写社内 ID");
    if(modificationCode.length<4)return toast("修改码至少需要 4 位");
    if(!selected.size)return toast("请至少选择一个时段");
    $("submit").disabled=true;$("submit").textContent="正在保存…";
    try{
      await rpc("submit_program_review",{p_id:null,p_edit_token:null,p_name:internalId,p_group_name:modificationCode,p_note:$("note").value.trim(),p_slots:[...selected].sort()});
      $("success").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});
    }catch(error){
      const message=String(error.message||"");
      toast(message.includes("modification code")?"社内 ID 或修改码不正确":"保存失败，请稍后重试");
    }finally{$("submit").disabled=false;$("submit").textContent="提交 / 更新可用时间"}
  };
}

if(document.body.dataset.page==="stats"){
  let rows=[],records=[],active=null,currentView="heatmap",granularity=Number(localStorage.getItem("of29-stats-granularity")||30);
  const person=()=>rows.find(row=>row.id===$("person-filter").value);
  const adminKey=()=>$("admin-key").value||sessionStorage.getItem("of29-admin-key");
  function heat(count,max){if(!count)return"h0";const ratio=count/Math.max(max,1);return ratio>.8?"h5":ratio>.6?"h4":ratio>.4?"h3":ratio>.2?"h2":"h1"}
  function cell(slot,count,max,segment=false){const individual=Boolean(person()),className=segment?"heat-segment":"heat";return '<button class="'+className+" "+(individual?(count?"personal-on":"h0"):heat(count,max))+(active===slot?" active":"")+'" data-slot="'+slot+'"><strong>'+(count?(individual?"✓":count):"")+'</strong></button>'}
  function renderThirty(counts,max){return TIMES.map((time,i)=>'<div class="grid-row"><div class="time-label '+(i%2?"half":"")+'">'+(i%2?"":time)+'</div>'+DAYS.map(day=>{const slot=key(day.date,time);return cell(slot,counts.get(slot)||0,max)}).join("")+'</div>').join("")}
  function renderHours(counts,max){return HOURS.map(time=>'<div class="grid-row"><div class="time-label hour">'+time+'</div>'+DAYS.map(day=>{const first=key(day.date,time),second=key(day.date,end(time));return '<div class="hour-heat">'+cell(first,counts.get(first)||0,max,true)+cell(second,counts.get(second)||0,max,true)+'</div>'}).join("")+'</div>').join("")}
  function renderStats(){
    const chosen=person(),source=chosen?[chosen]:rows,counts=new Map();source.forEach(p=>p.slots.forEach(slot=>counts.set(slot,(counts.get(slot)||0)+1)));const max=Math.max(0,...counts.values());
    $("stats-heading").textContent=chosen?chosen.name+"的可到场时间":"各时段可到场人数";
    $("stats-description").textContent=chosen?"绿色表示该时段可以到场；点击格子查看具体时间。":"颜色越深，人数越多；点击格子查看名单。";
    $("heatmap").innerHTML=headers()+(granularity===30?renderThirty(counts,max):renderHours(counts,max))+'<div class="end-label">22:00</div>';
    document.querySelectorAll("[data-slot]").forEach(button=>button.onclick=()=>{active=button.dataset.slot;renderStats();renderRoster()});
  }
  function renderRoster(){
    const chosen=person();
    if(chosen){
      const note=chosen.note?'<div class="person-note">'+escapeHtml(chosen.note)+'</div>':"";
      if(!active){$("roster").innerHTML='<small>社内 ID</small><h2>'+escapeHtml(chosen.name)+'</h2><div class="roster-count"><b>'+durationLabel(chosen.slots.length)+'</b><span>共可到场</span></div>'+note;return}
      const day=DAYS.find(item=>active.startsWith(item.date)),time=active.slice(11),available=chosen.slots.includes(active);
      $("roster").innerHTML='<small>社内 ID</small><h2>'+escapeHtml(chosen.name)+'</h2><h3>'+day.label+" "+time+"—"+end(time)+'</h3><div class="roster-count status"><b>'+(available?"可以到场":"无法到场")+'</b></div>'+note;return
    }
    if(!active){$("roster").innerHTML='<div class="empty"><b>▦</b><h2>选择一个时段</h2><p>点击热力表中的数字查看对应人员。</p></div>';return}
    const people=rows.filter(p=>p.slots.includes(active)),day=DAYS.find(d=>active.startsWith(d.date)),time=active.slice(11);
    $("roster").innerHTML='<small>所选时段</small><h2>'+day.label+'</h2><h3>'+time+"—"+end(time)+'</h3><div class="roster-count"><b>'+people.length+'</b><span>人可到场</span></div><div class="people">'+people.map(p=>'<div class="person"><span class="avatar">'+escapeHtml(p.name.slice(0,1))+'</span><div><strong>'+escapeHtml(p.name)+'</strong><small>'+(p.note?escapeHtml(p.note):"无补充说明")+'</small></div></div>').join("")+'</div>';
  }
  function populatePeople(){const current=$("person-filter").value;$("person-filter").innerHTML='<option value="">全部人员</option>'+[...rows].sort((a,b)=>a.name.localeCompare(b.name,"zh-CN")).map(p=>'<option value="'+p.id+'">'+escapeHtml(p.name)+'</option>').join("");if(rows.some(row=>row.id===current))$("person-filter").value=current}
  function formatDate(value){return new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}
  function slotLabel(slot){const day=DAYS.find(item=>slot.startsWith(item.date));return (day?day.label:slot.slice(5,10))+" "+slot.slice(11)}
  function renderRecords(){
    $("records-count").textContent=records.length+" 条";
    if(!records.length){$("records-list").innerHTML='<div class="records-empty">目前没有提交记录</div>';return}
    $("records-list").innerHTML=records.map(record=>{const code=record.modification_code||"";return '<article class="record-card" data-record-id="'+record.id+'"><div class="record-top"><div><small>社内 ID</small><strong>'+escapeHtml(record.internal_id)+'</strong></div><span class="code-badge '+(code?"":"unset")+'">'+(code?"修改码："+escapeHtml(code):"旧记录未保存明文")+'</span></div><div class="record-meta"><span>首次提交：'+formatDate(record.created_at)+'</span><span>最后更新：'+formatDate(record.updated_at)+'</span><span>'+record.slots.length+" 个半小时 · "+durationLabel(record.slots.length)+'</span></div><div class="record-slots">'+record.slots.map(slot=>'<span>'+slotLabel(slot)+'</span>').join("")+'</div>'+(record.note?'<div class="record-note">'+escapeHtml(record.note)+'</div>':"")+'<div class="record-editor"><label>社内 ID<input class="record-id-input" maxlength="30" value="'+escapeHtml(record.internal_id)+'"></label><label>修改码<input class="record-code-input" type="text" minlength="4" maxlength="50" value="'+escapeHtml(code)+'" placeholder="输入新修改码"></label><div class="record-actions"><button data-save-record="'+record.id+'">保存修改</button><button class="danger" data-delete-record="'+record.id+'">删除</button></div></div></article>'}).join("");
    document.querySelectorAll("[data-save-record]").forEach(button=>button.onclick=()=>saveRecord(button.dataset.saveRecord));
    document.querySelectorAll("[data-delete-record]").forEach(button=>button.onclick=()=>deleteRecord(button.dataset.deleteRecord));
  }
  async function saveRecord(id){
    const card=document.querySelector('[data-record-id="'+id+'"]'),internalId=card.querySelector(".record-id-input").value.trim(),newCode=card.querySelector(".record-code-input").value;
    if(!internalId)return toast("社内 ID 不能为空");
    if(newCode&&newCode.length<4)return toast("新修改码至少需要 4 位");
    try{buttonBusy(card,true);await rpc("update_program_review_admin_record",{p_admin_key:adminKey(),p_id:id,p_internal_id:internalId,p_new_modification_code:newCode||null});toast("记录已更新");await loadData()}
    catch(error){const message=String(error.message||"");toast(message.includes("already exists")?"该社内 ID 已存在":"修改失败，请稍后重试")}
    finally{buttonBusy(card,false)}
  }
  async function deleteRecord(id){
    const record=records.find(item=>item.id===id);if(!record||!window.confirm("确定删除 "+record.internal_id+" 的全部提交记录吗？此操作无法撤销。"))return;
    try{await rpc("delete_program_review_admin_record",{p_admin_key:adminKey(),p_id:id});toast("记录已删除");await loadData()}
    catch{toast("删除失败，请稍后重试")}
  }
  function buttonBusy(card,busy){card.querySelectorAll("button,input").forEach(item=>item.disabled=busy)}
  function setView(view){
    currentView=view;const recordsMode=view==="records";
    $("show-heatmap").classList.toggle("active",!recordsMode);$("show-records").classList.toggle("active",recordsMode);
    $("stats-card").classList.toggle("hidden",recordsMode);$("roster").classList.toggle("hidden",recordsMode);$("records-card").classList.toggle("hidden",!recordsMode);
  }
  async function loadData(){
    const keyValue=adminKey();if(!keyValue)return;
    [rows,records]=await Promise.all([
      rpc("get_program_review_stats",{p_admin_key:keyValue}),
      rpc("get_program_review_admin_records",{p_admin_key:keyValue})
    ]);
    $("total").textContent=rows.length+" 份提交";populatePeople();renderStats();renderRoster();renderRecords();setView(currentView);
  }
  async function load(){
    const keyValue=adminKey();if(!keyValue)return;
    try{sessionStorage.setItem("of29-admin-key",keyValue);await loadData();$("login-card").classList.add("hidden");$("admin-tabs").classList.remove("hidden")}
    catch{$("login-error").textContent="管理员密钥不正确，或网络连接失败。"}
  }
  bindSwitch("stats-granularity",granularity,next=>{granularity=next;localStorage.setItem("of29-stats-granularity",next);renderStats()});
  $("person-filter").onchange=()=>{active=null;renderStats();renderRoster()};
  $("load-stats").onclick=load;$("admin-key").onkeydown=e=>{if(e.key==="Enter")load()};
  $("refresh").onclick=()=>loadData().catch(()=>toast("刷新失败"));
  $("records-refresh").onclick=()=>loadData().catch(()=>toast("刷新失败"));
  $("show-heatmap").onclick=()=>setView("heatmap");$("show-records").onclick=()=>setView("records");
  if(sessionStorage.getItem("of29-admin-key")){$("admin-key").value=sessionStorage.getItem("of29-admin-key");load()}
}
