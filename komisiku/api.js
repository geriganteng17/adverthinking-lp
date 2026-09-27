/* =====================================================================
   Komisiku · api.js · adaptor data halaman /komisiku/ (T-283)
   Tampilan (app.js) cuma kenal satu antarmuka. Di baliknya ada dua mode:
   - contoh (?contoh=1): data fiktif dari contoh.js, nol jaringan ke API.
     ?keadaan=memuat | gagal | kirim-gagal buat memotret keadaan memuat/galat.
   - asli: fetch ke function affiliate (alamat di config.js). ?api= boleh
     menimpa alamat itu CUMA kalau halaman dibuka dari 127.0.0.1/localhost.
   Yang disimpan di browser cuma token sesi (localStorage adv_aff_sesi).
   Token masuk & token putus hidup di memori saja, tidak pernah disimpan.
   Bentuk jawaban = handler.ts (supabase/functions/affiliate), mode contoh
   meniru bentuk & aturan yang sama supaya tampilan tidak tahu bedanya.
   ===================================================================== */
(function () {
  'use strict';

  var CFG = window.KOMISIKU_CONFIG || {};
  var PARAM = new URLSearchParams(location.search);
  var MODE = PARAM.get('contoh') === '1' ? 'contoh' : 'asli';
  var KUNCI_SESI = CFG.kunciSesi || 'adv_aff_sesi';
  var PESAN_JARINGAN = 'Gagal nyambung ke server. Cek internet kamu lalu coba lagi.';
  /* Kalimat jawaban daftar/masuk dari server (handler.ts PESAN_UMUM_EMAIL), dipakai mode contoh */
  var PESAN_UMUM_EMAIL = 'Kalau emailnya benar, link masuk sudah dikirim. Cek kotak masuk atau folder spam ya, berlaku 30 menit.';

  function galat(status, pesan, salah) {
    return { status: status, pesan: pesan || PESAN_JARINGAN, salah: salah || null };
  }
  function salin(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------
     Alamat API (asli)
     ------------------------------------------------------------------ */
  function halamanLokal() {
    return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  }
  function alamatApi() {
    var dasar = String(CFG.api || '');
    var timpa = PARAM.get('api');
    if (timpa && halamanLokal()) {
      try {
        var u = new URL(timpa);
        if (u.protocol === 'http:' || u.protocol === 'https:') dasar = u.origin + u.pathname;
      } catch (e) { /* alamat timpa rusak: pakai bawaan */ }
    }
    return dasar.replace(/\/+$/, '');
  }
  var API = alamatApi();

  /* ------------------------------------------------------------------
     Sesi: localStorage, dengan cadangan memori kalau penyimpanan diblokir
     ------------------------------------------------------------------ */
  var sesiMemori = '';
  function ambilSesi() {
    try { return localStorage.getItem(KUNCI_SESI) || sesiMemori; } catch (e) { return sesiMemori; }
  }
  function simpanSesi(t) {
    sesiMemori = t;
    try { localStorage.setItem(KUNCI_SESI, t); } catch (e) { /* diblokir: sesi hidup selama tab terbuka */ }
  }
  function hapusSesi() {
    sesiMemori = '';
    try { localStorage.removeItem(KUNCI_SESI); } catch (e) { /* tidak ada yang perlu dihapus */ }
  }

  /* ------------------------------------------------------------------
     Panggilan ke function affiliate
     ------------------------------------------------------------------ */
  function panggil(aksi, opsi) {
    opsi = opsi || {};
    var metode = opsi.metode || 'POST';
    var kepala = {};
    var init = { method: metode, headers: kepala, credentials: 'omit', referrerPolicy: 'no-referrer' };
    if (metode === 'POST') {
      kepala['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opsi.body || {});
      init.cache = 'no-store';
    }
    if (opsi.sesi) {
      var s = ambilSesi();
      if (!s) return Promise.reject(galat(401, 'Perlu masuk dulu'));
      kepala.Authorization = 'Bearer ' + s;
    }
    if (!API) return Promise.reject(galat(0, 'Alamat server belum diisi di config.js.'));
    return fetch(API + '/' + aksi, init).then(function (res) {
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (res.ok && j && typeof j === 'object') return j;
        var pesan = j && typeof j.error === 'string' && j.error
          ? j.error
          : res.status >= 500 ? 'Lagi ada gangguan di server, coba lagi sebentar.' : 'Permintaan belum bisa diproses (kode ' + res.status + ').';
        throw galat(res.status, pesan, j && j.salah && typeof j.salah === 'object' ? j.salah : null);
      });
    }, function () {
      throw galat(0, PESAN_JARINGAN);
    });
  }

  /* putus-lihat: tujuan_snapshot server pakai kunci `nama`, contoh pakai `nama_tujuan` */
  function normalPutus(j) {
    var t = (j && j.tujuan) || {};
    return {
      payout_id: j.payout_id,
      nama: String(j.nama || ''),
      kode: String(j.kode || ''),
      jumlah: Number(j.jumlah) || 0,
      jumlah_order: Number(j.jumlah_order) || 0,
      status: j.status || 'diminta',
      diminta_at: j.diminta_at || '',
      tujuan: {
        jenis: t.jenis === 'bank' ? 'bank' : 'ewallet',
        nama_tujuan: String(t.nama_tujuan || t.nama || ''),
        nomor: String(t.nomor || ''),
        atas_nama: String(t.atas_nama || '')
      },
      rekening_baru_diubah: !!j.rekening_baru_diubah
    };
  }

  function bacaKit(j) {
    if (Array.isArray(j)) return j;
    return j && Array.isArray(j.kit) ? j.kit : [];
  }

  var asli = {
    mode: 'asli',
    punyaSesi: function () { return !!ambilSesi(); },
    hapusSesi: hapusSesi,
    setProfil: function () { /* cuma berarti di mode contoh */ },
    cekEmailAwal: function () { return null; },
    program: function () { return panggil('program', { metode: 'GET' }); },
    daftar: function (isi) { return panggil('daftar', { body: isi }); },
    masuk: function (isi) { return panggil('masuk', { body: isi }); },
    tukar: function (token) {
      return panggil('tukar', { body: { token: token } }).then(function (j) {
        if (!j.sesi) throw galat(500, 'Jawaban server gak lengkap. Minta link masuk baru ya.');
        simpanSesi(String(j.sesi));
        return j;
      });
    },
    status: function () { return panggil('status', { sesi: true }); },
    ubahTujuan: function (isi) { return panggil('ubah-tujuan', { body: isi, sesi: true }); },
    cairkan: function () { return panggil('cairkan', { body: {}, sesi: true }); },
    putusLihat: function (token) { return panggil('putus-lihat', { body: { token: token } }).then(normalPutus); },
    putus: function (token, keputusan, catatan) {
      return panggil('putus', { body: { token: token, keputusan: keputusan, catatan: catatan } });
    },
    keluar: function () {
      /* header Authorization dibaca dulu, baru sesi dihapus. Gagal jaringan tetap dianggap keluar. */
      var kirim = ambilSesi() ? panggil('keluar', { body: {}, sesi: true }) : Promise.resolve({ ok: true });
      hapusSesi();
      return kirim.then(function () { return { ok: true }; }, function () { return { ok: true }; });
    },
    kit: function () {
      return fetch(CFG.kit || 'kit.json', { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw galat(r.status, 'Kit promosi gagal dimuat.');
        return r.json();
      }).then(bacaKit, function (e) {
        throw e && typeof e.status === 'number' ? e : galat(0, 'Kit promosi gagal dimuat.');
      });
    }
  };

  /* ------------------------------------------------------------------
     Mode contoh: tiruan handler.ts di memori (hilang saat muat ulang)
     ------------------------------------------------------------------ */
  /* Salinan TUJUAN_BOLEH & KODE_TERLARANG handler.ts. Mode asli selalu pakai
     jawaban server (program.tujuan_boleh, galat 422), daftar ini cuma buat contoh. */
  var TUJUAN_CONTOH = {
    bank: ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'BTN', 'SeaBank', 'Bank Jago', 'BCA Digital (blu)', 'Jenius (SMBC)', 'Lainnya'],
    ewallet: ['GoPay', 'OVO', 'DANA', 'ShopeePay']
  };
  var KODE_TERLARANG = ['admin', 'adverthinking', 'adv', 'bolo', 'geri', 'ig', 'fb', 'meta', 'tiktok', 'wa', 'iklan',
    'google', 'test', 'tes', 'promo', 'official', 'resmi', 'cs', 'support', 'komisiku', 'affiliate'];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var KODE_RE = /^[a-z0-9][a-z0-9_-]{2,19}$/;

  function teks(v, maks) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, maks) : ''; }
  function normalWa(v) {
    var d = String(v || '').replace(/[^\d+]/g, '');
    if (d.indexOf('+62') === 0) return '0' + d.slice(3);
    if (d.indexOf('62') === 0) return '0' + d.slice(2);
    return d;
  }
  function samarkanEmail(v) {
    var e = String(v || '').trim().toLowerCase();
    var at = e.lastIndexOf('@');
    return at < 1 ? '***' : e.charAt(0) + '***' + e.slice(at);
  }
  function samarkanNomor(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length >= 4 ? '•••• ' + d.slice(-4) : '••••';
  }
  function rpServer(n) { return 'Rp' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function tambahJam(iso, jam) {
    var d = new Date(Date.parse(iso) + jam * 3600e3 + 7 * 3600e3);
    function dua(x) { return (x < 10 ? '0' : '') + x; }
    return d.getUTCFullYear() + '-' + dua(d.getUTCMonth() + 1) + '-' + dua(d.getUTCDate()) + 'T' +
      dua(d.getUTCHours()) + ':' + dua(d.getUTCMinutes()) + ':00+07:00';
  }

  function buatContoh(D) {
    var keadaan = PARAM.get('keadaan');
    /* "Sekarang" di dunia contoh = pagi Rina minta cair (putus_contoh.diminta_at) */
    var JAM = (D.putus_contoh && D.putus_contoh.diminta_at) || '2026-10-27T07:45:00+07:00';
    var program = salin(D.program) || {};
    if (!program.tujuan_boleh) program.tujuan_boleh = salin(TUJUAN_CONTOH);
    var baru = D.affiliate_baru || {};
    var st = {
      profil: 'rina',
      akun: {
        rina: { affiliate: salin(D.affiliate), ringkasan: salin(D.ringkasan), order: salin(D.order || []), payout: salin(D.payout || []) },
        baru: { affiliate: salin(baru.affiliate), ringkasan: salin(baru.ringkasan), order: salin(baru.order || []), payout: salin(baru.payout || []) }
      },
      putusan: null
    };

    /* jenis 'muat' = data awal layar (langsung), 'kirim' = aksi tombol (ada jeda memuat) */
    function tunda(ms, isi, jenis) {
      if (keadaan === 'memuat' && jenis === 'muat') return new Promise(function () { /* sengaja tidak pernah selesai */ });
      return new Promise(function (ok, tolak) {
        setTimeout(function () {
          if (keadaan === 'gagal' || (keadaan === 'kirim-gagal' && jenis === 'kirim')) { tolak(galat(0, PESAN_JARINGAN)); return; }
          try { ok(typeof isi === 'function' ? isi() : isi); } catch (e) { tolak(e); }
        }, ms);
      });
    }
    function akun() { return st.akun[st.profil]; }
    function hitungCair(a) {
      var r = a.ringkasan, t = a.affiliate.tujuan;
      if (r.diminta > 0) return { boleh: false, alasan: 'Pencairan sebelumnya masih diproses.' };
      if (r.siap_cair < program.minimal_cair) return { boleh: false, alasan: 'Minimal cair ' + rpServer(program.minimal_cair) + '.' };
      if (!t) return { boleh: false, alasan: 'Isi rekening atau e-wallet tujuan dulu.' };
      if (t.terkunci_sampai && Date.parse(t.terkunci_sampai) > Date.parse(JAM)) {
        return { boleh: false, alasan: 'Rekening baru diganti, pencairan terbuka lagi 48 jam sesudahnya.' };
      }
      return { boleh: true, alasan: '' };
    }
    function kodeTerpakai(k) {
      return k === st.akun.rina.affiliate.kode || k === st.akun.baru.affiliate.kode;
    }

    return {
      mode: 'contoh',
      punyaSesi: function () { return true; },
      hapusSesi: function () { /* mode contoh: nol sesi */ },
      setProfil: function (p) { st.profil = p === 'baru' ? 'baru' : 'rina'; },
      /* #cek-email dibuka langsung (tanpa isi form dulu): pakai alamat tersamar data contoh */
      cekEmailAwal: function () {
        var c = D.cek_email;
        return c ? { samar: c.email_samar, pesan: PESAN_UMUM_EMAIL, email: c.email_samar, asal: 'masuk' } : null;
      },
      program: function () { return tunda(0, function () { return salin(program); }, 'muat'); },
      daftar: function (isi) {
        return tunda(800, function () {
          if (teks(isi.situs, 200)) return { ok: true, pesan: PESAN_UMUM_EMAIL };
          var nama = teks(isi.nama, 60);
          var email = teks(isi.email, 120).toLowerCase();
          var wa = normalWa(teks(isi.wa, 25));
          var kode = teks(isi.kode, 40).toLowerCase();
          var salah = {};
          if (nama.length < 2) salah.nama = 'Nama minimal 2 huruf';
          if (!EMAIL_RE.test(email)) salah.email = 'Format email belum benar';
          if (!/^0\d{8,14}$/.test(wa)) salah.wa = 'Nomor WA belum benar (contoh 0812xxxxxxxx)';
          if (!KODE_RE.test(kode)) salah.kode = 'Kode 3-20 karakter: huruf kecil, angka, - atau _';
          else if (KODE_TERLARANG.indexOf(kode) !== -1) salah.kode = 'Kode ini tidak bisa dipakai, coba yang lain';
          if (isi.setuju !== true) salah.setuju = 'Centang dulu aturan mainnya';
          if (Object.keys(salah).length) throw galat(422, 'Data belum lengkap', salah);
          if (kodeTerpakai(kode)) throw galat(409, 'Kode sudah dipakai', { kode: 'Kode sudah dipakai orang lain, coba yang lain' });
          return { ok: true, pesan: PESAN_UMUM_EMAIL, email_samar: samarkanEmail(email) };
        }, 'kirim');
      },
      masuk: function (isi) {
        return tunda(700, function () {
          if (teks(isi.situs, 200)) return { ok: true, pesan: PESAN_UMUM_EMAIL };
          var email = teks(isi.email, 120).toLowerCase();
          if (!EMAIL_RE.test(email)) throw galat(422, 'Format email belum benar', { email: 'Format email belum benar' });
          return { ok: true, pesan: PESAN_UMUM_EMAIL, email_samar: samarkanEmail(email) };
        }, 'kirim');
      },
      tukar: function () { return tunda(300, { ok: true, sesi: 'contoh', berlaku_hari: 30 }, 'kirim'); },
      status: function () {
        return tunda(0, function () {
          var a = akun();
          return {
            program: salin(program),
            affiliate: salin(a.affiliate),
            ringkasan: salin(a.ringkasan),
            order: salin(a.order),
            payout: salin(a.payout),
            cairkan: hitungCair(a)
          };
        }, 'muat');
      },
      ubahTujuan: function (isi) {
        return tunda(700, function () {
          var a = akun().affiliate;
          var jenis = isi.jenis === 'bank' || isi.jenis === 'ewallet' ? isi.jenis : null;
          var nama = teks(isi.nama_tujuan, 40);
          var nomor = String(isi.nomor || '').replace(/[\s.-]/g, '');
          var atas = teks(isi.atas_nama, 60);
          var salah = {};
          if (!jenis) salah.jenis = 'Pilih bank atau e-wallet';
          else if (program.tujuan_boleh[jenis].indexOf(nama) === -1) salah.nama_tujuan = 'Pilih dari daftar';
          else if (nama === 'Lainnya') { /* sama dengan handler.ts: bank di luar daftar ditulis sendiri */
            var lain = teks(isi.nama_lain, 40);
            if (!/^[A-Za-z0-9][A-Za-z0-9 .()&'-]{1,39}$/.test(lain)) salah.nama_lain = 'Tulis nama bank (2-40 huruf)';
            else nama = lain;
          }
          if (!/^\d{6,20}$/.test(nomor)) salah.nomor = 'Nomor 6-20 angka';
          if (atas.length < 2) salah.atas_nama = 'Isi nama pemilik rekening';
          if (Object.keys(salah).length) throw galat(422, 'Data rekening belum benar', salah);
          var ganti = !!a.tujuan;
          a.tujuan = {
            jenis: jenis, nama_tujuan: nama, nomor_samar: samarkanNomor(nomor), atas_nama: atas,
            terkunci_sampai: ganti ? tambahJam(JAM, 48) : null
          };
          return { ok: true, terkunci_jam: ganti ? 48 : 0 };
        }, 'kirim');
      },
      cairkan: function () {
        return tunda(900, function () {
          var a = akun();
          var cek = hitungCair(a);
          if (!cek.boleh) throw galat(a.ringkasan.diminta > 0 ? 409 : 422, cek.alasan);
          var r = a.ringkasan, t = a.affiliate.tujuan;
          var id = a.payout.reduce(function (m, p) { return Math.max(m, p.id || 0); }, 0) + 1;
          var jumlah = r.siap_cair;
          a.payout.unshift({ id: id, jumlah: jumlah, status: 'diminta', diminta_at: JAM, diputus_at: null, tujuan: t.nama_tujuan + ' ' + t.nomor_samar });
          a.order.forEach(function (o) { if (o.status === 'siap') o.status = 'diminta'; });
          r.diminta += jumlah;
          r.siap_cair = 0;
          return { ok: true, payout: { id: id, jumlah: jumlah, status: 'diminta' } };
        }, 'kirim');
      },
      putusLihat: function () {
        return tunda(0, function () {
          if (st.putusan) throw galat(403, 'Link tandai sudah kedaluwarsa atau sudah dipakai.');
          return normalPutus(D.putus_contoh || {});
        }, 'muat');
      },
      putus: function (token, keputusan, catatan) {
        return tunda(800, function () {
          if (keputusan !== 'dibayar' && keputusan !== 'ditolak') throw galat(422, 'Pilih dibayar atau ditolak');
          if (st.putusan) throw galat(403, 'Link tandai sudah kedaluwarsa atau sudah dipakai.');
          st.putusan = { keputusan: keputusan, catatan: teks(catatan, 300) };
          /* Kalau di sesi contoh ini Rina sudah klik Cairkan, permintaannya ikut diputus */
          var a = st.akun.rina;
          var p = a.payout.filter(function (x) { return x.status === 'diminta'; })[0];
          if (p) {
            p.status = keputusan;
            p.diputus_at = tambahJam(JAM, 3);
            a.order.forEach(function (o) { if (o.status === 'diminta') o.status = keputusan === 'dibayar' ? 'dibayar' : 'siap'; });
            a.ringkasan.diminta -= p.jumlah;
            if (keputusan === 'dibayar') a.ringkasan.dibayar += p.jumlah;
            else a.ringkasan.siap_cair += p.jumlah;
          }
          return { ok: true, status: keputusan };
        }, 'kirim');
      },
      keluar: function () { return tunda(300, { ok: true }, 'kirim'); },
      kit: function () { return tunda(0, function () { return salin(D.kit || []); }, 'muat'); }
    };
  }

  function muatSkrip(src) {
    return new Promise(function (ok, gagal) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(); };
      s.onerror = function () { gagal(galat(0, 'File ' + src + ' gak kebaca.')); };
      document.head.appendChild(s);
    });
  }

  window.KomisikuApi = {
    mode: MODE,
    siapkan: function () {
      if (MODE === 'asli') return Promise.resolve(asli);
      var siap = window.DATA_CONTOH ? Promise.resolve() : muatSkrip('contoh.js');
      return siap.then(function () {
        if (!window.DATA_CONTOH || !window.DATA_CONTOH.program) throw galat(0, 'Data contoh gak kebaca. Pastikan contoh.js ada di sebelah index.html.');
        return buatContoh(window.DATA_CONTOH);
      });
    }
  };
})();
