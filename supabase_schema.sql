-- ==============================================================================
-- WHATSAPP-WEB-CHAT SUPABASE VERİTABANI KURULUM ŞEMASI
-- Bu SQL kodlarını Supabase projenizin "SQL Editor" kısmına yapıştırıp "RUN" butonuna basınız.
-- ==============================================================================

-- 1. Kullanıcılar Tablosu (Sadece Kullanıcı Adı ile Giriş)
create table if not exists public.app_users (
    id uuid default gen_random_uuid() primary key,
    username text unique not null,
    display_name text not null,
    avatar_seed text default 'Felix',
    bio text default 'Hey! Ben de buradayım 👋',
    is_online boolean default true,
    last_seen timestamp with time zone default now(),
    created_at timestamp with time zone default now()
);

-- Index hızlandırma
create index if not exists idx_app_users_username on public.app_users(username);

-- 2. Arkadaşlık / Sohbet İstekleri Tablosu
create table if not exists public.friend_requests (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.app_users(id) on delete cascade not null,
    receiver_id uuid references public.app_users(id) on delete cascade not null,
    status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (sender_id, receiver_id)
);

create index if not exists idx_friend_requests_sender on public.friend_requests(sender_id);
create index if not exists idx_friend_requests_receiver on public.friend_requests(receiver_id);

-- 3. Mesajlar Tablosu
create table if not exists public.messages (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.app_users(id) on delete cascade not null,
    receiver_id uuid references public.app_users(id) on delete cascade not null,
    content text not null,
    is_read boolean default false,
    created_at timestamp with time zone default now()
);

create index if not exists idx_messages_sender_receiver on public.messages(sender_id, receiver_id);
create index if not exists idx_messages_created_at on public.messages(created_at);

-- 4. Row Level Security (RLS) Ayarları (Anonim ve Herkes Açık İstemci İletişimi İçin)
alter table public.app_users enable row level security;
alter table public.friend_requests enable row level security;
alter table public.messages enable row level security;

-- Tüm tablolara anon / authenticated erişim izinleri
create policy "Allow all operations on app_users" on public.app_users for all using (true) with check (true);
create policy "Allow all operations on friend_requests" on public.friend_requests for all using (true) with check (true);
create policy "Allow all operations on messages" on public.messages for all using (true) with check (true);

-- 5. Gerçek Zamanlı (Realtime) Yayın Ayarları
-- Bu sayede mesajlar, istekler ve çevrimiçi durumu sıfır gecikmeyle anında karşı tarafa düşer!
alter table public.app_users replica identity full;
alter table public.friend_requests replica identity full;
alter table public.messages replica identity full;

-- Supabase Realtime yayınına tabloları ekleme (Eğer önceden eklenmediyse)
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.app_users, public.friend_requests, public.messages;
commit;
