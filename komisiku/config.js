/* Konfigurasi halaman Komisiku (T-283).
   Isinya cuma alamat publik. Kunci rahasia (service role, token Supabase, Resend,
   bot Telegram) HARAM masuk file ini: semua pengecekan ada di function affiliate. */
window.KOMISIKU_CONFIG = {
  /* Function affiliate (deploy --no-verify-jwt, CORS cuma https://adverthinking.site) */
  api: "https://qpphkgywomddclhkhwlq.supabase.co/functions/v1/affiliate",
  /* Satu-satunya yang disimpan di browser: token sesi 30 hari */
  kunciSesi: "adv_aff_sesi",
  /* Bahan promosi (video, gambar, caption). Tambah aset baru cukup di file ini */
  kit: "kit.json"
};
