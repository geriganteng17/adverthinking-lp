/* Konfigurasi dasbor. anonKey diisi pas deploy (kunci publik Supabase, aman di browser).
   Jangan taruh kunci lain di sini: service role, token, atau kunci admin HARAM masuk file ini. */
window.DASBOR_CONFIG = {
  supabaseUrl: "https://qpphkgywomddclhkhwlq.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwcGhrZ3l3b21kZGNsaGtod2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjY3NjUsImV4cCI6MjA5NzAwMjc2NX0.C8eZ-LuX4H0CQYOuWDzFn9dH-CR_jn16bKVH6RPaIlo",
  fungsi: "/functions/v1/dasbor-data",
  urlBalik: "https://adverthinking.site/dasbor/"
};
