# 💬 Whatsup Web - Engelsiz Gerçek Zamanlı Mesajlaşma

> **MEB, Okul, Üniversite ve Kurumsal Ağlarda %100 Çalışan, Her Cihaz ve İşletim Sistemiyle Uyumlu, Supabase Destekli WhatsApp Tarzı Web Uygulaması**

---

## 🌟 Öne Çıkan Özellikler

1. **🌐 MEB & Kurumsal Ağ Engelini Aşma Stratejisi:**
   - Standart GitHub Pages veya Vercel alan adları üzerinden saf istemci (Client-side SPA) olarak sunulur.
   - Şifreli `WSS` (WebSocket Secure) ve `HTTPS` protokolleri üzerinden Supabase ile haberleşir; standart web trafiği gibi göründüğü için filtreleme sistemlerine takılmaz.
2. **📱 Her Cihaz ve İşletim Sistemiyle %100 Uyumlu:**
   - iOS (iPhone / iPad Safari), Android (Chrome, Edge), Windows, macOS, Linux, Chromebook ve Akıllı Tahtalarda tarayıcı üzerinden anında çalışır.
   - PWA (Progressive Web App) desteğiyle "Ana Ekrana Ekle" diyerek uygulama gibi yüklenebilir.
3. **🔑 Sadece Kullanıcı Adı ile Hızlı Giriş:**
   - E-posta doğrulama linki veya telefon numarası gerektirmez.
   - Benzersiz bir kullanıcı adı seçip anında sohbete başlanabilir.
4. **🔍 Kullanıcı Arama ve Sohbet İsteği Sistemi:**
   - Arama çubuğuna arkadaşınızın kullanıcı adını yazarak aratın.
   - İstek gönderin; karşı taraf gelen istekler kutusundan kabul ettiğinde anlık sohbet kanalı açılır.
5. **📋 Tek Tıkla Mesaj Kopyalama Butonu:**
   - Gönderilen veya alınan **her mesajın yanında** anında panoya kopyalama simgesi bulunur.
   - Tıklandığında "Kopyalandı!" animasyonu gösterilir.
6. **⚡ Sıfır Gecikmeli Gerçek Zamanlı İletişim (Supabase Realtime):**
   - Sayfa yenilemeye gerek olmadan mesajlar anında ekranda belirir.
   - Okundu bilgisi (çift mavi tik) ve çevrimiçi durumu desteği.

---

## 🚀 5 Dakikada Hızlı Kurulum Rehberi

### Adım 1: Ücretsiz Supabase Projesi Oluşturma
1. [supabase.com](https://supabase.com) adresine gidip ücretsiz üye olun ve **New Project** diyerek yeni bir veritabanı oluşturun.
2. Sol menüden **SQL Editor** sekmesine tıklayın.
3. Proje klasöründeki `supabase_schema.sql` dosyasının içeriğini kopyalayıp buraya yapıştırın ve **Run** butonuna basın.
4. Sol menüden **Project Settings → API** bölümüne gidip:
   - `Project URL`
   - `Project API Keys (anon / public)`
   bilgilerini not edin.

---

### Adım 2: Uygulamayı GitHub Pages'a Yükleme (Otomatik Canlıya Alma)
1. Bu projeyi kendi GitHub hesabınızda yeni bir repo oluşturup yükleyin (`git push`).
2. GitHub reponuzda **Settings → Pages** sekmesine gidin:
   - **Build and deployment → Source** kısmını **GitHub Actions** olarak seçin.
3. Birkaç saniye içinde projeniz `https://<kullanici-adiniz>.github.io/<repo-adiniz>/` adresinde herkese açık olarak yayına girecektir!

---

### Adım 3: İlk Giriş ve Ayar
1. Sitenizi tarayıcıda açın.
2. Sağ üstteki ⚙️ **Supabase Ayarları** ikonuna tıklayın ve 1. Adımda aldığınız URL ve Anon Key değerlerini yapıştırıp **Kaydet**'e basın.
3. Kendinize bir kullanıcı adı belirleyin ve hemen mesajlaşmaya başlayın!

---

## 💻 Yerel Geliştirme (Localhost)

Projeyi kendi bilgisayarınızda çalıştırmak için:

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# Üretim için derleme (dist klasörü oluşturur)
npm run build
```

---

## 📂 Proje Dosya Yapısı

```
whatsup-chat/
├── .github/workflows/deploy.yml   # Otomatik GitHub Pages dağıtım iş akışı
├── src/
│   ├── components/
│   │   ├── AuthModal.jsx          # Kullanıcı adı ile giriş penceresi
│   │   ├── Avatar.jsx             # MEB engeline karşı dayanıklı akıllı avatar
│   │   ├── ChatArea.jsx           # Mesajlaşma alanı ve Kopyalama butonu
│   │   ├── ConfigModal.jsx        # Supabase URL/Key ayar penceresi
│   │   ├── FriendRequestsModal.jsx# İstek onaylama/reddetme penceresi
│   │   ├── Sidebar.jsx            # Sohbet listesi ve arama
│   │   ├── Toast.jsx              # Bildirim kutucukları
│   │   ├── UserProfileModal.jsx   # Profil ve avatar düzenleme
│   │   └── UserSearchModal.jsx    # Kullanıcı bulma ve istek gönderme
│   ├── lib/
│   │   └── supabaseClient.js      # Supabase bağlantı ve CRUD fonksiyonları
│   ├── App.jsx                    # Ana uygulama bileşeni
│   ├── index.css                  # Tailwind v4 ve WhatsApp teması
│   └── main.jsx                   # React giriş noktası
├── supabase_schema.sql            # Supabase tek tıkla kurulum SQL kodu
├── vite.config.js                 # Vite & GitHub Pages uyumlu ayarlar
└── package.json
```

---

## 🛡️ Lisans
Bu proje açık kaynaklı ve MIT lisansı ile korunmaktadır. Dilediğiniz gibi geliştirebilir ve paylaşabilirsiniz.
