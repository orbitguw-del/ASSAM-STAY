-- Pilot sign-up control: a homestay can only be set up with an invite code, and one account
-- runs one homestay. Codes are created by Storey Labs in the Supabase dashboard (SQL editor):
--   insert into public.invite_codes (code, max_uses, note) values ('KAZIRANGA-01', 1, 'Pilot: Bamboo Grove');

create table public.invite_codes (
  code text primary key check (code ~ '^[A-Z0-9-]{6,32}$'),
  max_uses int not null default 1 check (max_uses > 0),
  used int not null default 0,
  note text,
  expires_on date,
  created_at timestamptz not null default now()
);

-- No policies: nobody can list or read codes through the API. Only setup_property checks them.
alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;

create or replace function public.setup_property(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_prop uuid;
  v_room jsonb;
  v_i int := 0;
  v_min int;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'This account already has a homestay. Use another email address to set up a second one.';
  end if;
  update public.invite_codes set used = used + 1
   where code = upper(trim(coalesce(p ->> 'invite_code', '')))
     and used < max_uses
     and (expires_on is null or expires_on >= current_date)
  returning code into v_code;
  if v_code is null then
    raise exception 'That invite code is not valid or has already been used. Ask Storey Labs for a pilot invite code.';
  end if;

  insert into public.tenants (name) values (p ->> 'name') returning id into v_tenant;
  insert into public.memberships (tenant_id, user_id, role) values (v_tenant, auth.uid(), 'owner');
  insert into public.properties (tenant_id, name, category, address, district, police_station, police_contact,
    gstin, tourism_reg_no, tourism_reg_valid_to, invoice_prefix)
  values (v_tenant, p ->> 'name', coalesce(p ->> 'category', 'homestay'), p ->> 'address', p ->> 'district',
    p ->> 'police_station', p ->> 'police_contact', nullif(p ->> 'gstin', ''), nullif(p ->> 'tourism_reg_no', ''),
    nullif(p ->> 'tourism_reg_valid_to', '')::date, upper(p ->> 'invoice_prefix'))
  returning id into v_prop;
  for v_room in select * from jsonb_array_elements(coalesce(p -> 'rooms', '[]'::jsonb)) loop
    insert into public.rooms (tenant_id, property_id, name, tariff, sort)
    values (v_tenant, v_prop, v_room ->> 'name', (v_room ->> 'tariff')::numeric, v_i);
    v_i := v_i + 1;
  end loop;
  v_min := (public.rule_value(coalesce(p ->> 'category', 'homestay') || '.min_rooms'))::int;
  if v_min is not null and v_i < v_min then
    raise exception 'Add at least % rooms. The Rules need at least % lettable rooms for this category.', v_min, v_min;
  end if;
  return v_prop;
end $$;
