-- Admin Agenda Médica (web)
-- Cria tabelas para configurar agenda por médico e gerar slots disponíveis.
-- Observação: o projeto já usa a tabela `medicos`; aqui apenas estendemos com email/telefone/updated_at.

-- 1) Estender `medicos`
alter table if exists public.medicos
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists updated_at timestamptz not null default now();

-- 2) Doctor availability (configuração base por dia)
create table if not exists public.doctor_availability (
  id bigserial primary key,
  doctor_id bigint not null references public.medicos(id),
  date date not null,
  start_time time not null,
  end_time time not null,
  appointment_duration_minutes int not null,
  interval_minutes int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_availability_start_before_end check (start_time < end_time),
  constraint doctor_availability_duration_positive check (appointment_duration_minutes > 0),
  constraint doctor_availability_interval_non_negative check (interval_minutes >= 0)
);

create index if not exists doctor_availability_doctor_date_idx
  on public.doctor_availability (doctor_id, date);

-- 3) Available slots (slots gerados)
create table if not exists public.available_slots (
  id bigserial primary key,
  doctor_id bigint not null references public.medicos(id),
  availability_id bigint not null references public.doctor_availability(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint available_slots_start_before_end check (start_time < end_time),
  constraint available_slots_status_check check (status in ('available','booked','blocked','cancelled'))
);

create unique index if not exists available_slots_unique_doctor_date_start_idx
  on public.available_slots (doctor_id, date, start_time);

create index if not exists available_slots_doctor_date_status_idx
  on public.available_slots (doctor_id, date, status);

