-- Assam Homestay Platform: initial schema (MVP, Phase 1)
--
-- Tenancy: every business table carries tenant_id and row-level security checks membership.
-- Legal values (room limits, GST slabs, deadlines) live in public.rules, so a new government
-- notification is a new row with a later effective_from, not a code change.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- tenancy

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff', 'accountant')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create or replace function public.is_member(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.tenant_id = t and m.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- rules as data

create table public.rules (
  id bigint generated always as identity primary key,
  key text not null,
  value jsonb not null,
  source text not null,
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (key, effective_from)
);

create or replace function public.rule_value(p_key text, p_on date default current_date)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.rules where key = p_key and effective_from <= p_on
  order by effective_from desc limit 1;
$$;

insert into public.rules (key, value, source, effective_from) values
  ('homestay.min_rooms', '2', 'Assam Tourism Accommodation (Development and Registration) Rules 2026, Rule 2(i) and 16(1)', '2026-07-09'),
  ('homestay.max_rooms', '8', 'Assam Tourism Accommodation (Development and Registration) Rules 2026, Rule 2(i) and 16(1)', '2026-07-09'),
  ('bnb.min_rooms', '2', 'Assam Tourism Accommodation (Development and Registration) Rules 2026, Rule 17', '2026-07-09'),
  ('registration.validity_years', '3', 'Assam Tourism (Development & Registration) Act 2024, s.5; Rules 2026, Rule 4', '2024-03-14'),
  ('registration.grace_days', '30', 'Act 2024, s.9(1)(vi)', '2024-03-14'),
  ('change.intimation_days', '30', 'Act 2024, s.7; Rules 2026, Rule 5 (Form 7)', '2024-03-14'),
  ('notice.reply_days', '15', 'Rules 2026, Rule 6', '2026-07-09'),
  ('appeal.days', '30', 'Act 2024, s.16; Rules 2026, Rule 10 (Form 13)', '2024-03-14'),
  ('monthly_return.due_day', '7', 'Rules 2026, Rule 11 and Annexure 11', '2026-07-09'),
  ('form_c.hours', '24', 'FRRO, registration of foreigners', '2026-01-01'),
  ('police_report.daily', 'true', 'Act 2024, s.18A, inserted by Assam Act XXI of 2026', '2026-09-07'),
  ('police_report.format', '"register-layout"', 'Format not yet prescribed under s.18A; register layout used until notified', '2026-09-07'),
  ('gst.room_slabs', '[{"upto":1000,"rate":0},{"upto":7500,"rate":5},{"upto":null,"rate":18}]', 'GST rates on accommodation from 22 Sep 2025; to be confirmed by a CA', '2025-09-22'),
  ('gst.sac_room', '"996311"', 'SAC for room accommodation', '2017-07-01'),
  ('retention.register_years', '8', 'Assumption: GST record period, until the Directorate states a period', '2026-07-09');

-- ---------------------------------------------------------------- property and rooms

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null default 'homestay' check (category in ('homestay', 'bnb')),
  address text,
  district text,
  police_station text,
  police_contact text,
  gstin text,
  tourism_reg_no text,
  tourism_reg_valid_to date,
  atdc_member boolean not null default false,
  invoice_prefix text not null check (invoice_prefix ~ '^[A-Z0-9]{2,3}$'),
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  name text not null,
  tariff numeric(10, 2) not null check (tariff >= 0),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade
);

create or replace function public.enforce_room_limit()
returns trigger language plpgsql as $$
declare
  v_cat text;
  v_max int;
  v_count int;
begin
  if not new.active then return new; end if;
  select category into v_cat from public.properties where id = new.property_id for update;
  v_max := (public.rule_value(v_cat || '.max_rooms'))::int;
  if v_max is null then return new; end if;
  select count(*) into v_count from public.rooms
   where property_id = new.property_id and active and id <> new.id;
  if v_count + 1 > v_max then
    raise exception 'A % can have at most % lettable rooms under the Assam Tourism Accommodation Rules 2026. Change the property category first (Form 7).', v_cat, v_max;
  end if;
  return new;
end $$;

create trigger rooms_limit before insert or update on public.rooms
  for each row execute function public.enforce_room_limit();

-- ---------------------------------------------------------------- bookings

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  room_id uuid not null,
  guest_name text not null,
  phone text,
  guests int not null default 1 check (guests between 1 and 20),
  check_in date not null,
  check_out date not null,
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  source text not null default 'Direct',
  status text not null default 'confirmed' check (status in ('confirmed', 'in', 'out', 'cancelled')),
  guest_category text check (guest_category in ('Local', 'Domestic', 'NRI', 'Foreign')),
  residence text,
  address text,
  purpose text,
  rate numeric(10, 2),
  advance numeric(10, 2) not null default 0,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade,
  foreign key (room_id, tenant_id) references public.rooms(id, tenant_id),
  constraint stay_dates check (check_out > check_in),
  -- the database itself refuses two live stays in one room on the same night, whatever the channel
  constraint no_double_booking exclude using gist (room_id with =, stay with &&) where (status <> 'cancelled')
);

-- ---------------------------------------------------------------- signatures (immutable)

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  kind text not null check (kind in ('arrival', 'departure', 'staff', 'owner_return', 'declaration')),
  signer_name text not null,
  image text not null check (image like 'data:image/png;base64,%' and length(image) < 400000),
  content_hash text not null,
  device text,
  signed_by uuid default auth.uid(),
  signed_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade
);

-- ---------------------------------------------------------------- numbering, invoices, payments

create or replace function public.fin_year(d date)
returns text language sql immutable as $$
  select case when extract(month from d) >= 4
    then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY') end;
$$;

create table public.counters (
  tenant_id uuid not null,
  property_id uuid not null,
  series text not null check (series in ('invoice', 'receipt')),
  fin_year text not null,
  last_no int not null default 0,
  primary key (property_id, series, fin_year),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  booking_id uuid,
  number text not null check (length(number) <= 16),
  fin_year text not null,
  kind text not null check (kind in ('tax_invoice', 'bill_of_supply')),
  issued_on date not null default current_date,
  guest_name text not null,
  guest_gstin text,
  lines jsonb not null,
  taxable numeric(12, 2) not null,
  cgst numeric(12, 2) not null default 0,
  sgst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  price_override_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (property_id, number),
  unique (id, tenant_id),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade,
  foreign key (booking_id, tenant_id) references public.bookings(id, tenant_id),
  constraint totals_add_up check (total = taxable + cgst + sgst),
  constraint bill_of_supply_has_no_gst check (kind = 'tax_invoice' or (cgst = 0 and sgst = 0))
);

create or replace function public.issue_invoice(p_invoice jsonb)
returns public.invoices language plpgsql security invoker set search_path = public as $$
declare
  v_prop public.properties;
  v_on date := coalesce((p_invoice ->> 'issued_on')::date, current_date);
  v_fy text;
  v_no int;
  v_row public.invoices;
begin
  select * into v_prop from public.properties where id = (p_invoice ->> 'property_id')::uuid;
  if not found then raise exception 'Property not found'; end if;
  v_fy := public.fin_year(v_on);
  insert into public.counters (tenant_id, property_id, series, fin_year, last_no)
  values (v_prop.tenant_id, v_prop.id, 'invoice', v_fy, 1)
  on conflict (property_id, series, fin_year) do update set last_no = public.counters.last_no + 1
  returning last_no into v_no;
  insert into public.invoices (tenant_id, property_id, booking_id, number, fin_year, kind, issued_on,
    guest_name, guest_gstin, lines, taxable, cgst, sgst, total, price_override_reason)
  values (v_prop.tenant_id, v_prop.id, (p_invoice ->> 'booking_id')::uuid,
    v_prop.invoice_prefix || '/' || v_fy || '/' || lpad(v_no::text, 6, '0'), v_fy,
    case when coalesce(v_prop.gstin, '') = '' then 'bill_of_supply' else 'tax_invoice' end, v_on,
    p_invoice ->> 'guest_name', nullif(p_invoice ->> 'guest_gstin', ''), p_invoice -> 'lines',
    (p_invoice ->> 'taxable')::numeric, coalesce((p_invoice ->> 'cgst')::numeric, 0),
    coalesce((p_invoice ->> 'sgst')::numeric, 0), (p_invoice ->> 'total')::numeric,
    nullif(p_invoice ->> 'price_override_reason', ''))
  returning * into v_row;
  return v_row;
end $$;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  booking_id uuid,
  invoice_id uuid,
  receipt_no text not null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'upi', 'card', 'bank', 'ota')),
  received_on date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (property_id, receipt_no),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade,
  foreign key (booking_id, tenant_id) references public.bookings(id, tenant_id),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id)
);

create or replace function public.record_payment(p_payment jsonb)
returns public.payments language plpgsql security invoker set search_path = public as $$
declare
  v_prop public.properties;
  v_on date := coalesce((p_payment ->> 'received_on')::date, current_date);
  v_fy text;
  v_no int;
  v_row public.payments;
begin
  select * into v_prop from public.properties where id = (p_payment ->> 'property_id')::uuid;
  if not found then raise exception 'Property not found'; end if;
  v_fy := public.fin_year(v_on);
  insert into public.counters (tenant_id, property_id, series, fin_year, last_no)
  values (v_prop.tenant_id, v_prop.id, 'receipt', v_fy, 1)
  on conflict (property_id, series, fin_year) do update set last_no = public.counters.last_no + 1
  returning last_no into v_no;
  insert into public.payments (tenant_id, property_id, booking_id, invoice_id, receipt_no, amount, method, received_on)
  values (v_prop.tenant_id, v_prop.id, (p_payment ->> 'booking_id')::uuid, (p_payment ->> 'invoice_id')::uuid,
    v_prop.invoice_prefix || '/R/' || v_fy || '/' || lpad(v_no::text, 5, '0'),
    (p_payment ->> 'amount')::numeric, p_payment ->> 'method', v_on)
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------- tourist register (Annexure 10)

create table public.register_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  booking_id uuid not null unique,
  serial_no int not null,
  guest_name text not null,
  address text not null,
  guest_category text not null check (guest_category in ('Local', 'Domestic', 'NRI', 'Foreign')),
  residence text not null,
  purpose text not null,
  id_type text not null,
  id_number text not null,
  nationality text,
  passport_issued date,
  passport_expiry date,
  visa_no text,
  guests int not null check (guests >= 1),
  rooms int not null default 1,
  arrived_at timestamptz not null default now(),
  departed_at timestamptz,
  invoice_id uuid,
  tax_amount numeric(12, 2),
  encashment_cert text,
  remarks text,
  staff_name text not null,
  sig_arrival uuid not null,
  sig_staff uuid not null,
  sig_departure uuid,
  created_at timestamptz not null default now(),
  unique (property_id, serial_no),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade,
  foreign key (booking_id, tenant_id) references public.bookings(id, tenant_id),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id),
  foreign key (sig_arrival, tenant_id) references public.signatures(id, tenant_id),
  foreign key (sig_staff, tenant_id) references public.signatures(id, tenant_id),
  foreign key (sig_departure, tenant_id) references public.signatures(id, tenant_id),
  -- never store a full Aadhaar number
  constraint aadhaar_masked check (id_type <> 'Aadhaar' or id_number ~ '^XXXX XXXX [0-9]{4}$'),
  -- Annexure 10, column 14: no departure without the guest's departure signature
  constraint departure_signed check (departed_at is null or sig_departure is not null)
);

create or replace function public.assign_register_serial()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.property_id::text));
  select coalesce(max(serial_no), 0) + 1 into new.serial_no
    from public.register_entries where property_id = new.property_id;
  return new;
end $$;

create trigger register_serial before insert on public.register_entries
  for each row execute function public.assign_register_serial();

-- ---------------------------------------------------------------- compliance records

create table public.form_c (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  booking_id uuid not null,
  register_entry_id uuid,
  guest_name text not null,
  due_at timestamptz not null,
  ack_no text,
  filed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade,
  foreign key (booking_id, tenant_id) references public.bookings(id, tenant_id)
);

create table public.police_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  report_date date not null,
  guest_count int not null,
  channel text not null,
  snapshot jsonb not null,
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid(),
  unique (property_id, report_date),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade
);

create table public.monthly_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  month date not null check (extract(day from month) = 1),
  data jsonb not null,
  sig_owner uuid,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, month),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade,
  foreign key (sig_owner, tenant_id) references public.signatures(id, tenant_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  property_id uuid not null,
  kind text not null,
  number text,
  issued_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (property_id, tenant_id) references public.properties(id, tenant_id) on delete cascade
);

-- ---------------------------------------------------------------- onboarding

create or replace function public.setup_property(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_prop uuid;
  v_room jsonb;
  v_i int := 0;
  v_min int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
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

-- ---------------------------------------------------------------- audit log

create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  actor uuid default auth.uid(),
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);

create or replace function public.audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (tenant_id, table_name, row_id, action, old_row, new_row)
  values (
    case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end,
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger audit_rooms after insert or update or delete on public.rooms for each row execute function public.audit();
create trigger audit_bookings after insert or update or delete on public.bookings for each row execute function public.audit();
create trigger audit_register after insert or update or delete on public.register_entries for each row execute function public.audit();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function public.audit();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.audit();

-- ---------------------------------------------------------------- row-level security

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.rules enable row level security;
alter table public.audit_log enable row level security;

create policy tenants_select on public.tenants for select to authenticated using (public.is_member(id));
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(tenant_id));
create policy rules_select on public.rules for select to authenticated using (true);
create policy audit_select on public.audit_log for select to authenticated using (public.is_member(tenant_id));

do $$
declare t text;
begin
  -- read and add, for every tenant table
  foreach t in array array['properties', 'rooms', 'bookings', 'signatures', 'counters', 'invoices', 'payments',
                           'register_entries', 'form_c', 'police_reports', 'monthly_returns', 'documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(tenant_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member(tenant_id))', t || '_insert', t);
  end loop;
  -- change, for tables that are not legal records once written (signatures, invoices, payments stay immutable)
  foreach t in array array['properties', 'rooms', 'bookings', 'counters', 'register_entries', 'form_c',
                           'monthly_returns', 'documents'] loop
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member(tenant_id)) with check (public.is_member(tenant_id))', t || '_update', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on function public.setup_property(jsonb), public.issue_invoice(jsonb), public.record_payment(jsonb),
  public.rule_value(text, date), public.fin_year(date), public.is_member(uuid) to authenticated;
