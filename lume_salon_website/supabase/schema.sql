create extension if not exists btree_gist;

create table if not exists public.salon_settings (
  id boolean primary key default true check (id),
  time_zone text not null default 'America/Jamaica',
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes > 0)
);

insert into public.salon_settings (id) values (true)
on conflict (id) do nothing;

create table if not exists public.services (
  id text primary key,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  active boolean not null default true
);

insert into public.services (id, name, duration_minutes) values
  ('silk-press', 'Silk Press & Finish', 120),
  ('signature-braids', 'Signature Braids', 240),
  ('curl-define', 'Curl Define & Shape', 90),
  ('calm-massage', 'Calm Body Massage', 60),
  ('glow-facial', 'Glow Facial', 50),
  ('smooth-wax', 'Smooth Waxing', 45)
on conflict (id) do update
set name = excluded.name;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true
);

create table if not exists public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table if not exists public.staff_hours (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at),
  unique (staff_id, weekday)
);

create table if not exists public.staff_date_overrides (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  override_date date not null,
  status text not null check (status in ('open', 'closed')),
  opens_at time,
  closes_at time,
  check (
    (status = 'closed' and opens_at is null and closes_at is null)
    or
    (status = 'open' and opens_at is not null and closes_at is not null and closes_at > opens_at)
  ),
  unique (staff_id, override_date)
);

create table if not exists public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.services(id),
  staff_id uuid not null references public.staff(id),
  customer_name text not null check (length(trim(customer_name)) between 1 and 80),
  customer_phone text not null check (length(trim(customer_phone)) between 7 and 25),
  notes text check (notes is null or length(notes) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint appointments_no_overlap
    exclude using gist (
      staff_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'confirmed')
);

alter table public.salon_settings enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.staff_hours enable row level security;
alter table public.staff_date_overrides enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.appointments enable row level security;

revoke all on public.salon_settings, public.services, public.staff,
  public.staff_services, public.staff_hours, public.staff_date_overrides,
  public.blocked_periods, public.appointments from anon, authenticated;

create or replace function public.get_available_slots(
  p_service_id text,
  p_date date,
  p_stylist_id uuid default null
)
returns table (starts_at timestamptz, staff_id uuid, staff_name text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with config as (
    select time_zone, slot_interval_minutes
    from public.salon_settings
    where id = true
  ),
  service as (
    select duration_minutes
    from public.services
    where id = p_service_id and active = true
  ),
  working as (
    select s.id as staff_id, s.name as staff_name,
      (p_date + coalesce(d.opens_at, h.opens_at)) at time zone c.time_zone as opens_at,
      (p_date + coalesce(d.closes_at, h.closes_at)) at time zone c.time_zone as closes_at,
      svc.duration_minutes, c.slot_interval_minutes
    from public.staff s
    left join public.staff_hours h
      on h.staff_id = s.id
     and h.weekday = extract(dow from p_date)::smallint
    left join public.staff_date_overrides d
      on d.staff_id = s.id and d.override_date = p_date
    join public.staff_services ss on ss.staff_id = s.id
    join service svc on svc.duration_minutes > 0
    cross join config c
    where s.active = true
      and ss.service_id = p_service_id
      and (p_stylist_id is null or s.id = p_stylist_id)
      and (d.id is not null or h.staff_id is not null)
      and coalesce(d.status, 'open') = 'open'
  ),
  candidates as (
    select w.staff_id, w.staff_name, slots.starts_at,
      slots.starts_at + w.duration_minutes * interval '1 minute' as ends_at
    from working w
    cross join lateral generate_series(
      w.opens_at,
      w.closes_at - w.duration_minutes * interval '1 minute',
      w.slot_interval_minutes * interval '1 minute'
    ) as slots(starts_at)
  )
  select c.starts_at, c.staff_id, c.staff_name
  from candidates c
  where c.starts_at > now()
    and not exists (
      select 1 from public.appointments a
      where a.staff_id = c.staff_id
        and a.status = 'confirmed'
        and tstzrange(a.starts_at, a.ends_at, '[)') &&
            tstzrange(c.starts_at, c.ends_at, '[)')
    )
    and not exists (
      select 1 from public.blocked_periods b
      where (b.staff_id is null or b.staff_id = c.staff_id)
        and tstzrange(b.starts_at, b.ends_at, '[)') &&
            tstzrange(c.starts_at, c.ends_at, '[)')
    )
  order by c.starts_at, c.staff_name;
$$;

create or replace function public.create_booking(
  p_service_id text,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_notes text default null
)
returns table (booking_id uuid, starts_at timestamptz, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_duration integer;
  v_booking_id uuid;
  v_date date;
  v_time_zone text;
begin
  if length(trim(coalesce(p_customer_name, ''))) not between 1 and 80
     or length(trim(coalesce(p_customer_phone, ''))) not between 7 and 25
     or length(coalesce(p_notes, '')) > 500 then
    raise exception 'Please check your name, phone number, and notes.';
  end if;

  select s.duration_minutes into v_duration
  from public.services s
  where s.id = p_service_id and s.active = true;
  if v_duration is null then
    raise exception 'This service is not available for online booking.';
  end if;

  perform 1 from public.staff s
  where s.id = p_staff_id and s.active = true
  for update;
  if not found then
    raise exception 'This stylist is no longer available.';
  end if;

  select time_zone into v_time_zone
  from public.salon_settings where id = true;
  v_date := (p_starts_at at time zone v_time_zone)::date;

  if not exists (
    select 1
    from public.get_available_slots(p_service_id, v_date, p_staff_id) slot
    where slot.starts_at = p_starts_at
  ) then
    raise exception 'This slot is no longer available. Please choose another time.';
  end if;

  insert into public.appointments (
    service_id, staff_id, customer_name, customer_phone, notes,
    starts_at, ends_at, status
  ) values (
    p_service_id, p_staff_id, trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_starts_at, p_starts_at + v_duration * interval '1 minute', 'confirmed'
  )
  returning id into v_booking_id;

  return query select v_booking_id, p_starts_at, 'confirmed'::text;
exception
  when exclusion_violation then
    raise exception 'This slot is no longer available. Please choose another time.';
end;
$$;

revoke all on function public.get_available_slots(text, date, uuid) from public;
revoke all on function public.create_booking(text, uuid, timestamptz, text, text, text) from public;
grant execute on function public.get_available_slots(text, date, uuid) to anon, authenticated;
grant execute on function public.create_booking(text, uuid, timestamptz, text, text, text) to anon, authenticated;

create table if not exists public.salon_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.salon_admins enable row level security;
revoke all on public.salon_admins from anon, authenticated;

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.salon_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'This account is not authorized for salon administration.';
  end if;

  return jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'active', s.active,
        'service_ids', coalesce((
          select jsonb_agg(ss.service_id order by ss.service_id)
          from public.staff_services ss where ss.staff_id = s.id
        ), '[]'::jsonb)
      ) order by s.name)
      from public.staff s
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staff_id', h.staff_id, 'weekday', h.weekday,
        'opens_at', h.opens_at, 'closes_at', h.closes_at
      ) order by h.staff_id, h.weekday)
      from public.staff_hours h
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'staff_id', d.staff_id, 'override_date', d.override_date,
        'status', d.status, 'opens_at', d.opens_at, 'closes_at', d.closes_at
      ) order by d.override_date, d.staff_id)
      from public.staff_date_overrides d
      where d.override_date >= (now() at time zone (
        select ss.time_zone from public.salon_settings ss where ss.id = true
      ))::date
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'customer_name', a.customer_name, 'customer_phone', a.customer_phone,
        'service_name', sv.name, 'staff_name', st.name, 'starts_at', a.starts_at,
        'ends_at', a.ends_at, 'status', a.status
      ) order by a.starts_at)
      from (
        select ap.* from public.appointments ap
        order by (ap.starts_at >= now()) desc, ap.starts_at asc
        limit 200
      ) a
      join public.services sv on sv.id = a.service_id
      join public.staff st on st.id = a.staff_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_staff_hours(p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  item jsonb;
  v_staff_id uuid;
  v_weekday smallint;
  v_closed boolean;
  v_opens_at time;
  v_closes_at time;
begin
  if auth.uid() is null or not exists (
    select 1 from public.salon_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'This account is not authorized for salon administration.';
  end if;
  if jsonb_typeof(p_hours) <> 'array' then
    raise exception 'Weekly hours must be provided as a list.';
  end if;

  for item in select value from jsonb_array_elements(p_hours)
  loop
    v_staff_id := (item->>'staff_id')::uuid;
    v_weekday := (item->>'weekday')::smallint;
    v_closed := (item->>'closed')::boolean;
    perform 1 from public.staff s where s.id = v_staff_id for update;
    if v_weekday not between 0 and 6 then
      raise exception 'Weekday must be between 0 and 6.';
    end if;
    if not found then
      raise exception 'The selected stylist does not exist.';
    end if;
    if v_closed then
      delete from public.staff_hours h
      where h.staff_id = v_staff_id and h.weekday = v_weekday;
    else
      v_opens_at := (item->>'opens_at')::time;
      v_closes_at := (item->>'closes_at')::time;
      if v_opens_at is null or v_closes_at is null or v_closes_at <= v_opens_at then
        raise exception 'Closing time must be later than opening time.';
      end if;
      insert into public.staff_hours (staff_id, weekday, opens_at, closes_at)
      values (v_staff_id, v_weekday, v_opens_at, v_closes_at)
      on conflict (staff_id, weekday) do update
      set opens_at = excluded.opens_at, closes_at = excluded.closes_at;
    end if;
  end loop;
end;
$$;

create or replace function public.admin_set_date_override(
  p_staff_id uuid,
  p_date date,
  p_status text,
  p_opens_at time default null,
  p_closes_at time default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.salon_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'This account is not authorized for salon administration.';
  end if;
  if not exists (select 1 from public.staff s where s.id = p_staff_id and s.active) then
    raise exception 'The selected stylist is not active.';
  end if;
  perform 1 from public.staff s where s.id = p_staff_id for update;
  if p_status not in ('open', 'closed') then
    raise exception 'Availability must be open or closed.';
  end if;
  if p_date < (now() at time zone (
    select ss.time_zone from public.salon_settings ss where ss.id = true
  ))::date then
    raise exception 'Choose today or a future date.';
  end if;
  if p_status = 'open' and (
    p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at
  ) then
    raise exception 'Closing time must be later than opening time.';
  end if;

  insert into public.staff_date_overrides (staff_id, override_date, status, opens_at, closes_at)
  values (
    p_staff_id, p_date, p_status,
    case when p_status = 'open' then p_opens_at else null end,
    case when p_status = 'open' then p_closes_at else null end
  )
  on conflict (staff_id, override_date) do update
  set status = excluded.status,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_delete_date_override(p_override_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_staff_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.salon_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'This account is not authorized for salon administration.';
  end if;
  select staff_id into v_staff_id
  from public.staff_date_overrides where id = p_override_id;
  if not found then
    raise exception 'The special date was not found.';
  end if;
  perform 1 from public.staff s where s.id = v_staff_id for update;
  delete from public.staff_date_overrides where id = p_override_id;
end;
$$;

create or replace function public.admin_cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.salon_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'This account is not authorized for salon administration.';
  end if;
  update public.appointments
  set status = 'cancelled'
  where id = p_booking_id and status = 'confirmed';
  if not found then
    raise exception 'The appointment was not found or is already cancelled.';
  end if;
end;
$$;

revoke all on function public.admin_get_dashboard() from public;
revoke all on function public.admin_save_staff_hours(jsonb) from public;
revoke all on function public.admin_set_date_override(uuid, date, text, time, time) from public;
revoke all on function public.admin_delete_date_override(uuid) from public;
revoke all on function public.admin_cancel_booking(uuid) from public;
grant execute on function public.admin_get_dashboard() to authenticated;
grant execute on function public.admin_save_staff_hours(jsonb) to authenticated;
grant execute on function public.admin_set_date_override(uuid, date, text, time, time) to authenticated;
grant execute on function public.admin_delete_date_override(uuid) to authenticated;
grant execute on function public.admin_cancel_booking(uuid) to authenticated;
