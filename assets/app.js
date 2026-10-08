const SUPABASE_URL="https://czydcsdgoiwivwpnggiq.supabase.co";
const SUPABASE_KEY="sb_publishable_YYkORrCLJzGuWOaAqLX0uQ_VimButZj";
let SCHEDULE=null,ALL_DAYS=[],DAYS=[],TIMES=[],HOURS=[];
const key=(date,time)=>date+"T"+time;
const $=id=>document.getElementById(id);
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),2600)}
async function rpc(name,body={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.message||"请求失败");
    return data;
  }catch(error){
    if(error?.name==="AbortError")throw new Error("请求超时");
    throw error;
  }finally{clearTimeout(timer)}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function bindSwitch(id,current,onChange){const root=$(id);root.querySelectorAll("button").forEach(button=>{button.classList.toggle("active",Number(button.dataset.minutes)===current);button.onclick=()=>{const next=Number(button.dataset.minutes);root.querySelectorAll("button").forEach(item=>item.classList.toggle("active",item===button));onChange(next)}})}
function durationLabel(slotCount){const hours=slotCount/2;return Number.isInteger(hours)?hours+" 小时":hours.toFixed(1)+" 小时"}
function minutes(time){const [h,m]=time.split(":").map(Number);return h*60+m}
function timeFromMinutes(value){return String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0")}
function addMinutes(time,amount=30){return timeFromMinutes(minutes(time)+amount)}
function isoDate(date){return date.toISOString().slice(0,10)}
function addDays(value,amount){const [y,m,d]=value.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d));date.setUTCDate(date.getUTCDate()+amount);return isoDate(date)}
function buildSchedule(config){
  SCHEDULE=config;
  ALL_DAYS=[];
  for(let date=config.start_date;date<=config.end_date;date=addDays(date,1)){
    const [y,m,d]=date.split("-").map(Number),weekday=["周日","周一","周二","周三","周四","周五","周六"][new Date(Date.UTC(y,m-1,d)).getUTCDay()];
    ALL_DAYS.push({date,weekday,label:m+"月"+d+"日"});
  }
  TIMES=[];
  for(let value=minutes(config.start_time);value<minutes(config.end_time);value+=30)TIMES.push(timeFromMinutes(value));
  const unavailable=Array.isArray(config.unavailable)?config.unavailable:[];
  const slotIsBlocked=(date,time)=>unavailable.some(rule=>{
    if(!rule||rule.date!==date)return false;
    if(!rule.start_time||!rule.end_time)return true;
    const value=minutes(time);
    return value>=minutes(rule.start_time)&&value<minutes(rule.end_time);
  });
  DAYS=ALL_DAYS.filter(day=>!TIMES.length||!TIMES.every(time=>slotIsBlocked(day.date,time)));
  HOURS=TIMES.filter((_,index)=>index%2===0);
}
async function loadSchedule(attempt=0){
  try{
    const config=await rpc("get_program_review_config");
    if(!config||!config.start_date)throw new Error("未读取到时间设置");
    buildSchedule(config);
    return config;
  }catch(error){
    if(attempt<1){
      const detail=$("schedule-detail");if(detail)detail.textContent="首次读取较慢，正在自动重试…";
      await new Promise(resolve=>setTimeout(resolve,700));
      return loadSchedule(attempt+1);
    }
    throw error;
  }
}
function headers(){
  const notes=SCHEDULE&&SCHEDULE.date_notes&&typeof SCHEDULE.date_notes==="object"?SCHEDULE.date_notes:{};
  return '<div class="corner">时间</div>'+DAYS.map(d=>{
    const note=String(notes[d.date]||"").trim();
    return '<div class="date-head"><div class="date-head-main"><span>'+d.weekday+'</span><strong>'+d.label+'</strong></div><small class="date-note '+(note?"":"is-empty")+'"'+(note?' title="'+escapeHtml(note)+'"':"")+'>'+(note?escapeHtml(note):"无备注")+'</small></div>';
  }).join("");
}
function applyGridColumns(element){
  if(!element)return;
  const dayCount=Math.max(DAYS.length,1);
  element.style.setProperty("--day-count",dayCount);
  element.style.setProperty("--grid-min-width",64+dayCount*112+"px");
}
function scheduleSummary(){
  if(!SCHEDULE)return "";
  return SCHEDULE.start_date+" — "+SCHEDULE.end_date+" · 每天 "+SCHEDULE.start_time+"—"+SCHEDULE.end_time;
}
function updateFormIntro(){
  if(!$("schedule-month")||!SCHEDULE)return;
  const [sy,sm,sd]=SCHEDULE.start_date.split("-").map(Number),[ey,em,ed]=SCHEDULE.end_date.split("-").map(Number);
  const months=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  $("schedule-month").textContent=sy===ey&&sm===em?months[sm-1]:"DATE";
  $("schedule-range").textContent=sy===ey&&sm===em?sd+"—"+ed:sm+"/"+sd+"—"+em+"/"+ed;
  $("schedule-year").textContent=sy===ey?String(sy):sy+"—"+ey;
  const detail=$("schedule-detail");if(detail)detail.textContent="当前开放 "+DAYS.length+" 天，每天 "+SCHEDULE.start_time+"—"+SCHEDULE.end_time+"。";
}

if(document.body.dataset.page==="form"){
  const selected=new Set();
  let granularity=Number(localStorage.getItem("of29-form-granularity")||30);
  localStorage.removeItem("of29-response");
  localStorage.removeItem("of29-slots");
  function renderThirty(){return TIMES.map((time,i)=>'<div class="grid-row"><div class="time-label '+(i%2?"half":"")+'">'+(i%2?"":time)+'</div>'+DAYS.map(day=>{const slot=key(day.date,time);return '<button class="slot '+(selected.has(slot)?"selected":"")+'" data-slot="'+slot+'" aria-label="'+day.label+" "+time+"至"+addMinutes(time)+'">'+(selected.has(slot)?"✓":"")+'</button>'}).join("")+'</div>').join("")}
  function renderHours(){return HOURS.map(time=>{const index=TIMES.indexOf(time),secondTime=TIMES[index+1]||null;return '<div class="grid-row"><div class="time-label hour">'+time+'</div>'+DAYS.map(day=>{const first=key(day.date,time),second=secondTime?key(day.date,secondTime):"",slots=second?[first,second]:[first],finish=secondTime?addMinutes(secondTime):addMinutes(time);return '<button class="hour-slot" data-slots="'+slots.join("|")+'" aria-label="'+day.label+" "+time+"至"+finish+'"><span class="hour-half '+(selected.has(first)?"selected":"")+'">✓</span>'+(second?'<span class="hour-half '+(selected.has(second)?"selected":"")+'">✓</span>':'<span class="hour-half disabled"></span>')+'</button>'}).join("")+'</div>'}).join("")}
  function render(){
    $("picker").innerHTML=headers()+(granularity===30?renderThirty():renderHours())+'<div class="end-label">'+SCHEDULE.end_time+'</div>';
    applyGridColumns($("picker"));
    $("selected-count").textContent="已选 "+durationLabel(selected.size)+"，可在右侧切换选择时段长度";
    document.querySelectorAll(".slot").forEach(button=>button.onclick=()=>{const slot=button.dataset.slot;selected.has(slot)?selected.delete(slot):selected.add(slot);render()});
    document.querySelectorAll(".hour-slot").forEach(button=>button.onclick=()=>{const slots=button.dataset.slots.split("|").filter(Boolean),both=slots.every(slot=>selected.has(slot));slots.forEach(slot=>both?selected.delete(slot):selected.add(slot));render()});
  }
  bindSwitch("form-granularity",granularity,next=>{granularity=next;localStorage.setItem("of29-form-granularity",next);render()});
  $("edit-again").onclick=()=>$("success").classList.add("hidden");
  $("submit").disabled=true;
  loadSchedule().then(()=>{updateFormIntro();render();$("submit").disabled=false}).catch(error=>{
    toast("时间设置读取失败，请刷新页面");
    $("schedule-range").textContent="读取失败";$("schedule-year").textContent="—";
    $("schedule-detail").textContent=String(error.message||"").includes("超时")?"连接数据库超时，请检查网络后刷新页面。":"暂时无法读取当前开放时间。";
    $("picker").innerHTML='<div class="schedule-load-error">暂时无法读取可选时间，请刷新页面重试。</div>';
  });
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
      toast(message.includes("modification code")?"社内 ID 或修改码不正确":message.includes("slot")?"所选时间已不在当前开放范围，请刷新页面后重选":"保存失败，请稍后重试");
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
  function renderHours(counts,max){return HOURS.map(time=>{const index=TIMES.indexOf(time),secondTime=TIMES[index+1]||null;return '<div class="grid-row"><div class="time-label hour">'+time+'</div>'+DAYS.map(day=>{const first=key(day.date,time),second=secondTime?key(day.date,secondTime):null;return '<div class="hour-heat">'+cell(first,counts.get(first)||0,max,true)+(second?cell(second,counts.get(second)||0,max,true):'<span class="heat-segment h0 disabled"></span>')+'</div>'}).join("")+'</div>'}).join("")}
  function renderStats(){
    const chosen=person(),source=chosen?[chosen]:rows,counts=new Map();source.forEach(p=>p.slots.forEach(slot=>counts.set(slot,(counts.get(slot)||0)+1)));const max=Math.max(0,...counts.values());
    $("stats-heading").textContent=chosen?chosen.name+"的可到场时间":"各时段可到场人数";
    $("stats-description").textContent=chosen?"绿色表示该时段可以到场；点击格子查看具体时间。":"颜色越深，人数越多；点击格子查看名单。";
    $("heatmap").innerHTML=headers()+(granularity===30?renderThirty(counts,max):renderHours(counts,max))+'<div class="end-label">'+SCHEDULE.end_time+'</div>';
    applyGridColumns($("heatmap"));
    document.querySelectorAll("#heatmap [data-slot]").forEach(button=>button.onclick=()=>{active=button.dataset.slot;renderStats();renderRoster()});
  }
  function renderRoster(){
    const chosen=person();
    if(chosen){
      const note=chosen.note?'<div class="person-note">'+escapeHtml(chosen.note)+'</div>':"";
      if(!active){$("roster").innerHTML='<small>社内 ID</small><h2>'+escapeHtml(chosen.name)+'</h2><div class="roster-count"><b>'+durationLabel(chosen.slots.length)+'</b><span>共可到场</span></div>'+note;return}
      const day=DAYS.find(item=>active.startsWith(item.date)),time=active.slice(11),available=chosen.slots.includes(active);
      $("roster").innerHTML='<small>社内 ID</small><h2>'+escapeHtml(chosen.name)+'</h2><h3>'+(day?day.label:active.slice(0,10))+" "+time+"—"+addMinutes(time)+'</h3><div class="roster-count status"><b>'+(available?"可以到场":"无法到场")+'</b></div>'+note;return
    }
    if(!active){$("roster").innerHTML='<div class="empty"><b>▦</b><h2>选择一个时段</h2><p>点击热力表中的数字查看对应人员。</p></div>';return}
    const people=rows.filter(p=>p.slots.includes(active)),day=DAYS.find(d=>active.startsWith(d.date)),time=active.slice(11);
    $("roster").innerHTML='<small>所选时段</small><h2>'+(day?day.label:active.slice(0,10))+'</h2><h3>'+time+"—"+addMinutes(time)+'</h3><div class="roster-count"><b>'+people.length+'</b><span>人可到场</span></div><div class="people">'+people.map(p=>'<div class="person"><span class="avatar">'+escapeHtml(p.name.slice(0,1))+'</span><div><strong>'+escapeHtml(p.name)+'</strong><small>'+(p.note?escapeHtml(p.note):"无补充说明")+'</small></div></div>').join("")+'</div>';
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
  function fillScheduleEditor(){
    if(!SCHEDULE)return;
    $("schedule-start-date").value=SCHEDULE.start_date;$("schedule-end-date").value=SCHEDULE.end_date;
    $("schedule-start-time").value=SCHEDULE.start_time;$("schedule-end-time").value=SCHEDULE.end_time;
    $("schedule-current").textContent=scheduleSummary();
    renderDateNotesEditor();
  }
  function renderDateNotesEditor(){
    const root=$("date-notes-fields");if(!root||!SCHEDULE)return;
    const notes=SCHEDULE.date_notes&&typeof SCHEDULE.date_notes==="object"?SCHEDULE.date_notes:{};
    if(!DAYS.length){root.innerHTML='<div class="date-notes-empty">当前没有可显示的日期</div>';return}
    root.innerHTML=DAYS.map(day=>'<label><span>'+day.weekday+' '+day.label+'</span><input data-date-note="'+day.date+'" maxlength="60" value="'+escapeHtml(notes[day.date]||"")+'" placeholder="例如：下午场、终审日"></label>').join("");
  }
  async function saveDateNotes(){
    const notes={};
    document.querySelectorAll("[data-date-note]").forEach(input=>{const value=input.value.trim();if(value)notes[input.dataset.dateNote]=value});
    const button=$("save-date-notes");button.disabled=true;button.textContent="正在保存…";
    try{
      await rpc("update_program_review_date_notes",{p_admin_key:adminKey(),p_date_notes:notes});
      await loadData();toast("日期备注已更新");
    }catch(error){toast(String(error.message||"").includes("too long")?"单条备注最多 60 个字":"日期备注保存失败")}
    finally{button.disabled=false;button.textContent="保存日期备注"}
  }
  async function saveSchedule(){
    const startDate=$("schedule-start-date").value,endDate=$("schedule-end-date").value,startTime=$("schedule-start-time").value,endTime=$("schedule-end-time").value;
    if(!startDate||!endDate||!startTime||!endTime)return toast("请完整填写日期和时间");
    const button=$("save-schedule");button.disabled=true;button.textContent="正在保存…";
    try{
      await rpc("update_program_review_config",{p_admin_key:adminKey(),p_start_date:startDate,p_end_date:endDate,p_start_time:startTime,p_end_time:endTime});
      await loadData();fillScheduleEditor();toast("时间设置已更新");
    }catch(error){
      const message=String(error.message||"");
      if(message.includes("date range too long"))toast("日期范围最多 31 天");
      else if(message.includes("30 minutes"))toast("开始和结束时间需对齐到整点或半点");
      else if(message.includes("later"))toast("结束时间必须晚于开始时间");
      else toast("时间设置保存失败");
    }finally{button.disabled=false;button.textContent="保存时间设置"}
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
    currentView=view;
    const heatmapMode=view==="heatmap",recordsMode=view==="records",scheduleMode=view==="schedule";
    $("show-heatmap").classList.toggle("active",heatmapMode);$("show-records").classList.toggle("active",recordsMode);$("show-schedule").classList.toggle("active",scheduleMode);
    $("stats-card").classList.toggle("hidden",!heatmapMode);$("roster").classList.toggle("hidden",!heatmapMode);
    $("records-card").classList.toggle("hidden",!recordsMode);$("schedule-card").classList.toggle("hidden",!scheduleMode);
  }
  async function loadData(){
    const keyValue=adminKey();if(!keyValue)return;
    await loadSchedule();
    [rows,records]=await Promise.all([
      rpc("get_program_review_stats",{p_admin_key:keyValue}),
      rpc("get_program_review_admin_records",{p_admin_key:keyValue})
    ]);
    $("total").textContent=rows.length+" 份提交";populatePeople();renderStats();renderRoster();renderRecords();fillScheduleEditor();setView(currentView);
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
  $("save-schedule").onclick=saveSchedule;
  $("save-date-notes").onclick=saveDateNotes;
  $("show-heatmap").onclick=()=>setView("heatmap");$("show-records").onclick=()=>setView("records");$("show-schedule").onclick=()=>setView("schedule");
  if(sessionStorage.getItem("of29-admin-key")){$("admin-key").value=sessionStorage.getItem("of29-admin-key");load()}
}
