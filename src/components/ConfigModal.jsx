import React, { useState, useEffect } from 'react';
import { Database, Key, Check, Copy, ExternalLink, RefreshCw, X, ShieldAlert, Sparkles } from 'lucide-react';
import { getSupabaseConfig, saveSupabaseConfig, getSupabase } from '../lib/supabaseClient';
import { useToast } from './Toast';

export default function ConfigModal({ isOpen, onClose, onConfigSaved }) {
  const { showSuccess, showError } = useToast();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const config = getSupabaseConfig();
      setUrl(config.url || '');
      setAnonKey(config.anonKey || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      showError('Lütfen hem Supabase URL hem de Anon Key değerlerini giriniz.');
      return;
    }

    try {
      setIsTesting(true);
      const client = saveSupabaseConfig(url, anonKey);
      
      // Basit bir sorgu ile testi dene
      const { error } = await client.from('app_users').select('id').limit(1);
      
      if (error && error.code !== 'PGRST116') {
        // Tablolar henüz oluşturulmamış olabilir ama bağlantı başarılıdır
        if (error.message.includes('relation "public.app_users" does not exist') || error.code === '42P01') {
          showSuccess('Supabase bağlantısı başarılı! Ancak SQL tablolarını çalıştırmanız gerekiyor.');
        } else {
          showError(`Supabase Hatası: ${error.message}`);
          setIsTesting(false);
          return;
        }
      } else {
        showSuccess('Supabase bağlantısı başarıyla doğrulandı! 🚀');
      }

      setIsTesting(false);
      onConfigSaved && onConfigSaved();
      onClose();
    } catch (err) {
      setIsTesting(false);
      showError(`Bağlantı hatası: ${err.message}`);
    }
  };

  const copySqlSchema = async () => {
    const sqlContent = `-- 1. Kullanıcılar Tablosu
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

-- 2. Arkadaşlık İstekleri Tablosu
create table if not exists public.friend_requests (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.app_users(id) on delete cascade not null,
    receiver_id uuid references public.app_users(id) on delete cascade not null,
    status text check (status in ('pending', 'accepted', 'rejected')) default 'pending',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    unique (sender_id, receiver_id)
);

-- 3. Mesajlar Tablosu
create table if not exists public.messages (
    id uuid default gen_random_uuid() primary key,
    sender_id uuid references public.app_users(id) on delete cascade not null,
    receiver_id uuid references public.app_users(id) on delete cascade not null,
    content text not null,
    is_read boolean default false,
    created_at timestamp with time zone default now()
);

-- 4. RLS İzinleri
alter table public.app_users enable row level security;
alter table public.friend_requests enable row level security;
alter table public.messages enable row level security;

create policy "Allow all on app_users" on public.app_users for all using (true) with check (true);
create policy "Allow all on friend_requests" on public.friend_requests for all using (true) with check (true);
create policy "Allow all on messages" on public.messages for all using (true) with check (true);

-- 5. Realtime Yayın
alter table public.app_users replica identity full;
alter table public.friend_requests replica identity full;
alter table public.messages replica identity full;

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table public.app_users, public.friend_requests, public.messages;
commit;`;

    try {
      await navigator.clipboard.writeText(sqlContent);
      setCopiedSql(true);
      showSuccess('SQL kurulum kodu panoya kopyalandı! Supabase SQL Editor\'e yapıştırıp çalıştırın.');
      setTimeout(() => setCopiedSql(false), 3000);
    } catch {
      showError('Panoya kopyalanamadı.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-[#111b21] border border-[#222e35] rounded-2xl shadow-2xl overflow-hidden text-[#e9edef]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#2a3942]">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-lg">Supabase Bağlantı Ayarları</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="p-4 rounded-xl bg-[#182229] border border-[#222e35] text-sm text-[#8696a0] space-y-2">
            <div className="flex items-center gap-2 text-[#00a884] font-medium">
              <Sparkles className="w-4 h-4" />
              <span>Ücretsiz ve Hızlı Kurulum Rehberi</span>
            </div>
            <p>
              1. <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-[#53bdeb] underline inline-flex items-center gap-1">supabase.com <ExternalLink className="w-3 h-3" /></a> adresinden ücretsiz bir proje açın.
            </p>
            <p>
              2. <strong>Project Settings → API</strong> kısmından URL ve anon/public key'inizi alıp aşağıya yapıştırın.
            </p>
            <p>
              3. <strong>SQL Editor</strong> sekmesinde aşağıdaki SQL şemasını çalıştırın:
            </p>
            <button
              onClick={copySqlSchema}
              type="button"
              className="mt-1 flex items-center gap-2 px-3 py-1.5 bg-[#202c33] hover:bg-[#2a3942] text-xs font-semibold text-[#00a884] rounded-lg transition-colors border border-[#2a3942]"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'SQL Kodu Kopyalandı!' : 'Kurulum SQL Kodunu Kopyala'}</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#8696a0] mb-1.5 uppercase tracking-wider">
                Supabase Project URL
              </label>
              <div className="relative">
                <Database className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="url"
                  placeholder="https://xyzcompany.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-colors placeholder:text-gray-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8696a0] mb-1.5 uppercase tracking-wider">
                Supabase Anon / Public Key
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-colors placeholder:text-gray-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white bg-transparent hover:bg-[#202c33] transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={isTesting}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] rounded-xl text-sm font-bold shadow-lg transition-all transform active:scale-95 disabled:opacity-50"
              >
                {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{isTesting ? 'Doğrulanıyor...' : 'Kaydet ve Bağlan'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
