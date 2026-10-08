(function(){
  function mins(time){const parts=String(time||"").split(":").map(Number);return parts[0]*60+parts[1]}
  function blocked(date,time){
    const rules=(typeof SCHEDULE!=="undefined"&&SCHEDULE&&Array.isArray(SCHEDULE.unavailable))?SCHEDULE.unavailable:[];
    return rules.some(rule=>{
      if(rule.date!==date)return false;
      if(!rule.start_time||!rule.end_time)return true;
      const value=mins(time);
      return value>=mins(rule.start_time)&&value<mins(rule.end_time);
    });
  }
  function markUnavailable(){
    document.querySelectorAll(".slot[data-slot]").forEach(button=>{
      const slot=button.dataset.slot,date=slot.slice(0,10),time=slot.slice(11);
      if(blocked(date,time)){
        button.disabled=true;
        button.classList.remove("selected");
        button.classList.add("unavailable");
        button.textContent="×";
        button.title="该时段不可用";
      }
    });
    document.querySelectorAll(".hour-slot[data-slots]").forEach(button=>{
      const slots=button.dataset.slots.split("|").filter(Boolean);
      if(slots.some(slot=>blocked(slot.slice(0,10),slot.slice(11)))){
        button.disabled=true;
        button.classList.add("unavailable");
        button.title="该小时包含不可用时段，请切换到30分钟查看";
        const halves=button.querySelectorAll(".hour-half");
        slots.forEach((slot,index)=>{
          if(blocked(slot.slice(0,10),slot.slice(11))&&halves[index]){
            halves[index].classList.remove("selected");
            halves[index].classList.add("unavailable");
            halves[index].textContent="×";
          }
        });
      }
    });
    document.querySelectorAll("#heatmap [data-slot]").forEach(cell=>{
      const slot=cell.dataset.slot,date=slot.slice(0,10),time=slot.slice(11);
      if(blocked(date,time)){
        const replacement=document.createElement("span");
        replacement.className=(cell.classList.contains("heat-segment")?"heat-segment":"heat")+" unavailable";
        replacement.textContent="×";
        replacement.title="该时段不可用";
        cell.replaceWith(replacement);
      }
    });
  }

  const gridObserver=new MutationObserver(markUnavailable);
  const picker=document.getElementById("picker");
  const heatmap=document.getElementById("heatmap");
  if(picker)gridObserver.observe(picker,{childList:true,subtree:true});
  if(heatmap)gridObserver.observe(heatmap,{childList:true,subtree:true});
  markUnavailable();

  if(document.body.dataset.page!=="stats")return;
  const card=document.getElementById("schedule-card");
  if(!card)return;

  const editor=document.createElement("section");
  editor.className="unavailable-editor";
  editor.innerHTML=
    '<div class="unavailable-heading"><div><h3>不可使用时间</h3><p>可添加整天禁用，或同一天添加多个禁用时段。</p></div><span id="unavailable-count">0 条</span></div>'+
    '<div class="unavailable-builder">'+
      '<label>日期<input id="blocked-date" type="date"></label>'+
      '<label class="blocked-all-day"><span>禁用方式</span><label class="check-line"><input id="blocked-all-day" type="checkbox">全天不可用</label></label>'+
      '<label>开始时间<input id="blocked-start" type="time" step="1800"></label>'+
      '<label>结束时间<input id="blocked-end" type="time" step="1800"></label>'+
      '<button id="add-blocked-rule" type="button">添加禁用规则</button>'+
    '</div>'+
    '<div id="unavailable-rules" class="unavailable-rules"></div>'+
    '<div class="unavailable-actions"><p>禁用格会在填写页和热力统计中显示为灰色，并且无法提交。</p><button id="save-blocked-rules" type="button">保存不可用时间</button></div>';
  card.querySelector(".schedule-help").before(editor);

  let draft=[],lastConfig="";
  const dateInput=document.getElementById("blocked-date");
  const allDay=document.getElementById("blocked-all-day");
  const startInput=document.getElementById("blocked-start");
  const endInput=document.getElementById("blocked-end");
  const list=document.getElementById("unavailable-rules");
  const count=document.getElementById("unavailable-count");

  function configFingerprint(){
    if(typeof SCHEDULE==="undefined"||!SCHEDULE)return "";
    return JSON.stringify({start_date:SCHEDULE.start_date,end_date:SCHEDULE.end_date,start_time:SCHEDULE.start_time,end_time:SCHEDULE.end_time,unavailable:SCHEDULE.unavailable||[]});
  }
  function weekday(date){
    const p=date.split("-").map(Number);
    return ["周日","周一","周二","周三","周四","周五","周六"][new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()];
  }
  function labelDate(date){
    const p=date.split("-").map(Number);
    return p[1]+"月"+p[2]+"日 "+weekday(date);
  }
  function renderRules(){
    count.textContent=draft.length+" 条";
    if(!draft.length){list.innerHTML='<div class="unavailable-empty">暂无禁用时间</div>';return}
    list.innerHTML=draft.map((rule,index)=>{
      const range=rule.start_time&&rule.end_time?rule.start_time+"—"+rule.end_time:"全天";
      return '<div class="unavailable-rule"><div><strong>'+labelDate(rule.date)+'</strong><span>'+range+'</span></div><button type="button" data-delete-blocked="'+index+'">删除</button></div>';
    }).join("");
    list.querySelectorAll("[data-delete-blocked]").forEach(button=>button.addEventListener("click",()=>{
      draft.splice(Number(button.dataset.deleteBlocked),1);
      renderRules();
    }));
  }
  function syncInputs(){
    if(typeof SCHEDULE==="undefined"||!SCHEDULE)return;
    dateInput.min=SCHEDULE.start_date;dateInput.max=SCHEDULE.end_date;
    if(!dateInput.value||dateInput.value<SCHEDULE.start_date||dateInput.value>SCHEDULE.end_date)dateInput.value=SCHEDULE.start_date;
    startInput.min=SCHEDULE.start_time;startInput.max=SCHEDULE.end_time;
    endInput.min=SCHEDULE.start_time;endInput.max=SCHEDULE.end_time;
    if(!startInput.value)startInput.value=SCHEDULE.start_time;
    if(!endInput.value)endInput.value=SCHEDULE.end_time;
  }
  function syncFromSchedule(force){
    const next=configFingerprint();
    if(!next||(!force&&next===lastConfig))return;
    lastConfig=next;
    draft=JSON.parse(JSON.stringify(SCHEDULE.unavailable||[]));
    syncInputs();renderRules();markUnavailable();
  }
  function toggleAllDay(){
    startInput.disabled=allDay.checked;
    endInput.disabled=allDay.checked;
  }
  allDay.addEventListener("change",toggleAllDay);
  toggleAllDay();

  document.getElementById("add-blocked-rule").addEventListener("click",()=>{
    if(typeof SCHEDULE==="undefined"||!SCHEDULE)return toast("请先载入时间设置");
    const date=dateInput.value;
    if(!date)return toast("请选择日期");
    if(date<SCHEDULE.start_date||date>SCHEDULE.end_date)return toast("日期必须位于问卷范围内");
    let rule={date};
    if(!allDay.checked){
      const start=startInput.value,end=endInput.value;
      if(!start||!end)return toast("请填写开始和结束时间");
      if(start>=end)return toast("结束时间必须晚于开始时间");
      if(start<SCHEDULE.start_time||end>SCHEDULE.end_time)return toast("禁用时段必须位于每天开放时间内");
      if(mins(start)%30||mins(end)%30)return toast("时间需对齐到整点或半点");
      rule={date,start_time:start,end_time:end};
    }
    if(draft.some(item=>JSON.stringify(item)===JSON.stringify(rule)))return toast("这条规则已经存在");
    draft.push(rule);
    draft.sort((a,b)=>a.date.localeCompare(b.date)||(a.start_time||"").localeCompare(b.start_time||""));
    renderRules();
  });

  document.getElementById("save-blocked-rules").addEventListener("click",async()=>{
    if(typeof SCHEDULE==="undefined"||!SCHEDULE)return toast("请先载入时间设置");
    const button=document.getElementById("save-blocked-rules");
    button.disabled=true;button.textContent="正在保存…";
    try{
      const keyValue=document.getElementById("admin-key").value||sessionStorage.getItem("of29-admin-key");
      const config=await rpc("update_program_review_unavailable",{p_admin_key:keyValue,p_unavailable:draft});
      buildSchedule(config);
      lastConfig="";syncFromSchedule(true);
      markUnavailable();
      const refresh=document.getElementById("refresh");if(refresh)refresh.click();
      toast("不可用时间已保存");
    }catch(error){
      toast("保存失败，请检查禁用规则");
    }finally{
      button.disabled=false;button.textContent="保存不可用时间";
    }
  });

  document.getElementById("show-schedule").addEventListener("click",()=>setTimeout(()=>syncFromSchedule(false),0));
  const cardObserver=new MutationObserver(()=>{if(!card.classList.contains("hidden"))syncFromSchedule(false)});
  cardObserver.observe(card,{attributes:true,attributeFilter:["class"]});
  syncFromSchedule(false);
})();