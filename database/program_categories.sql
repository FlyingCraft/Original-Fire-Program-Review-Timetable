begin;

alter table public.program_review_config
  add column if not exists categories jsonb not null default '[]'::jsonb;

alter table public.program_review_responses
  add column if not exists category_id text not null default 'a';

update public.program_review_config c
set categories = jsonb_build_array(
  jsonb_build_object(
    'id', 'a', 'name', 'A类节目', 'color', '#2563eb',
    'dates', (select jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d) from generate_series(c.start_date, c.end_date, interval '1 day') d)
  ),
  jsonb_build_object(
    'id', 'b', 'name', 'B类节目', 'color', '#d97706',
    'dates', (select jsonb_agg(to_char(d, 'YYYY-MM-DD') order by d) from generate_series(c.start_date, c.end_date, interval '1 day') d)
  )
)
where c.id = 1 and jsonb_array_length(c.categories) = 0;

drop index if exists public.program_review_responses_internal_id_uidx;
create unique index if not exists program_review_responses_category_internal_id_uidx
  on public.program_review_responses (category_id, lower(btrim(name)));

create or replace function public.get_program_review_config()
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'start_date', c.start_date::text,
    'end_date', c.end_date::text,
    'start_time', to_char(c.start_time, 'HH24:MI'),
    'end_time', to_char(c.end_time, 'HH24:MI'),
    'unavailable', c.unavailable,
    'date_notes', coalesce(c.date_notes, '{}'::jsonb),
    'intro_text', coalesce(c.intro_text, ''),
    'is_paused', coalesce(c.is_paused, false),
    'pause_message', coalesce(c.pause_message, ''),
    'categories', coalesce(c.categories, '[]'::jsonb)
  )
  from public.program_review_config c
  where c.id = 1;
$function$;

create or replace function public.update_program_review_categories(p_admin_key text, p_categories jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.program_review_config%rowtype;
  v_category jsonb;
  v_date_text text;
  v_date date;
begin
  if encode(extensions.digest(coalesce(p_admin_key, ''), 'sha256'), 'hex') <> 'a43d401963e8f6af0375c15659e4765ff0d547202447c3d39e0cd2ae6ab28c05' then
    raise exception 'invalid admin key';
  end if;
  if p_categories is null or jsonb_typeof(p_categories) <> 'array'
     or jsonb_array_length(p_categories) not between 1 and 12 then
    raise exception 'invalid categories';
  end if;

  select * into c from public.program_review_config where id = 1;

  for v_category in select value from jsonb_array_elements(p_categories)
  loop
    if jsonb_typeof(v_category) <> 'object'
       or coalesce(v_category->>'id', '') !~ '^[a-z0-9][a-z0-9-]{0,31}$'
       or char_length(btrim(coalesce(v_category->>'name', ''))) not between 1 and 30
       or coalesce(v_category->>'color', '') !~ '^#[0-9A-Fa-f]{6}$'
       or jsonb_typeof(v_category->'dates') <> 'array'
       or jsonb_array_length(v_category->'dates') not between 1 and 31 then
      raise exception 'invalid category';
    end if;
    for v_date_text in select value from jsonb_array_elements_text(v_category->'dates')
    loop
      begin v_date := v_date_text::date;
      exception when others then raise exception 'invalid category date'; end;
      if v_date < c.start_date or v_date > c.end_date then
        raise exception 'category date outside schedule';
      end if;
    end loop;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_categories) item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_categories) item
    group by lower(btrim(item->>'name')) having count(*) > 1
  ) then raise exception 'duplicate category'; end if;

  if exists (
    select 1 from public.program_review_responses r
    where not exists (
      select 1 from jsonb_array_elements(p_categories) item
      where item->>'id' = r.category_id
    )
  ) then raise exception 'category in use'; end if;

  update public.program_review_config
  set categories = p_categories, updated_at = now()
  where id = 1;
  return public.get_program_review_config();
end;
$function$;

drop function if exists public.submit_program_review(uuid, text, text, text, text, jsonb);
create or replace function public.submit_program_review(
  p_id uuid, p_edit_token text, p_name text, p_group_name text,
  p_note text, p_slots jsonb, p_category_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_code_hash text;
  v_bad_slot boolean;
  v_normalized_slots jsonb;
  v_start_date date;
  v_end_date date;
  v_start_time time;
  v_end_time time;
  v_unavailable jsonb;
  v_categories jsonb;
  v_category jsonb;
  v_is_paused boolean;
  v_slot_count_limit integer;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 30 then raise exception 'invalid internal id'; end if;
  if p_group_name is null or char_length(p_group_name) not between 4 and 50 then raise exception 'invalid modification code'; end if;
  if coalesce(char_length(p_note), 0) > 200 then raise exception 'text too long'; end if;

  select c.start_date, c.end_date, c.start_time, c.end_time, c.unavailable, c.categories, c.is_paused
  into v_start_date, v_end_date, v_start_time, v_end_time, v_unavailable, v_categories, v_is_paused
  from public.program_review_config c where c.id = 1;

  select item into v_category from jsonb_array_elements(v_categories) item where item->>'id' = p_category_id limit 1;
  if v_category is null then raise exception 'invalid category'; end if;
  if coalesce(v_is_paused, false) then raise exception 'questionnaire paused'; end if;

  v_slot_count_limit := ((v_end_date - v_start_date) + 1)
    * greatest(1, floor(extract(epoch from (v_end_time - v_start_time)) / 1800)::int);
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) not between 1 and v_slot_count_limit then
    raise exception 'invalid slots';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_slots) value where value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$') then
    raise exception 'invalid slot value';
  end if;

  select exists (
    select 1
    from jsonb_array_elements_text(p_slots) value
    cross join lateral (
      select substring(value from 1 for 10)::date as slot_date,
             substring(value from 12 for 5)::time as slot_time
    ) parsed
    where parsed.slot_date < v_start_date
       or parsed.slot_date > v_end_date
       or not exists (select 1 from jsonb_array_elements_text(v_category->'dates') d where d::date = parsed.slot_date)
       or parsed.slot_time < v_start_time
       or parsed.slot_time >= v_end_time
       or extract(minute from parsed.slot_time)::int % 30 <> 0
       or exists (
         select 1 from jsonb_array_elements(v_unavailable) r
         where (r->>'date')::date = parsed.slot_date
           and (not (r ? 'start_time') or not (r ? 'end_time')
             or (parsed.slot_time >= (r->>'start_time')::time and parsed.slot_time < (r->>'end_time')::time))
       )
  ) into v_bad_slot;
  if v_bad_slot then raise exception 'invalid slot value'; end if;

  select jsonb_agg(distinct value order by value) into v_normalized_slots
  from jsonb_array_elements_text(p_slots) value;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_category_id || ':' || lower(btrim(p_name)), 0));
  select id, modify_code_hash into v_id, v_code_hash
  from public.program_review_responses
  where category_id = p_category_id and lower(btrim(name)) = lower(btrim(p_name));

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.program_review_responses(
      id, edit_token_hash, modify_code_hash, modification_code_plain,
      name, group_name, note, slots, category_id
    ) values (
      v_id, encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'),
      extensions.crypt(p_group_name, extensions.gen_salt('bf', 10)),
      p_group_name, btrim(p_name), '', coalesce(btrim(p_note), ''), v_normalized_slots, p_category_id
    );
  else
    if v_code_hash is not null and extensions.crypt(p_group_name, v_code_hash) <> v_code_hash then
      raise exception 'internal id or modification code is incorrect';
    end if;
    update public.program_review_responses
    set modify_code_hash = coalesce(modify_code_hash, extensions.crypt(p_group_name, extensions.gen_salt('bf', 10))),
        modification_code_plain = p_group_name, group_name = '', note = coalesce(btrim(p_note), ''),
        slots = v_normalized_slots, updated_at = now()
    where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'category_id', p_category_id);
end;
$function$;

drop function if exists public.get_program_review_stats(text);
create function public.get_program_review_stats(p_admin_key text)
returns table(id uuid, name text, group_name text, note text, slots jsonb, updated_at timestamptz, category_id text)
language plpgsql security definer set search_path = ''
as $function$
begin
  if encode(extensions.digest(coalesce(p_admin_key, ''), 'sha256'), 'hex') <> 'a43d401963e8f6af0375c15659e4765ff0d547202447c3d39e0cd2ae6ab28c05' then raise exception 'invalid admin key'; end if;
  return query select r.id, r.name, r.group_name, r.note, r.slots, r.updated_at, r.category_id
  from public.program_review_responses r order by r.updated_at desc;
end;
$function$;

drop function if exists public.get_program_review_admin_records(text);
create function public.get_program_review_admin_records(p_admin_key text)
returns table(id uuid, internal_id text, modification_code text, note text, slots jsonb, created_at timestamptz, updated_at timestamptz, category_id text)
language plpgsql security definer set search_path = ''
as $function$
begin
  if encode(extensions.digest(coalesce(p_admin_key, ''), 'sha256'), 'hex') <> 'a43d401963e8f6af0375c15659e4765ff0d547202447c3d39e0cd2ae6ab28c05' then raise exception 'invalid admin key'; end if;
  return query select r.id, r.name, r.modification_code_plain, r.note, r.slots, r.created_at, r.updated_at, r.category_id
  from public.program_review_responses r order by r.updated_at desc;
end;
$function$;

create or replace function public.update_program_review_admin_record(p_admin_key text, p_id uuid, p_internal_id text, p_new_modification_code text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_category_id text;
begin
  if encode(extensions.digest(coalesce(p_admin_key, ''), 'sha256'), 'hex') <> 'a43d401963e8f6af0375c15659e4765ff0d547202447c3d39e0cd2ae6ab28c05' then raise exception 'invalid admin key'; end if;
  if p_internal_id is null or char_length(btrim(p_internal_id)) not between 1 and 30 then raise exception 'invalid internal id'; end if;
  if p_new_modification_code is not null and char_length(p_new_modification_code) not between 4 and 50 then raise exception 'invalid modification code'; end if;
  select category_id into v_category_id from public.program_review_responses where id = p_id;
  if v_category_id is null then raise exception 'record not found'; end if;
  if exists (select 1 from public.program_review_responses where category_id=v_category_id and lower(btrim(name))=lower(btrim(p_internal_id)) and id<>p_id) then raise exception 'internal id already exists'; end if;
  update public.program_review_responses
  set name=btrim(p_internal_id),
      modify_code_hash=case when p_new_modification_code is null then modify_code_hash else extensions.crypt(p_new_modification_code, extensions.gen_salt('bf',10)) end,
      modification_code_plain=case when p_new_modification_code is null then modification_code_plain else p_new_modification_code end,
      updated_at=now()
  where id=p_id;
  return true;
end;
$function$;

revoke all on function public.submit_program_review(uuid,text,text,text,text,jsonb,text) from public;
revoke all on function public.get_program_review_config() from public;
revoke all on function public.get_program_review_stats(text) from public;
revoke all on function public.get_program_review_admin_records(text) from public;
revoke all on function public.update_program_review_categories(text,jsonb) from public;
revoke all on function public.update_program_review_admin_record(text,uuid,text,text) from public;
grant execute on function public.submit_program_review(uuid,text,text,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.get_program_review_config() to anon, authenticated;
grant execute on function public.get_program_review_stats(text) to anon, authenticated;
grant execute on function public.get_program_review_admin_records(text) to anon, authenticated;
grant execute on function public.update_program_review_categories(text,jsonb) to anon, authenticated;
grant execute on function public.update_program_review_admin_record(text,uuid,text,text) to anon, authenticated;

commit;
