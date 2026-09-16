begin;

create table if not exists public.allowed_models (
  model_id text primary key,
  display_name text not null,
  description text not null,
  recommended_use text not null,
  allowed_reasoning_efforts text[] not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint allowed_models_model_id_valid
    check (model_id ~ '^[a-z0-9][a-z0-9._-]{1,199}$'),
  constraint allowed_models_display_name_length
    check (char_length(display_name) between 1 and 80),
  constraint allowed_models_description_length
    check (char_length(description) between 1 and 300),
  constraint allowed_models_recommended_use_length
    check (char_length(recommended_use) between 1 and 300),
  constraint allowed_models_reasoning_efforts_valid
    check (
      cardinality(allowed_reasoning_efforts) between 1 and 6
      and allowed_reasoning_efforts
        <@ array['none', 'low', 'medium', 'high', 'xhigh', 'max']::text[]
    ),
  constraint allowed_models_default_must_be_active
    check (not is_default or is_active)
);

create unique index if not exists allowed_models_one_default
  on public.allowed_models ((is_default))
  where is_default;

alter table public.allowed_models enable row level security;

drop policy if exists "Authenticated users can read active allowed models"
  on public.allowed_models;

create policy "Authenticated users can read active allowed models"
  on public.allowed_models
  for select
  to authenticated
  using (is_active);

revoke all on table public.allowed_models from anon, authenticated;
grant select on table public.allowed_models to authenticated;

insert into public.allowed_models (
  model_id,
  display_name,
  description,
  recommended_use,
  allowed_reasoning_efforts,
  is_active,
  is_default,
  sort_order
)
values
  (
    'gpt-6-astra',
    'GPT-6 Astra',
    '가장 높은 품질이 필요한 복잡한 작업에 적합한 모델입니다.',
    '어려운 전문 주제나 품질을 가장 우선하는 글에 권장합니다.',
    array['low', 'medium', 'high', 'xhigh', 'max']::text[],
    true,
    false,
    40
  ),
  (
    'gpt-5.6-sol',
    'GPT-5.6 Sol',
    '전문적인 글 작성과 복합 작업에 적합한 고성능 모델입니다.',
    '정확성과 완성도가 중요한 전문 콘텐츠에 권장합니다.',
    array['none', 'low', 'medium', 'high', 'xhigh', 'max']::text[],
    true,
    false,
    30
  ),
  (
    'gpt-5.6-terra',
    'GPT-5.6 Terra',
    '품질과 효율의 균형이 좋은 범용 모델입니다.',
    '대부분의 블로그 글 작성에 권장합니다.',
    array['none', 'low', 'medium', 'high', 'xhigh', 'max']::text[],
    true,
    true,
    20
  ),
  (
    'gpt-5.6-luna',
    'GPT-5.6 Luna',
    '빠른 반복 작업과 가벼운 초안 작성에 적합한 모델입니다.',
    '많은 초안을 빠르게 확인하는 작업에 권장합니다.',
    array['none', 'low', 'medium', 'high', 'xhigh', 'max']::text[],
    true,
    false,
    10
  )
on conflict (model_id) do nothing;

commit;
