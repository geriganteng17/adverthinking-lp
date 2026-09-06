/* DIBUAT OTOMATIS oleh deploy.ps1 — 2026-09-06 09:58
   Jangan diedit tangan; jalankan deploy.ps1 lagi kalau mau ganti. */
window.CHECKOUT_CONFIG = {
  produksi: true,
  produk: "adverthinking",
  harga: 100000,
  hargaBump: 39000,
  tampilkanBump: false,
  clientKey: "Mid-client-rjsM_hQ2YOmRWMC3",
  snapUrl: "",
  endpointCreateOrder: "https://qpphkgywomddclhkhwlq.supabase.co/functions/v1/create-order",
  endpointOrderStatus: "https://qpphkgywomddclhkhwlq.supabase.co/functions/v1/order-status",
};

window.CHECKOUT_CONFIG.snapUrl = window.CHECKOUT_CONFIG.produksi
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";
