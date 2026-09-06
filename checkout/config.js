/* DIBUAT OTOMATIS oleh deploy.ps1 — 2026-09-06 23:12
   Jangan diedit tangan; jalankan deploy.ps1 lagi kalau mau ganti. */
window.CHECKOUT_CONFIG = {
  produksi: true,
  produk: "adverthinking",
  harga: 100000,
  /* ULTIMATE APP: 1 halaman, banyak produk (?produk=). Angka = TAMPILAN; server yang menagih. */
  produkList: {
    adv50:  { nama: "Adverthinking AI - Prompt Builder", sub: "Akses selamanya · tanpa panduan", harga: 50000, tier: 1, bonus: false,
              deskripsi: "Generator prompt 21 tools AI marketing: hook, copy iklan, foto produk, skrip UGC, strategi funnel. Kamu dapat PROMPT-nya, generate-nya di ChatGPT/Gemini kamu sendiri. Bayar sekali Rp50.000.",
              perks: ["21 tools prompt builder", "Sekali bayar, akses selamanya", "Bisa upgrade ke Ultimate kapan pun (+Rp100.000)"],
              catatan: "Ini paket <b>pancingan</b>: prompt saja, tanpa panduan & video. Semua fitur Ultimate kelihatan di app tapi digembok — buka kapan pun dari dalam app.",
              cta: "Bayar Rp50.000 & Mulai" },
    adv150: { nama: "Adverthinking AI Ultimate", sub: "Akses selamanya · semua terbuka", harga: 150000, tier: 2, bonus: true,
              deskripsi: "Semua yang ada: 21 tools + generate langsung di app (Gemini Canvas) + Brand Profile + Labs + panduan & video tiap tool + 4 bonus-tool (Kalender 30 Hari, Paket Animasi, Skor Iklan, Amunisi Laris). Bayar sekali Rp150.000.",
              perks: ["21 tools + generate langsung", "Panduan & video tiap tool", "Brand Profile: isi sekali, semua konsisten", "Bonus 4 tools + Amunisi Laris", "Garansi 14 hari uang kembali"],
              catatan: "Fitur yang masih kami rampungkan ditandai <b>SEGERA</b> di dalam app dan terbuka otomatis begitu jadi — kamu tidak bayar lagi.",
              cta: "Bayar & Aktifkan Ultimate" },
    advup:  { nama: "Upgrade ke Ultimate", sub: "Akun yang sudah ada · +Rp100.000", harga: 100000, tier: 2, upgrade: true, bonus: true,
              deskripsi: "Buka semua gembok di akun kamu: generate langsung, Brand Profile, Labs, panduan & video, 4 bonus-tool. Login tetap pakai email & password lama.",
              perks: ["Semua gembok terbuka", "Tanpa akun baru", "Total sama dengan beli Ultimate langsung"],
              catatan: "Pakai <b>email yang sudah terdaftar</b>. Begitu bayar masuk, tier akun naik otomatis.",
              cta: "Bayar Rp100.000 & Buka Semua" },
    adverthinking: { nama: "Adverthinking AI", sub: "Akses seumur hidup · 20+ tools", harga: 100000, tier: 2, bonus: true }
  },
  hargaBump: 39000,
  tampilkanBump: false,
  /* transfer manual: nyala cuma selama channel Midtrans belum aktif */
  bayarManual: true,
  rekening: { bank: "BCA", nomor: "8620722953", atasNama: "Geri Bintang Swasana" },
  kontak: { telegram: "https://t.me/adverthinking", email: "adverthinking40@gmail.com" },
  clientKey: "Mid-client-rjsM_hQ2YOmRWMC3",
  snapUrl: "",
  endpointCreateOrder: "https://qpphkgywomddclhkhwlq.supabase.co/functions/v1/create-order",
  endpointOrderStatus: "https://qpphkgywomddclhkhwlq.supabase.co/functions/v1/order-status",
};

window.CHECKOUT_CONFIG.snapUrl = window.CHECKOUT_CONFIG.produksi
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";
