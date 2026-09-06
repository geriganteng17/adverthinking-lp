/* DIBUAT OTOMATIS oleh deploy.ps1 — 2026-09-06 20:11
   Jangan diedit tangan; jalankan deploy.ps1 lagi kalau mau ganti. */
window.CHECKOUT_CONFIG = {
  produksi: true,
  produk: "adverthinking",
  harga: 100000,
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
