/* =====================================================================
   Dasbor Adverthinking AI · versi final (T-320)
   Alur: config.js -> muatData() (contoh ATAU Supabase Auth + edge function
   dasbor-data) -> pasangData() -> render. Halaman CUMA BACA: nol tulis ke
   database. Satu-satunya aksi akun: masuk, keluar, bikin/ganti password.
   Nol console.log (data pembeli gak boleh bocor ke konsol).
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 1. Konfigurasi & mode ---------------- */
  var CFG = window.DASBOR_CONFIG || {};
  var PARAM = new URLSearchParams(location.search);
  var MODE_CONTOH = PARAM.get('contoh') === '1';
  var URL_SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
  var KUNCI_FLAG_GANTI = 'dasbor-minta-password';     // penanda "aku barusan minta link password"
  var elIsi = document.getElementById('isi');

  /* ---------------- 2. Alat umum ---------------- */
  var HARI = 864e5;
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var fmtAngka = new Intl.NumberFormat('id-ID');
  var fmtBagian = null;                                  // dibuat di pasangData (butuh zona dari data)

  function waktu(iso) { return iso ? Date.parse(iso) : null; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rupiah(n) { return 'Rp' + fmtAngka.format(n || 0); }
  function rupiahPendek(n) {
    if (n >= 1e6) return 'Rp' + fmtAngka.format(Math.round(n / 1e5) / 10) + 'jt';
    if (n >= 1e3) return 'Rp' + fmtAngka.format(Math.round(n / 1e3)) + 'rb';
    return 'Rp' + fmtAngka.format(n);
  }
  function persen(a, b) { return b ? Math.round(a / b * 100) + '%' : '0%'; }
  function besarAwal(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  var NAMA_SUMBER = { facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram', whatsapp: 'WhatsApp', tiktok: 'TikTok', google: 'Google', youtube: 'YouTube' };
  function namaSumber(s) { return NAMA_SUMBER[String(s).toLowerCase()] || besarAwal(s); }
  function jumlah(arr) { return arr.reduce(function (s, o) { return s + (o.nominal || 0); }, 0); }

  function bagian(t) {
    var o = {};
    fmtBagian.formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; });
    return { th: +o.year, bl: +o.month - 1, tg: +o.day, jam: (+o.hour) % 24, mnt: +o.minute };
  }
  function kunciHari(t) { var b = bagian(t); return b.th + '-' + pad(b.bl + 1) + '-' + pad(b.tg); }
  function awalHari(t) {
    var b = bagian(t);
    var geser = Date.UTC(b.th, b.bl, b.tg, b.jam, b.mnt) - Math.floor(t / 6e4) * 6e4; // selisih zona
    return Date.UTC(b.th, b.bl, b.tg) - geser;
  }
  function tgl(t) { var b = bagian(t); return b.tg + ' ' + BULAN[b.bl]; }
  function tglJam(t) { var b = bagian(t); return b.tg + ' ' + BULAN[b.bl] + ', ' + pad(b.jam) + ':' + pad(b.mnt); }
  // Versi sel tabel: jam dibungkus biar bisa disembunyikan di HP (baris sempit)
  function waktuSel(t) { var b = bagian(t); return b.tg + ' ' + BULAN[b.bl] + '<span class="jam">, ' + pad(b.jam) + ':' + pad(b.mnt) + '</span>'; }
  function hariSejak(t) { return Math.floor((SEKARANG - t) / HARI); }
  function relatif(t) {
    var d = SEKARANG - t;
    if (d < 6e4) return 'barusan';
    if (d < 36e5) return Math.floor(d / 6e4) + ' menit lalu';
    if (d < HARI) return Math.floor(d / 36e5) + ' jam lalu';
    var h = Math.floor(d / HARI);
    if (h < 30) return h + ' hari lalu';
    return Math.floor(h / 30) + ' bulan lalu';
  }

  /* ---------------- 3. Kamus status ---------------- */
  var KELAS_STATUS = {
    paid: 'lunas', pending: 'nunggu', pending_manual: 'nunggu', challenge: 'nunggu',
    expired: 'abu', cancelled: 'abu', refunded: 'abu',
    denied: 'bahaya', selisih_nominal: 'bahaya', gagal_token: 'bahaya'
  };
  var GRUP = {
    lunas: ['paid'],
    nunggu: ['pending', 'pending_manual', 'challenge'],
    batal: ['expired', 'cancelled'],
    masalah: ['selisih_nominal', 'gagal_token', 'denied']
  };
  var CHIP_ORDER = [['semua', 'Semua'], ['lunas', 'Lunas'], ['nunggu', 'Nunggu'], ['batal', 'Kedaluwarsa/Batal'], ['masalah', 'Bermasalah']];

  /* ---------------- 4. Data aktif (diisi pasangData) ---------------- */
  var D = null, SEKARANG = Date.now(), LABEL = {}, LABEL_BAYAR = {};
  var ORDER = [], PEMBELI = [], KOMISI = 0, BATAS_LOGIN = 2, AWAL_DATA = Date.now(), AFFILIATE = [];

  function labelStatus(s) { return LABEL[s] || s; }
  function tagStatus(s, teks) {
    return '<span class="status status--' + (KELAS_STATUS[s] || 'abu') + '">' + esc(teks || labelStatus(s)) + '</span>';
  }
  function labelBayar(c) { return c ? (LABEL_BAYAR[c] || c) : null; }
  function dalamGrup(o, g) { return g === 'semua' || (GRUP[g] || []).indexOf(o.status) > -1; }

  function pasangData(data) {
    D = data;
    var zona = data.zona || 'Asia/Jakarta';
    fmtBagian = new Intl.DateTimeFormat('en-GB', { timeZone: zona, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    SEKARANG = Date.parse(data.dibuat) || Date.now();     // "sekarang" = waktu data dibuat server
    LABEL = data.status_label || {};
    LABEL_BAYAR = data.cara_bayar_label || {};
    ORDER = data.order.slice().sort(function (a, b) { return waktu(b.dibuat) - waktu(a.dibuat); });
    PEMBELI = data.pembeli.slice().sort(function (a, b) { return waktu(b.daftar) - waktu(a.daftar); });
    var aturan = data.aturan || {};
    KOMISI = aturan.komisi_per_lunas || 0;
    BATAS_LOGIN = aturan.belum_login_hari || 2;
    AWAL_DATA = ORDER.length ? Math.min.apply(null, ORDER.map(function (o) { return waktu(o.dibuat); })) : SEKARANG;
    AFFILIATE = hitungAffiliate();
    S.refBuka = {};
    if (AFFILIATE.length) S.refBuka[AFFILIATE[0].ref] = true; // ref teratas kebuka biar kelihatan isinya
    var contoh = data.sumber !== 'live';
    document.querySelectorAll('[data-lencana-contoh]').forEach(function (el) { el.hidden = !contoh; });
    halamanAktif = null;
  }

  /* ---------------- 5. Olah data ---------------- */
  var PERIODE = {
    hari: { label: 'Hari ini', hari: 1, sub: 'hari ini' },
    '7': { label: '7 hari', hari: 7, sub: '7 hari terakhir' },
    '30': { label: '30 hari', hari: 30, sub: '30 hari terakhir' }
  };
  function rentang(kode) {
    var p = PERIODE[kode];
    return { mulai: awalHari(SEKARANG) - (p.hari - 1) * HARI, akhir: SEKARANG, hari: p.hari };
  }
  function diRentang(t, r) { return t != null && t >= r.mulai && t <= r.akhir; }

  function hitungRingkasan(kode) {
    var r = rentang(kode);
    var lunas = ORDER.filter(function (o) { return o.status === 'paid' && diRentang(waktu(o.dibayar), r); });
    var dibuat = ORDER.filter(function (o) { return diRentang(waktu(o.dibuat), r); });
    var dibuatLunas = dibuat.filter(function (o) { return o.status === 'paid'; });
    var nunggu = ORDER.filter(function (o) { return dalamGrup(o, 'nunggu'); });            // kondisi sekarang
    var transfer = nunggu.filter(function (o) { return o.status === 'pending_manual'; });
    var lewatRef = lunas.filter(function (o) { return !!o.ref; });
    return { r: r, lunas: lunas, omzet: jumlah(lunas), dibuat: dibuat, dibuatLunas: dibuatLunas, nunggu: nunggu, transfer: transfer, lewatRef: lewatRef };
  }
  function perluDicekOrder() {
    return {
      transfer: ORDER.filter(function (o) { return o.status === 'pending_manual'; }),
      tanpaAkun: ORDER.filter(function (o) { return o.status === 'paid' && !o.akun_dibuat; }),
      beda: ORDER.filter(function (o) { return o.status === 'selisih_nominal'; })
    };
  }
  function hitungPembeli() {
    var sudah = PEMBELI.filter(function (p) { return !!p.login_terakhir; });
    var belum = PEMBELI.filter(function (p) { return !p.login_terakhir; });
    var lamaBelum = belum
      .filter(function (p) { return SEKARANG - waktu(p.daftar) > BATAS_LOGIN * HARI; })
      .map(function (p) { return { p: p, hari: hariSejak(waktu(p.daftar)) }; })
      .sort(function (a, b) { return a.hari - b.hari; });
    return { sudah: sudah, belum: belum, lamaBelum: lamaBelum, tanpaAkun: perluDicekOrder().tanpaAkun };
  }
  function hitungAffiliate() {
    var peta = {};
    ORDER.forEach(function (o) {
      if (!o.ref) return;
      var r = peta[o.ref] || (peta[o.ref] = { ref: o.ref, order: [], lunas: 0 });
      r.order.push(o);
      // Aturan komisi v1: status paid + produk adverthinking + ada ref (upgrade & refund gak dihitung)
      if (o.status === 'paid' && o.produk === 'adverthinking') r.lunas++;
    });
    return Object.keys(peta).map(function (k) { var r = peta[k]; r.komisi = r.lunas * KOMISI; return r; })
      .sort(function (a, b) { return b.komisi - a.komisi || b.order.length - a.order.length || (a.ref < b.ref ? -1 : 1); });
  }
  function kelompok(arr, kunciFn) {
    var peta = {}, urut = [];
    arr.forEach(function (o) { var k = kunciFn(o); if (!(k in peta)) { peta[k] = 0; urut.push(k); } peta[k]++; });
    return urut.map(function (k) { return { kunci: k, n: peta[k] }; })
      .sort(function (a, b) { return b.n - a.n || (a.kunci === '' ? 1 : b.kunci === '' ? -1 : 0); });
  }

  /* ---------------- 6. Keadaan layar ---------------- */
  var S = {
    fase: 'mulai',            // mulai | masuk | memuat | siap | gagal | bukan-pemilik
    galat: null,              // { judul, teks } buat fase gagal
    email: '',                // email sesi (live) atau "Bolo" (contoh)
    periode: '30', filterOrder: 'semua', cari: '', filterPembeli: 'semua', refBuka: {}
  };
  var halamanAktif = null;

  /* ---------------- 7. Potongan tampilan bersama ---------------- */
  var urutPanel = 0;
  function panelBuka(kelas, labelId) {
    return '<section class="panel ' + kelas + '" style="--i:' + (urutPanel++) + '"' + (labelId ? ' aria-labelledby="' + labelId + '"' : '') + '>';
  }
  function kartuAngka(k) {
    return '<div class="panel kartu-angka' + (k.besar ? ' kartu-angka--besar' : '') + '" style="--i:' + (urutPanel++) + '">' +
      '<p class="label">' + esc(k.label) + '</p>' +
      '<p class="nilai angka' + (k.omzet ? ' nilai--omzet text-ember' : '') + '">' + esc(String(k.nilai)) + '</p>' +
      (k.ket ? '<p class="ket">' + esc(k.ket) + '</p>' : '') + '</div>';
  }
  function segmenPeriode() {
    return '<div class="segmen" role="group" aria-label="Pilih periode">' + ['hari', '7', '30'].map(function (k) {
      return '<button type="button" data-periode="' + k + '" aria-pressed="' + (S.periode === k) + '">' + PERIODE[k].label + '</button>';
    }).join('') + '</div>';
  }
  function kakiHp() {
    return '<p class="kaki-hp"><span>Masuk sebagai ' + esc(S.email || 'pemilik') + '</span><button type="button" class="tautan-kecil" data-keluar>Keluar</button></p>';
  }
  function itemCek(href, nama, meta, kanan) {
    var isi = '<span class="cek-nama">' + esc(nama) + '</span><span class="cek-kanan">' + kanan + '</span><span class="cek-meta">' + esc(meta) + '</span>';
    return '<li>' + (href ? '<a class="cek-item" href="' + href + '" data-order-link="' + esc(href.split('/')[1] || '') + '">' + isi + '</a>' : '<div class="cek-item">' + isi + '</div>') + '</li>';
  }
  function grupCek(kelas, judul, saran, jumlahItem, isiDaftar) {
    return '<div class="cek-grup"><div class="cek-judul"><span class="status status--' + kelas + '">' + esc(judul) + '</span>' +
      '<span class="angka">' + jumlahItem + '</span></div><p class="cek-saran">' + esc(saran) + '</p>' +
      '<ul class="cek-daftar">' + isiDaftar + '</ul></div>';
  }
  // Satu baris order. mode 'ringkas' = kode + waktu ditumpuk (gaya kolom Order ID Scalev)
  function barisOrder(o, mode) {
    var bayar = labelBayar(o.cara_bayar);
    var kode = '<a href="#order/' + esc(o.order_id) + '" data-order-link="' + esc(o.order_id) + '">' + esc(o.order_id) + '</a>';
    var s = '<tr data-href="#order/' + esc(o.order_id) + '">';
    if (mode === 'ringkas') {
      s += '<td class="sel-kode">' + kode + '<small class="angka"><span class="m-saja"> · </span>' + waktuSel(waktu(o.dibuat)) + '</small></td>';
    } else {
      s += '<td class="sel-kode">' + kode + '</td><td class="sel-waktu angka">' + waktuSel(waktu(o.dibuat)) + '</td>';
    }
    s += '<td class="sel-pembeli"><b>' + esc(o.nama) + '</b><small>' + esc(o.email) + '</small></td>' +
      '<td class="sel-nominal kanan angka">' + rupiah(o.nominal) + '</td>' +
      '<td class="sel-status">' + tagStatus(o.status) + '</td>';
    if (mode !== 'ringkas') {
      s += '<td class="sel-bayar">' + (bayar ? esc(bayar) : '<span class="redup">Belum dipilih</span>') + '</td>' +
        '<td class="sel-ref">' + (o.ref ? esc(o.ref) : '<span class="sr-only">tanpa ref</span>') + '</td>';
    }
    return s + '</tr>';
  }
  function kepalaTabelOrder(mode) {
    return '<thead><tr><th scope="col">Kode</th>' + (mode === 'ringkas' ? '' : '<th scope="col">Waktu</th>') +
      '<th scope="col">Pembeli</th><th scope="col" class="kanan">Nominal</th><th scope="col">Status</th>' +
      (mode === 'ringkas' ? '' : '<th scope="col">Cara bayar</th><th scope="col">Ref</th>') + '</tr></thead>';
  }

  /* ---------------- 8. Layar Ringkasan ---------------- */
  function gambarRingkasan() {
    var h = hitungRingkasan(S.periode);
    var p = PERIODE[S.periode];
    var nOnline = h.nunggu.length - h.transfer.length;
    urutPanel = 0;
    var html = '<div class="periode-hp">' + segmenPeriode() + '</div><div class="grid-ringkasan">';
    html += '<section class="kpi" aria-label="Angka utama, ' + esc(p.sub) + '">';
    html += kartuAngka({ label: 'Omzet lunas', nilai: rupiah(h.omzet), omzet: true, besar: true, ket: 'Per tanggal dibayar, ' + p.sub + '. Kotor, belum dipotong biaya Midtrans.' });
    html += kartuAngka({ label: 'Order lunas', nilai: h.lunas.length, ket: h.lewatRef.length + ' lewat kode affiliate' });
    html += kartuAngka({ label: 'Nunggu bayar', nilai: h.nunggu.length, ket: h.transfer.length + ' transfer BCA, ' + nOnline + ' bayar online. Kondisi sekarang.' });
    html += kartuAngka({ label: 'Konversi', nilai: persen(h.dibuatLunas.length, h.dibuat.length),
      ket: h.dibuat.length ? h.dibuatLunas.length + ' dari ' + h.dibuat.length + ' order dibuat sudah lunas' : 'Belum ada order dibuat' });
    html += '</section>';
    // Dua kolom mandiri (kiri 2, kanan 1) biar panel pendek gak ninggalin lubang
    html += '<div class="kolom-kiri">' + panelGrafik(h) + panelTerbaru() + '</div>';
    html += '<div class="kolom-kanan">' + panelPerluDicek() + panelSumber(h) + '</div>';
    html += '</div>' + kakiHp();
    elIsi.innerHTML = html;
    pasangGrafik(h);
  }

  function panelPerluDicek() {
    var c = perluDicekOrder();
    var total = c.transfer.length + c.tanpaAkun.length + c.beda.length;
    var s = panelBuka('panel--perlu', 'h-perlu') + '<div class="panel-kepala"><h2 id="h-perlu">Perlu dicek</h2><span class="ket">Kondisi sekarang</span></div>';
    if (!total) return s + '<p class="kosong">Aman. Gak ada order yang nyangkut.</p></section>';
    if (c.tanpaAkun.length) {
      s += grupCek('bahaya', 'Sudah bayar, akun belum ada', 'Belum bisa masuk app. Buat akunnya manual.', c.tanpaAkun.length,
        c.tanpaAkun.map(function (o) { return itemCek('#order/' + o.order_id, o.nama, o.order_id, '<b class="angka">' + rupiah(o.nominal) + '</b>Lunas ' + esc(tgl(waktu(o.dibayar)))); }).join(''));
    }
    if (c.beda.length) {
      s += grupCek('bahaya', 'Nominal beda', 'Jumlah bayar gak sama dengan tagihan. Cek di Midtrans sebelum kasih akses.', c.beda.length,
        c.beda.map(function (o) { return itemCek('#order/' + o.order_id, o.nama, o.order_id, '<b class="angka">' + rupiah(o.nominal) + '</b>' + esc(tgl(waktu(o.dibuat)))); }).join(''));
    }
    if (c.transfer.length) {
      s += grupCek('nunggu', 'Nunggu transfer', 'Cocokkan dengan mutasi BCA, lalu lunasi lewat bot CS.', c.transfer.length,
        c.transfer.map(function (o) { return itemCek('#order/' + o.order_id, o.nama, o.order_id, '<b class="angka">' + rupiah(o.nominal) + '</b>' + esc(relatif(waktu(o.dibuat)))); }).join(''));
    }
    return s + '</section>';
  }

  function panelGrafik(h) {
    var perJam = S.periode === 'hari';
    var data = ember(S.periode, h.lunas);
    var puncak = null;
    data.forEach(function (e) { if (e.nilai && (!puncak || e.nilai >= puncak.nilai)) puncak = e; });
    var ringkas = puncak ? (perJam ? 'Jam tertinggi ' : 'Hari tertinggi ') + puncak.judul + ', ' + rupiah(puncak.nilai) : 'Belum ada order lunas di periode ini';
    return panelBuka('panel--grafik', 'h-grafik') + '<div class="panel-kepala"><h2 id="h-grafik">Omzet lunas per ' + (perJam ? 'jam' : 'hari') + '</h2>' +
      '<span class="ket">' + esc(PERIODE[S.periode].sub) + ', WIB</span></div>' +
      '<div class="grafik" role="img" aria-label="' + esc('Grafik omzet lunas per ' + (perJam ? 'jam' : 'hari') + ', ' + PERIODE[S.periode].sub + '. ' + ringkas + '.') + '"></div>' +
      '<div class="grafik-bawah">' + (perJam ? '<span class="kunci kunci--ini">Hari ini</span>' : '<span class="kunci kunci--ini">Hari ini</span><span class="kunci">Hari lain</span>') +
      '<span>' + (puncak ? esc(perJam ? 'Jam tertinggi ' : 'Hari tertinggi ') + '<b class="angka">' + esc(puncak.judul) + ', ' + rupiah(puncak.nilai) + '</b>' : 'Belum ada order lunas di periode ini') + '</span>' +
      '</div></section>';
  }
  // Ember grafik: per hari (7/30 hari) atau per jam (hari ini)
  function ember(kode, lunas) {
    var r = rentang(kode), isi = [], i;
    if (kode === 'hari') {
      for (i = 0; i < 24; i++) isi.push({ label: pad(i), judul: pad(i) + ':00', nilai: 0, n: 0, ini: true });
      lunas.forEach(function (o) { var j = bagian(waktu(o.dibayar)).jam; isi[j].nilai += o.nominal; isi[j].n++; });
      return isi;
    }
    var idx = {};
    for (i = 0; i < r.hari; i++) {
      var t = r.mulai + i * HARI + 12 * 36e5;
      idx[kunciHari(t)] = i;
      isi.push({ label: tgl(t), judul: tgl(t), nilai: 0, n: 0, ini: i === r.hari - 1 });
    }
    lunas.forEach(function (o) { var k = kunciHari(waktu(o.dibayar)); if (k in idx) { isi[idx[k]].nilai += o.nominal; isi[idx[k]].n++; } });
    return isi;
  }
  function svgGrafik(data, lebar, tinggi, kode) {
    var kiri = 54, kanan = 6, atas = 10, bawah = 26;
    var w = Math.max(lebar - kiri - kanan, 40), h = Math.max(tinggi - atas - bawah, 40);
    var maks = 0;
    data.forEach(function (e) { if (e.nilai > maks) maks = e.nilai; });
    var puncak = Math.max(100000, Math.ceil(maks / 100000) * 100000);
    var slot = w / data.length;
    var lebarB = Math.max(3, Math.min(26, slot * 0.6));
    var s = '<defs><linearGradient id="bara-batang" x1="0" y1="0" x2="0" y2="1"><stop class="stop-atas" offset="0"/><stop class="stop-bawah" offset="1"/></linearGradient></defs>';
    [0, 0.5, 1].forEach(function (f) {
      var y = Math.round(atas + h - h * f) + 0.5;
      s += '<line class="garis-bantu" x1="' + kiri + '" x2="' + (kiri + w) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="sumbu-teks" x="' + (kiri - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + rupiahPendek(puncak * f) + '</text>';
    });
    // Label sumbu X: tiap 5 hari, jadi tiap 10 kalau layar sempit (HP) biar gak dempet
    var tiap = kode === 'hari' ? 6 : (data.length > 10 ? (slot * 5 >= 52 ? 5 : 10) : 1);
    data.forEach(function (e, i) {
      var x0 = kiri + slot * i;
      var bh = e.nilai ? Math.max(3, h * e.nilai / puncak) : 0;
      var judul = e.judul + ': ' + (e.nilai ? rupiah(e.nilai) + ' dari ' + e.n + ' order' : 'belum ada yang lunas');
      s += '<g><title>' + esc(judul) + '</title><rect class="sasaran" x="' + x0.toFixed(1) + '" y="' + atas + '" width="' + slot.toFixed(1) + '" height="' + h + '"/>';
      if (bh) {
        s += '<rect class="batang' + (e.ini ? ' batang--ini' : '') + '" x="' + (x0 + (slot - lebarB) / 2).toFixed(1) + '" y="' + (atas + h - bh).toFixed(1) +
          '" width="' + lebarB.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(4, lebarB / 3).toFixed(1) + '"/>';
      }
      s += '</g>';
      var tampil = kode === 'hari' ? i % tiap === 0 : (data.length - 1 - i) % tiap === 0;
      if (tampil) {
        s += '<text class="sumbu-teks' + (e.ini && kode !== 'hari' ? ' sumbu-teks--ini' : '') + '" x="' + (x0 + slot / 2).toFixed(1) +
          '" y="' + (tinggi - 7) + '" text-anchor="middle">' + esc(e.label) + '</text>';
      }
    });
    return '<svg width="' + lebar + '" height="' + tinggi + '" viewBox="0 0 ' + lebar + ' ' + tinggi + '" aria-hidden="true" focusable="false">' + s + '</svg>';
  }
  var pengamatGrafik = null;
  function pasangGrafik(h) {
    var el = elIsi.querySelector('.grafik');
    if (pengamatGrafik) { pengamatGrafik.disconnect(); pengamatGrafik = null; }
    if (!el) return;
    var data = ember(S.periode, h.lunas), kode = S.periode;
    function gambarUlang() {
      var w = Math.floor(el.clientWidth);
      if (!w || +el.getAttribute('data-lebar') === w) return;
      el.setAttribute('data-lebar', w);
      el.innerHTML = svgGrafik(data, w, el.clientHeight || 200, kode);
    }
    gambarUlang();
    if ('ResizeObserver' in window) { pengamatGrafik = new ResizeObserver(gambarUlang); pengamatGrafik.observe(el); }
  }

  function panelTerbaru() {
    var lima = ORDER.slice(0, 5);
    return panelBuka('panel--terbaru', 'h-terbaru') + '<div class="panel-kepala"><h2 id="h-terbaru">Order terbaru</h2>' +
      (lima.length ? '<a class="tautan" href="#order">Semua order</a>' : '') + '</div>' +
      (lima.length ? '<div class="tabel-wadah"><table class="tabel tabel--order tabel--ringkas">' + kepalaTabelOrder('ringkas') +
        '<tbody>' + lima.map(function (o) { return barisOrder(o, 'ringkas'); }).join('') + '</tbody></table></div>'
        : '<p class="kosong">Belum ada order. Begitu ada yang checkout, order-nya muncul di sini.</p>') + '</section>';
  }
  function blokSumber(judul, daftar, total, labelFn) {
    return '<div class="sumber-blok"><h3 class="k-label">' + esc(judul) + '</h3>' + daftar.map(function (x) {
      var lab = labelFn(x.kunci);
      return '<div class="sumber-baris"><span class="sumber-nama' + (lab.redup ? ' redup' : '') + '">' + esc(lab.teks) + '</span>' +
        '<span class="sumber-jumlah angka">' + x.n + ' lunas · ' + persen(x.n, total) + '</span>' +
        '<span class="sumber-jalur" aria-hidden="true"><span style="width:' + Math.round(x.n / total * 100) + '%"></span></span></div>';
    }).join('') + '</div>';
  }
  function panelSumber(h) {
    var s = panelBuka('panel--sumber', 'h-sumber') + '<div class="panel-kepala"><h2 id="h-sumber">Sumber pembeli lunas</h2><span class="ket">' + esc(PERIODE[S.periode].sub) + '</span></div>';
    var total = h.lunas.length;
    if (!total) return s + '<p class="kosong">Belum ada pembeli lunas di periode ini.</p></section>';
    s += blokSumber('Kode affiliate', kelompok(h.lunas, function (o) { return o.ref || ''; }), total, function (k) { return k ? { teks: k } : { teks: 'Tanpa kode', redup: true }; });
    s += blokSumber('Asal klik (utm_source)', kelompok(h.lunas, function (o) { return o.utm_source || ''; }), total, function (k) { return k ? { teks: namaSumber(k) } : { teks: 'Langsung', redup: true }; });
    return s + '</section>';
  }

  /* ---------------- 9. Layar Order ---------------- */
  function gambarOrder() {
    urutPanel = 0;
    if (!ORDER.length) {
      elIsi.innerHTML = panelBuka('panel--tabel', 'h-order') + '<h2 id="h-order" class="sr-only">Daftar order</h2>' +
        '<div class="kosong kosong--tabel"><p><b>Belum ada order.</b></p><p>Begitu ada yang checkout, order-nya muncul di sini.</p></div></section>' + kakiHp();
      return;
    }
    var chip = CHIP_ORDER.map(function (c) {
      var n = ORDER.filter(function (o) { return dalamGrup(o, c[0]); }).length;
      return '<button type="button" class="chip" data-filter-order="' + c[0] + '" aria-pressed="' + (S.filterOrder === c[0]) + '">' + esc(c[1]) + ' <span class="angka">' + n + '</span></button>';
    }).join('');
    elIsi.innerHTML = panelBuka('panel--tabel', 'h-order') + '<h2 id="h-order" class="sr-only">Daftar order</h2>' +
      '<div class="alat"><div class="chip-baris" role="group" aria-label="Saring status">' + chip + '</div>' +
      '<div class="cari"><i class="ti ti-search" aria-hidden="true"></i><label class="sr-only" for="cari-order">Cari order</label>' +
      '<input id="cari-order" type="search" placeholder="Cari nama, email, kode, atau ref" autocomplete="off" spellcheck="false" value="' + esc(S.cari) + '"></div></div>' +
      '<div id="tabel-order"></div></section>' + kakiHp();
    gambarTabelOrder();
  }
  function saringOrder() {
    var q = S.cari.trim().toLowerCase();
    return ORDER.filter(function (o) {
      if (!dalamGrup(o, S.filterOrder)) return false;
      if (!q) return true;
      return [o.nama, o.email, o.order_id, o.ref].some(function (v) { return v && String(v).toLowerCase().indexOf(q) > -1; });
    });
  }
  function gambarTabelOrder() {
    var el = document.getElementById('tabel-order');
    if (!el) return 0;
    var arr = saringOrder();
    if (!arr.length) {
      el.innerHTML = '<div class="kosong kosong--tabel"><p><b>Gak ada order yang cocok.</b></p><p>Coba kata lain, atau pilih Semua.</p></div>';
      return 0;
    }
    el.innerHTML = '<div class="tabel-wadah"><table class="tabel tabel--order">' + kepalaTabelOrder('lengkap') + '<tbody>' +
      arr.map(function (o) { return barisOrder(o, 'lengkap'); }).join('') + '</tbody></table></div>' +
      '<p class="tabel-kaki">' + (arr.length === ORDER.length ? arr.length + ' order' : arr.length + ' dari ' + ORDER.length + ' order') + ', terbaru di atas</p>';
    return arr.length;
  }

  /* ---------------- 10. Detail order (laci / layar penuh) ---------------- */
  function baris(dt, dd, redup, salinTeks, salinLabel) {
    return '<div class="baris-data"><dt>' + esc(dt) + '</dt><dd' + (redup ? ' class="redup"' : '') + '>' + esc(dd) + '</dd>' +
      (salinTeks ? tombolSalin(salinTeks, salinLabel) : '<span></span>') + '</div>';
  }
  function tombolSalin(teks, label) {
    return '<button type="button" class="salin" data-salin="' + esc(teks) + '" aria-label="' + esc(label || ('Salin ' + teks)) + '">' +
      '<i class="ti ti-copy" aria-hidden="true"></i><span>Salin</span></button>';
  }
  // Garis waktu: Dibuat, Dibayar, Akun dibuat, Sudah login (login_terakhir dari sistem akun)
  function langkahJejak(o) {
    var lunas = o.status === 'paid';
    var gagalBayar = GRUP.masalah.indexOf(o.status) > -1;
    var mati = GRUP.batal.indexOf(o.status) > -1;
    var l = [{ nama: 'Dibuat', nilai: tglJam(waktu(o.dibuat)), kelas: 'sudah' }];
    if (o.dibayar) {
      l.push({ nama: 'Dibayar', nilai: tglJam(waktu(o.dibayar)), kelas: 'sudah', ket: o.status === 'refunded' ? 'Lalu direfund' : (labelBayar(o.cara_bayar) || '') });
    } else {
      l.push({ nama: 'Dibayar', nilai: (mati || gagalBayar) ? labelStatus(o.status) : 'Belum', kelas: gagalBayar ? 'gagal' : 'belum' });
    }
    l.push({ nama: 'Akun dibuat', nilai: o.akun_dibuat ? 'Sudah' : 'Belum', kelas: o.akun_dibuat ? 'sudah' : (lunas ? 'gagal' : 'belum'),
      ket: !o.akun_dibuat && lunas ? 'Pembeli belum bisa masuk app' : '' });
    l.push({ nama: 'Sudah login', nilai: o.login_terakhir ? tglJam(waktu(o.login_terakhir)) : 'Belum pernah login', kelas: o.login_terakhir ? 'sudah' : 'belum',
      ket: o.login_terakhir ? 'Login terakhir ' + relatif(waktu(o.login_terakhir)) : '' });
    return l;
  }
  function petunjukOrder(o) {
    if (o.status === 'pending_manual') {
      var perintah = 'lunas ' + o.order_id;
      return '<div class="petunjuk"><p class="petunjuk-judul">Cek mutasi BCA, lalu balas bot CS:</p>' +
        '<div class="petunjuk-baris"><code>' + esc(perintah) + '</code>' + tombolSalin(perintah, 'Salin perintah ' + perintah) + '</div>' +
        '<p class="petunjuk-ket">Tombol ini cuma nyalin teks. Pelunasan tetap lewat bot CS di HP.</p></div>';
    }
    if (o.status === 'paid' && !o.akun_dibuat) {
      return '<div class="petunjuk"><p class="petunjuk-judul"><span class="status status--bahaya">Sudah bayar, akun belum ada</span></p>' +
        '<p class="petunjuk-ket">Pembeli belum bisa masuk app. Buat akunnya manual lewat runbook pembeli.</p></div>';
    }
    if (o.status === 'selisih_nominal') {
      return '<div class="petunjuk"><p class="petunjuk-judul">' + tagStatus(o.status) + '</p>' +
        '<p class="petunjuk-ket">Jumlah yang dibayar gak sama dengan tagihan. Cek di Midtrans sebelum kasih akses.</p></div>';
    }
    return '';
  }
  function htmlLaci(o) {
    var contoh = !D || D.sumber !== 'live';
    var kepala = '<div class="laci-kepala">' +
      '<button type="button" class="tombol-garis tombol-tutup" data-tutup><span class="teks-desktop">Tutup</span><span class="teks-hp">Kembali</span></button>' +
      '<span class="laci-label">Detail order</span>' + (contoh ? '<span class="lencana-contoh">Data contoh</span>' : '') + '</div>';
    if (!o) {
      return '<div class="tirai" data-tutup></div><div class="laci" role="dialog" aria-modal="true" aria-label="Order gak ketemu" tabindex="-1">' + kepala +
        '<div class="laci-isi"><div class="kosong kosong--tabel"><p><b>Order gak ketemu.</b></p><p>Kodenya mungkin salah ketik. Balik ke daftar order.</p></div></div></div>';
    }
    var bayar = labelBayar(o.cara_bayar);
    var s = '<div class="tirai" data-tutup></div><div class="laci" role="dialog" aria-modal="true" aria-labelledby="laci-judul" tabindex="-1">' + kepala + '<div class="laci-isi">';
    s += '<div class="rinci-atas"><p class="rinci-kode angka" id="laci-judul">' + esc(o.order_id) + '</p>' +
      '<div class="rinci-baris">' + tagStatus(o.status) + '<span>' + esc(o.produk_nama || o.produk) + '</span></div>' +
      '<p class="rinci-nominal angka">' + rupiah(o.nominal) + '<small>' + esc(bayar ? 'Cara bayar: ' + bayar : 'Cara bayar belum dipilih') + '</small></p></div>';
    s += petunjukOrder(o);
    s += '<section class="rinci-blok" aria-labelledby="h-pembeli-o"><h3 class="k-label" id="h-pembeli-o">Pembeli</h3><dl>' +
      baris('Nama', o.nama) +
      baris('Email', o.email, false, o.email, 'Salin email ' + o.email) +
      baris('WhatsApp', o.wa || 'Gak ada', !o.wa, o.wa, o.wa ? 'Salin nomor WhatsApp ' + o.wa : '') + '</dl></section>';
    s += '<section class="rinci-blok" aria-labelledby="h-sumber-o"><h3 class="k-label" id="h-sumber-o">Sumber</h3><dl>' +
      baris('Kode ref', o.ref || 'Tanpa kode', !o.ref) +
      baris('utm_source', o.utm_source ? namaSumber(o.utm_source) : 'Langsung', !o.utm_source) +
      baris('Kampanye', o.utm_campaign || 'Gak ada', !o.utm_campaign) + '</dl></section>';
    s += '<section class="rinci-blok" aria-labelledby="h-jejak-o"><h3 class="k-label" id="h-jejak-o">Perjalanan order</h3><ol class="jejak">' +
      langkahJejak(o).map(function (x) {
        return '<li class="' + x.kelas + '"><span class="jejak-titik" aria-hidden="true"></span>' +
          '<span class="jejak-nama">' + esc(x.nama) + (x.ket ? '<span class="jejak-ket">' + esc(x.ket) + '</span>' : '') + '</span>' +
          '<span class="jejak-nilai">' + esc(x.nilai) + '</span></li>';
      }).join('') + '</ol></section>';
    return s + '</div></div>';
  }

  var laciId = null, fokusSebelum = null;
  function bukaLaci(id) {
    var wadah = document.getElementById('laci-wadah');
    if (laciId === id && wadah.firstChild) return;
    if (!laciId) fokusSebelum = document.activeElement;
    laciId = id;
    var o = null;
    ORDER.forEach(function (x) { if (x.order_id === id) o = x; });
    wadah.innerHTML = htmlLaci(o);
    document.getElementById('shell').inert = true;
    document.body.classList.add('laci-buka');
    var laci = wadah.querySelector('.laci');
    if (laci) laci.focus({ preventScroll: true });
  }
  function tutupLaci() {
    if (!laciId) return;
    var id = laciId;
    laciId = null;
    document.getElementById('laci-wadah').innerHTML = '';
    document.getElementById('shell').inert = false;
    document.body.classList.remove('laci-buka');
    var link = elIsi.querySelector('a[data-order-link="' + id.replace(/[^A-Za-z0-9_-]/g, '') + '"]');
    var tuju = link || (fokusSebelum && document.body.contains(fokusSebelum) ? fokusSebelum : null);
    if (tuju && tuju.focus) tuju.focus({ preventScroll: true });
    fokusSebelum = null;
  }

  /* ---------------- 11. Layar Pembeli ---------------- */
  var CHIP_PEMBELI = [['semua', 'Semua'], ['belum', 'Belum login'], ['sendiri', 'Checkout sendiri'], ['lama', 'Lama']];
  function cocokPembeli(p, f) {
    if (f === 'belum') return !p.login_terakhir;
    if (f === 'sendiri') return p.asal === 'checkout-sendiri';
    if (f === 'lama') return p.asal === 'lama';
    return true;
  }
  function gambarPembeli() {
    urutPanel = 0;
    var h = hitungPembeli();
    var html = '<div class="grid-dua"><section class="kpi kpi--tiga" aria-label="Angka akun pembeli">' +
      kartuAngka({ label: 'Total akun', nilai: PEMBELI.length, besar: true,
        ket: PEMBELI.filter(function (p) { return p.asal === 'checkout-sendiri'; }).length + ' dari checkout sendiri, ' +
          PEMBELI.filter(function (p) { return p.asal === 'lama'; }).length + ' pembeli lama' }) +
      kartuAngka({ label: 'Sudah pernah login', nilai: h.sudah.length, ket: persen(h.sudah.length, PEMBELI.length) + ' dari semua akun' }) +
      kartuAngka({ label: 'Belum pernah login', nilai: h.belum.length, ket: h.lamaBelum.length + ' sudah lewat ' + BATAS_LOGIN + ' hari sejak daftar' }) +
      '</section>';
    var total = h.tanpaAkun.length + h.lamaBelum.length;
    html += panelBuka('panel--samping panel--perlu', 'h-perlu-p') + '<div class="panel-kepala"><h2 id="h-perlu-p">Perlu dicek</h2><span class="ket">' + total + ' pembeli</span></div>';
    if (!total) html += '<p class="kosong">Aman. Semua pembeli sudah bisa masuk dan sudah login.</p>';
    if (h.tanpaAkun.length) {
      html += grupCek('bahaya', 'Sudah bayar, akun belum ada', 'Belum bisa masuk app. Buat akunnya manual.', h.tanpaAkun.length,
        h.tanpaAkun.map(function (o) { return itemCek('#order/' + o.order_id, o.nama, o.email, '<b>Lunas</b>' + esc(tgl(waktu(o.dibayar)))); }).join(''));
    }
    if (h.lamaBelum.length) {
      html += grupCek('nunggu', 'Belum pernah login', 'Lewat ' + BATAS_LOGIN + ' hari sejak daftar. Sapa lewat Telegram atau email.', h.lamaBelum.length,
        h.lamaBelum.map(function (x) {
          return itemCek(x.p.order_id ? '#order/' + x.p.order_id : null, x.p.nama, x.p.email, '<b class="angka">' + x.hari + ' hari</b>sejak daftar');
        }).join(''));
    }
    html += '</section>';
    var chip = CHIP_PEMBELI.map(function (c) {
      var n = PEMBELI.filter(function (p) { return cocokPembeli(p, c[0]); }).length;
      return '<button type="button" class="chip" data-filter-pembeli="' + c[0] + '" aria-pressed="' + (S.filterPembeli === c[0]) + '">' + esc(c[1]) + ' <span class="angka">' + n + '</span></button>';
    }).join('');
    html += panelBuka('panel--utama panel--tabel', 'h-pembeli') + '<div class="panel-kepala"><h2 id="h-pembeli">Semua pembeli</h2>' +
      '<span class="ket">Pembeli lama = sebelum checkout sendiri (' + esc(tgl(AWAL_DATA)) + ')</span></div>' +
      (PEMBELI.length ? '<div class="alat"><div class="chip-baris" role="group" aria-label="Saring pembeli">' + chip + '</div></div>' : '') +
      '<div id="tabel-pembeli"></div></section></div>' + kakiHp();
    elIsi.innerHTML = html;
    gambarTabelPembeli();
  }
  function gambarTabelPembeli() {
    var el = document.getElementById('tabel-pembeli');
    if (!el) return 0;
    var arr = PEMBELI.filter(function (p) { return cocokPembeli(p, S.filterPembeli); });
    if (!arr.length) {
      el.innerHTML = '<div class="kosong kosong--tabel"><p><b>' + (PEMBELI.length ? 'Gak ada pembeli di saringan ini.' : 'Belum ada akun pembeli.') + '</b></p></div>';
      return 0;
    }
    el.innerHTML = '<div class="tabel-wadah"><table class="tabel tabel--pembeli"><thead><tr><th scope="col">Pembeli</th><th scope="col">Asal</th>' +
      '<th scope="col">Daftar</th><th scope="col">Login terakhir</th><th scope="col">Tier</th></tr></thead><tbody>' +
      arr.map(function (p) {
        var login = p.login_terakhir
          ? '<span title="' + esc(tglJam(waktu(p.login_terakhir))) + '">' + esc(relatif(waktu(p.login_terakhir))) + '</span>'
          : tagStatus('pending', 'Belum pernah');
        return '<tr><td class="sel-pembeli"><b>' + esc(p.nama) + '</b><small>' + esc(p.email) + '</small></td>' +
          '<td class="sel-asal">' + (p.asal === 'lama' ? 'Lama' : 'Checkout sendiri') + '</td>' +
          '<td class="sel-daftar angka">' + esc(tgl(waktu(p.daftar))) + '</td>' +
          '<td class="sel-login">' + login + '</td>' +
          '<td class="sel-tier">Tier ' + esc(p.tier) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="tabel-kaki">' + arr.length + ' dari ' + PEMBELI.length + ' akun, terbaru daftar di atas</p>';
    return arr.length;
  }

  /* ---------------- 12. Layar Affiliate ---------------- */
  function gambarAffiliate() {
    urutPanel = 0;
    var totalKomisi = 0, totalLunas = 0, totalOrder = 0;
    AFFILIATE.forEach(function (r) { totalKomisi += r.komisi; totalLunas += r.lunas; totalOrder += r.order.length; });
    var html = '<div class="tumpuk"><section class="kpi kpi--tiga" aria-label="Angka affiliate">' +
      kartuAngka({ label: 'Komisi tercatat', nilai: rupiah(totalKomisi), besar: true, ket: totalLunas + ' pembeli lunas × ' + rupiah(KOMISI) }) +
      kartuAngka({ label: 'Lunas lewat affiliate', nilai: totalLunas, ket: 'dari ' + totalOrder + ' order yang bawa kode ref' }) +
      kartuAngka({ label: 'Kode ref aktif', nilai: AFFILIATE.length, ket: 'sejak ' + tgl(AWAL_DATA) }) + '</section>';
    html += panelBuka('panel--tabel', 'h-aff') + '<div class="panel-kepala"><h2 id="h-aff">Komisi per kode ref</h2>' +
      '<span class="ket aturan">Aturan: <b>' + rupiah(KOMISI) + ' per pembeli lunas</b>. Upgrade dan refund gak dihitung.</span></div>' +
      '<div id="tabel-aff"></div></section></div>' + kakiHp();
    elIsi.innerHTML = html;
    gambarTabelAffiliate();
  }
  function gambarTabelAffiliate() {
    var el = document.getElementById('tabel-aff');
    if (!el) return;
    if (!AFFILIATE.length) { el.innerHTML = '<div class="kosong kosong--tabel"><p><b>Belum ada order yang bawa kode ref.</b></p></div>'; return; }
    el.innerHTML = '<div class="tabel-wadah"><table class="tabel tabel--affiliate"><thead><tr><th scope="col">Kode ref</th>' +
      '<th scope="col" class="kanan">Order</th><th scope="col" class="kanan">Lunas</th><th scope="col" class="kanan">Konversi</th>' +
      '<th scope="col" class="kanan">Komisi tercatat</th></tr></thead><tbody>' +
      AFFILIATE.map(function (r) {
        var buka = !!S.refBuka[r.ref], idRinci = 'ref-' + r.ref.replace(/[^A-Za-z0-9_-]/g, '');
        var s = '<tr><td class="sel-refnama"><button type="button" class="buka-ref" data-ref="' + esc(r.ref) + '" aria-expanded="' + buka + '" aria-controls="' + idRinci + '">' +
          '<b>' + esc(r.ref) + '</b><small>' + (buka ? 'Tutup daftar' : 'Lihat ' + r.order.length + ' order') + '</small></button></td>' +
          '<td class="sel-order kanan angka">' + r.order.length + '<span class="m-saja"> order</span></td>' +
          '<td class="sel-lunas kanan angka">' + r.lunas + '<span class="m-saja"> lunas</span></td>' +
          '<td class="sel-konversi kanan angka">' + persen(r.lunas, r.order.length) + '<span class="m-saja"> konversi</span></td>' +
          '<td class="sel-komisi kanan angka">' + rupiah(r.komisi) + '</td></tr>';
        if (buka) {
          s += '<tr class="rinci-ref" id="' + idRinci + '"><td colspan="5"><ul class="ref-order">' + r.order.map(function (o) {
            return '<li><a href="#order/' + esc(o.order_id) + '" data-order-link="' + esc(o.order_id) + '">' +
              '<span class="ro-kode">' + esc(o.order_id) + '</span><span class="ro-waktu angka">' + esc(tglJam(waktu(o.dibuat))) + '</span>' +
              '<span class="ro-nama">' + esc(o.nama) + '</span><span class="ro-status">' + tagStatus(o.status) + '</span>' +
              '<span class="ro-nominal angka">' + rupiah(o.nominal) + '</span></a></li>';
          }).join('') + '</ul></td></tr>';
        }
        return s;
      }).join('') + '</tbody></table></div><p class="tabel-kaki">Catatan komisi yang sudah dibayar menyusul.</p>';
  }

  /* ---------------- 13. Layar keadaan: memuat, gagal, bukan pemilik ---------------- */
  function gambarMemuat() {
    var kartu = function (besar) {
      return '<div class="panel kartu-angka' + (besar ? ' kartu-angka--besar' : '') + '"><span class="kerangka kerangka--label"></span><span class="kerangka kerangka--angka"></span><span class="kerangka kerangka--ket"></span></div>';
    };
    var barisK = '<span class="kerangka kerangka--baris"></span>';
    elIsi.innerHTML = '<p class="sr-only" role="status">Memuat data dasbor…</p><div class="grid-ringkasan" aria-hidden="true">' +
      '<section class="kpi">' + kartu(true) + kartu() + kartu() + kartu() + '</section>' +
      '<div class="kolom-kiri"><section class="panel panel--grafik"><span class="kerangka kerangka--label"></span>' + barisK + barisK + barisK + barisK + '</section></div>' +
      '<div class="kolom-kanan"><section class="panel panel--perlu"><span class="kerangka kerangka--label"></span>' + barisK + barisK + barisK + '</section></div></div>';
  }
  function gambarKeadaan() {
    if (S.fase === 'memuat' || S.fase === 'mulai') { gambarMemuat(); return; }
    if (S.fase === 'bukan-pemilik') {
      elIsi.innerHTML = '<section class="panel panel-keadaan" role="alert"><div class="ikon-keadaan"><i class="ti ti-shield-lock" aria-hidden="true"></i></div>' +
        '<h2>Akun ini bukan pemilik dasbor</h2><p>Kamu masuk sebagai <b>' + esc(S.email) + '</b>. Dasbor cuma kebuka buat akun pemilik.</p>' +
        '<div class="aksi-keadaan"><button type="button" class="btn-ember" data-keluar><span>Keluar</span></button></div></section>';
      return;
    }
    var g = S.galat || { judul: 'Data belum bisa dimuat', teks: 'Ada yang gak beres. Coba lagi sebentar.' };
    elIsi.innerHTML = '<section class="panel panel-keadaan" role="alert"><div class="ikon-keadaan"><i class="ti ti-alert-circle" aria-hidden="true"></i></div>' +
      '<h2>' + esc(g.judul) + '</h2><p>' + esc(g.teks) + '</p>' +
      '<div class="aksi-keadaan"><button type="button" class="btn-ember" data-coba-lagi><i class="ti ti-refresh" aria-hidden="true"></i><span>Coba lagi</span></button>' +
      '<button type="button" class="tombol-garis" data-keluar>Keluar</button></div></section>';
  }

  /* ---------------- 14. Rute, judul, menu ---------------- */
  var JUDUL = { ringkasan: ['Ringkasan', 'Ringkasan'], order: ['Order', 'Order'], pembeli: ['Pembeli dan akses', 'Pembeli'], affiliate: ['Affiliate', 'Affiliate'] };
  function bacaRute() {
    var h = location.hash.replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* hash aneh: pakai apa adanya */ }
    var b = h.split('/');
    var nama = ['masuk', 'ringkasan', 'order', 'pembeli', 'affiliate'].indexOf(b[0]) > -1 ? b[0] : 'ringkasan';
    return { nama: nama, id: nama === 'order' && b[1] ? b[1] : null };
  }
  function subJudul(nama) {
    if (S.fase !== 'siap') return S.fase === 'memuat' || S.fase === 'mulai' ? 'Memuat data…' : '';
    if (nama === 'ringkasan') return 'Per ' + tglJam(SEKARANG) + ' WIB · ' + PERIODE[S.periode].sub;
    if (nama === 'order') return ORDER.length + ' order sejak ' + tgl(AWAL_DATA) + ' · cuma lihat, pelunasan lewat bot CS';
    if (nama === 'pembeli') { var hp = hitungPembeli(); return PEMBELI.length + ' akun pembeli · ' + (hp.tanpaAkun.length + hp.lamaBelum.length) + ' perlu dicek'; }
    return AFFILIATE.length + ' kode ref · komisi ' + rupiah(KOMISI) + ' per pembeli lunas';
  }
  function pasangKepala(nama) {
    var j = JUDUL[nama];
    document.querySelector('#judul .judul-penuh').textContent = j[0];
    document.querySelector('#judul .judul-pendek').textContent = j[1];
    document.getElementById('sub-judul').textContent = subJudul(nama);
    document.getElementById('slot-periode').innerHTML = nama === 'ringkasan' && S.fase === 'siap' ? segmenPeriode() : '';
    document.title = j[0] + ' · Dasbor Adverthinking AI';
    document.querySelectorAll('[data-menu]').forEach(function (a) {
      if (a.getAttribute('data-menu') === nama) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function pasangHitungMenu() {
    var elO = document.getElementById('hitung-order'), elP = document.getElementById('hitung-pembeli');
    elO.hidden = true; elP.hidden = true;
    if (S.fase !== 'siap') return;
    var c = perluDicekOrder(), h = hitungPembeli();
    if (c.transfer.length) { elO.textContent = c.transfer.length; elO.setAttribute('aria-label', c.transfer.length + ' nunggu transfer'); elO.title = c.transfer.length + ' nunggu transfer'; elO.hidden = false; }
    var nP = h.tanpaAkun.length + h.lamaBelum.length;
    if (nP) { elP.textContent = nP; elP.setAttribute('aria-label', nP + ' perlu dicek'); elP.title = nP + ' perlu dicek'; elP.hidden = false; }
  }
  function pasangAkun() {
    document.getElementById('akun-email').textContent = S.email || 'pemilik';
  }

  function gambar() {
    var r = bacaRute();
    var elMasuk = document.getElementById('layar-masuk');
    var tampilMasuk = S.fase === 'masuk' || (MODE_CONTOH && r.nama === 'masuk');
    document.body.setAttribute('data-fase', S.fase);
    document.body.setAttribute('data-rute', tampilMasuk ? 'masuk' : r.nama);
    if (tampilMasuk) {
      tutupLaci();
      elMasuk.hidden = false;
      document.title = 'Masuk · Dasbor Adverthinking AI';
      halamanAktif = 'masuk';
      return;
    }
    elMasuk.hidden = true;
    if (r.nama === 'masuk') {                  // live & sudah masuk: #masuk gak ada artinya
      history.replaceState(null, '', location.pathname + location.search + '#ringkasan');
      r = bacaRute();
    }
    if (S.fase !== 'siap') {
      tutupLaci();
      pasangKepala(r.nama);
      gambarKeadaan();
      halamanAktif = null;
      return;
    }
    if (halamanAktif !== r.nama) {
      pasangKepala(r.nama);
      if (r.nama === 'ringkasan') gambarRingkasan();
      else if (r.nama === 'order') gambarOrder();
      else if (r.nama === 'pembeli') gambarPembeli();
      else gambarAffiliate();
      elIsi.classList.remove('anim');
      void elIsi.offsetWidth;                  // mulai ulang animasi masuk
      elIsi.classList.add('anim');
      clearTimeout(gambar._t);                 // lepas lagi: ganti periode/saringan gak ikut animasi
      gambar._t = setTimeout(function () { elIsi.classList.remove('anim'); }, 900);
      if (halamanAktif !== null && halamanAktif !== 'masuk') window.scrollTo(0, 0);
      halamanAktif = r.nama;
    }
    if (r.nama === 'order' && r.id) bukaLaci(r.id); else tutupLaci();
  }

  /* ---------------- 15. Layar Masuk: form & pesan ---------------- */
  var elPesan = document.getElementById('pesan-masuk');
  var FORM = { masuk: document.getElementById('form-masuk'), lupa: document.getElementById('form-lupa'), baru: document.getElementById('form-baru') };
  var SUB_MASUK = {
    masuk: 'Khusus pemilik. Data pembeli baru kebuka setelah masuk.',
    lupa: 'Lupa atau belum punya password? Minta link lewat email.',
    baru: 'Satu langkah lagi: bikin password buat akun ini.'
  };
  var IKON_PESAN = { galat: 'alert-circle', info: 'info-circle', sukses: 'check' };
  function tampilPesan(p) {
    if (!p) { elPesan.hidden = true; elPesan.innerHTML = ''; return; }
    elPesan.className = 'pesan pesan--' + p.jenis;
    elPesan.innerHTML = '<i class="ti ti-' + IKON_PESAN[p.jenis] + '" aria-hidden="true"></i><span>' + esc(p.teks) + '</span>';
    elPesan.hidden = false;
  }
  function modeMasuk(m, pesan) {
    Object.keys(FORM).forEach(function (k) { FORM[k].hidden = k !== m; });
    document.getElementById('sub-masuk').textContent = SUB_MASUK[m] || SUB_MASUK.masuk;
    tampilPesan(pesan || null);
  }
  function sibuk(form, ya, teks) {
    var b = form.querySelector('.tombol-utama');
    b.disabled = ya;
    b.querySelector('span').textContent = teks;
  }
  function keMasuk(pesan, mode) {
    S.fase = 'masuk';
    modeMasuk(mode || 'masuk', pesan);
    gambar();
  }
  function manusiawi(err) {
    var m = String((err && err.message) || err || '').toLowerCase();
    if (m.indexOf('invalid login credentials') > -1) return 'Email atau password belum cocok. Coba teliti lagi.';
    if (m.indexOf('email not confirmed') > -1) return 'Email ini belum aktif di sistem akun.';
    if (m.indexOf('invalid api key') > -1 || m.indexOf('no api key') > -1) return 'Kunci Supabase di config.js salah atau belum diisi.';
    if (m.indexOf('should be different') > -1) return 'Password baru harus beda dari password lama.';
    if (m.indexOf('at least') > -1 && m.indexOf('password') > -1) return 'Password-nya terlalu pendek.';
    if (m.indexOf('rate limit') > -1 || m.indexOf('security purposes') > -1 || m.indexOf('too many') > -1) return 'Terlalu sering dicoba. Tunggu sekitar 1 menit, lalu coba lagi.';
    if (m.indexOf('fetch') > -1 || m.indexOf('network') > -1 || m.indexOf('failed') > -1) return 'Gak bisa nyambung ke server. Cek internet, lalu coba lagi.';
    return 'Gagal: ' + ((err && err.message) || 'alasan gak diketahui') + '.';
  }

  /* ---------------- 16. Muat data: contoh ATAU live (Supabase) ---------------- */
  var sb = null, pustakaGagal = false, nomorMuat = 0;
  function muatSkrip(src) {
    return new Promise(function (ok, gagal) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { gagal(new Error('skrip gagal dimuat: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function kunciSiap() { return !!(CFG.supabaseUrl && CFG.anonKey && CFG.anonKey.indexOf('__') !== 0); }
  function kunciPenyimpanan() {
    try { return 'sb-' + new URL(CFG.supabaseUrl).hostname.split('.')[0] + '-auth-token'; } catch (e) { return ''; }
  }
  function adaTokenTersimpan() {
    try { return !!localStorage.getItem(kunciPenyimpanan()); } catch (e) { return false; }
  }
  // Balik dari link "bikin password": supabase-js 2.49 (PKCE) memancarkan SIGNED_IN, bukan PASSWORD_RECOVERY.
  // Jadi penandanya dibaca SEBELUM client dibuat: code-verifier bertanda /PASSWORD_RECOVERY, atau flag sendiri (maks 2 jam).
  function balikDariLinkPassword() {
    if (!PARAM.get('code')) return false;
    try {
      var v = localStorage.getItem(kunciPenyimpanan() + '-code-verifier') || '';
      var f = +localStorage.getItem(KUNCI_FLAG_GANTI) || 0;
      return v.indexOf('/PASSWORD_RECOVERY') > -1 || (f > 0 && Date.now() - f < 2 * 36e5);
    } catch (e) { return false; }
  }
  function bersihkanCode() {
    if (!PARAM.get('code')) return;
    try {
      var u = new URL(location.href);
      u.searchParams.delete('code');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* biarin */ }
  }
  function kosongkanData() {                   // sesudah keluar: data pembeli dibuang dari memori & layar
    D = null; ORDER = []; PEMBELI = []; AFFILIATE = [];
    elIsi.innerHTML = '';
    halamanAktif = null;
    pasangHitungMenu();
  }
  function gagalMuat(teks) {
    S.fase = 'gagal';
    S.galat = { judul: 'Data belum bisa dimuat', teks: teks };
    gambar();
  }
  function siap(data) {
    pasangData(data);
    S.fase = 'siap';
    pasangAkun();
    pasangHitungMenu();
    gambar();
  }

  function mulaiContoh() {
    S.email = 'Bolo';
    pasangAkun();
    muatSkrip('contoh.js').then(function () {
      var d = window.DASBOR_CONTOH;
      if (!d || !Array.isArray(d.order) || !Array.isArray(d.pembeli)) throw new Error('bentuk');
      siap(d);
    }).catch(function () { gagalMuat('File contoh.js gak kebaca. Pastikan file-nya ada di sebelah index.html.'); });
  }

  function mulaiLive() {
    var mintaPassword = balikDariLinkPassword();
    muatSkrip(URL_SUPABASE_JS).then(function () {
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.anonKey, {
        auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
      });
      sb.auth.onAuthStateChange(function (event) {
        if (event === 'PASSWORD_RECOVERY') { mintaPassword = true; keMasuk(null, 'baru'); }
        else if (event === 'SIGNED_OUT' && !S.keluarSengaja && S.fase !== 'masuk') { kosongkanData(); keMasuk({ jenis: 'info', teks: 'Sesi habis, masuk lagi.' }); }
      });
      return sb.auth.initialize().then(function (hasil) {
        var adaCode = !!PARAM.get('code');
        if (hasil && hasil.error && adaCode) {
          bersihkanCode();
          keMasuk({ jenis: 'galat', teks: 'Link dari email gagal dipakai. Buka link-nya di browser yang sama waktu kamu minta, atau minta link baru di sini.' }, 'lupa');
          return null;
        }
        return sb.auth.getSession().then(function (r) {
          var sesi = r && r.data && r.data.session;
          bersihkanCode();
          if (sesi) S.email = (sesi.user && sesi.user.email) || '';
          pasangAkun();
          if (sesi && mintaPassword) { keMasuk(null, 'baru'); return; }
          if (sesi) { ambilData(); return; }
          if (adaCode) { keMasuk({ jenis: 'galat', teks: 'Link dari email sudah gak berlaku. Minta link baru di sini.' }, 'lupa'); return; }
          if (S.fase !== 'masuk') keMasuk(null);
        });
      });
    }).catch(function () {
      pustakaGagal = true;
      keMasuk({ jenis: 'galat', teks: 'Sistem login gagal dimuat. Cek internet, lalu muat ulang halaman ini.' });
    });
  }

  function ambilData() {
    var nomor = ++nomorMuat;
    S.fase = 'memuat';
    pasangHitungMenu();
    gambar();
    sb.auth.getSession().then(function (r) {
      var sesi = r && r.data && r.data.session;
      if (!sesi) { keMasuk({ jenis: 'info', teks: 'Sesi habis, masuk lagi.' }); return null; }
      S.email = (sesi.user && sesi.user.email) || S.email;
      pasangAkun();
      var kendali = 'AbortController' in window ? new AbortController() : null;
      var batas = setTimeout(function () { if (kendali) kendali.abort(); }, 20000);
      return fetch(CFG.supabaseUrl + CFG.fungsi, {
        headers: { Authorization: 'Bearer ' + sesi.access_token },
        cache: 'no-store',
        signal: kendali ? kendali.signal : undefined
      }).then(function (res) {
        clearTimeout(batas);
        if (nomor !== nomorMuat) return null;
        if (res.status === 401) {
          S.keluarSengaja = true;
          return sb.auth.signOut().catch(function () { return null; }).then(function () {
            S.keluarSengaja = false;
            kosongkanData();
            keMasuk({ jenis: 'info', teks: 'Sesi habis, masuk lagi.' });
          });
        }
        if (res.status === 403) { S.fase = 'bukan-pemilik'; gambar(); return null; }
        if (!res.ok) { gagalMuat('Server lagi error (kode ' + res.status + '). Tunggu sebentar, lalu Coba lagi.'); return null; }
        return res.json().then(function (data) {
          if (!data || !Array.isArray(data.order) || !Array.isArray(data.pembeli)) {
            gagalMuat('Data dari server bentuknya gak sesuai. Coba lagi; kalau tetap begini, kabari Claude.');
            return;
          }
          siap(data);
        });
      });
    }).catch(function () {
      if (nomor !== nomorMuat) return;
      gagalMuat(navigator.onLine === false ? 'Kamu lagi offline. Nyalakan internet, lalu Coba lagi.' : 'Gak bisa nyambung ke server. Cek internet, lalu Coba lagi.');
    });
  }

  function keluar() {
    if (MODE_CONTOH) { location.hash = '#masuk'; return; }
    S.keluarSengaja = true;
    function selesai() {
      S.keluarSengaja = false;
      kosongkanData();
      S.email = '';
      pasangAkun();
      keMasuk({ jenis: 'sukses', teks: 'Kamu sudah keluar.' });
    }
    if (sb) sb.auth.signOut().then(selesai, selesai); else selesai();
  }
  function keRingkasanKalauMasuk() {
    if (bacaRute().nama === 'masuk') history.replaceState(null, '', location.pathname + location.search + '#ringkasan');
  }
  function belumBisaLogin(form) {
    if (!kunciSiap()) { tampilPesan({ jenis: 'galat', teks: 'Dasbor belum dipasang: kunci Supabase (anonKey) di config.js belum diisi.' }); return true; }
    if (pustakaGagal) { location.reload(); return true; }
    if (!sb) { tampilPesan({ jenis: 'info', teks: 'Sistem login lagi disiapkan. Tunggu sebentar, lalu coba lagi.' }); return true; }
    return false;
  }

  FORM.masuk.addEventListener('submit', function (e) {
    e.preventDefault();
    if (MODE_CONTOH) { location.hash = '#ringkasan'; return; }   // mode contoh: tanpa login beneran
    var email = document.getElementById('email-masuk').value.trim().toLowerCase();
    var sandi = document.getElementById('sandi-masuk').value;
    if (!email || !sandi) { tampilPesan({ jenis: 'galat', teks: 'Email dan password diisi dulu ya.' }); return; }
    if (belumBisaLogin(FORM.masuk)) return;
    sibuk(FORM.masuk, true, 'Sebentar…');
    sb.auth.signInWithPassword({ email: email, password: sandi }).then(function (r) {
      sibuk(FORM.masuk, false, 'Masuk');
      if (r.error) { tampilPesan({ jenis: 'galat', teks: manusiawi(r.error) }); return; }
      document.getElementById('sandi-masuk').value = '';
      S.email = (r.data && r.data.user && r.data.user.email) || email;
      pasangAkun();
      tampilPesan(null);
      keRingkasanKalauMasuk();
      ambilData();
    }, function (err) { sibuk(FORM.masuk, false, 'Masuk'); tampilPesan({ jenis: 'galat', teks: manusiawi(err) }); });
  });

  FORM.lupa.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('email-lupa').value.trim().toLowerCase();
    if (email.indexOf('@') < 1) { tampilPesan({ jenis: 'galat', teks: 'Isi email pemilik dulu ya.' }); return; }
    if (MODE_CONTOH) { tampilPesan({ jenis: 'sukses', teks: 'Mode contoh: email gak dikirim. Di versi asli, link bikin password dikirim ke ' + email + '.' }); return; }
    if (belumBisaLogin(FORM.lupa)) return;
    sibuk(FORM.lupa, true, 'Mengirim…');
    try { localStorage.setItem(KUNCI_FLAG_GANTI, String(Date.now())); } catch (er) { /* gak masalah, penanda utama = code-verifier */ }
    sb.auth.resetPasswordForEmail(email, { redirectTo: CFG.urlBalik }).then(function (r) {
      sibuk(FORM.lupa, false, 'Kirim link');
      if (r.error) { tampilPesan({ jenis: 'galat', teks: manusiawi(r.error) }); return; }
      tampilPesan({ jenis: 'sukses', teks: 'Cek email ' + email + '. Buka link-nya di browser ini juga, lalu bikin password baru.' });
    }, function (err) { sibuk(FORM.lupa, false, 'Kirim link'); tampilPesan({ jenis: 'galat', teks: manusiawi(err) }); });
  });

  FORM.baru.addEventListener('submit', function (e) {
    e.preventDefault();
    var p1 = document.getElementById('sandi-baru').value, p2 = document.getElementById('sandi-ulang').value;
    if (p1.length < 8) { tampilPesan({ jenis: 'galat', teks: 'Password minimal 8 karakter ya.' }); return; }
    if (p1 !== p2) { tampilPesan({ jenis: 'galat', teks: 'Dua password-nya belum sama.' }); return; }
    if (MODE_CONTOH) { location.hash = '#ringkasan'; return; }
    if (belumBisaLogin(FORM.baru)) return;
    sibuk(FORM.baru, true, 'Menyimpan…');
    sb.auth.updateUser({ password: p1 }).then(function (r) {
      sibuk(FORM.baru, false, 'Simpan password');
      if (r.error) { tampilPesan({ jenis: 'galat', teks: manusiawi(r.error) }); return; }
      try { localStorage.removeItem(KUNCI_FLAG_GANTI); } catch (er) { /* biarin */ }
      document.getElementById('sandi-baru').value = '';
      document.getElementById('sandi-ulang').value = '';
      tampilPesan(null);
      keRingkasanKalauMasuk();
      ambilData();
    }, function (err) { sibuk(FORM.baru, false, 'Simpan password'); tampilPesan({ jenis: 'galat', teks: manusiawi(err) }); });
  });

  /* ---------------- 17. Tema ---------------- */
  function pasangTema(t, simpan) {
    document.documentElement.setAttribute('data-tema', t);
    document.querySelectorAll('[data-tema-tombol]').forEach(function (b) {
      var ke = t === 'gelap' ? 'terang' : 'gelap';
      b.innerHTML = '<i class="ti ti-' + (t === 'gelap' ? 'sun' : 'moon') + '" aria-hidden="true"></i><span class="teks-desktop">' + besarAwal(ke) + '</span>';
      b.setAttribute('aria-label', 'Ganti ke mode ' + ke);
      b.title = 'Ganti ke mode ' + ke;
    });
    if (!simpan) return;
    try { localStorage.setItem('dasbor-tema', t); } catch (e) { /* penyimpanan diblokir: tema tetap ganti di layar ini */ }
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('tema')) { u.searchParams.set('tema', t); history.replaceState(null, '', u.href); }
    } catch (e) { /* file:// bisa nolak replaceState: abaikan */ }
  }

  /* ---------------- 18. Salin teks (cuma nyalin, bukan aksi ke sistem) ---------------- */
  var elUmum = document.getElementById('pengumum');
  function umumkan(t) { elUmum.textContent = ''; setTimeout(function () { elUmum.textContent = t; }, 30); }
  function salinCadangan(teks) {
    var ta = document.createElement('textarea');
    ta.value = teks; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function tandai(tombol, ok) {
    var label = tombol.querySelector('span'), ikon = tombol.querySelector('i');
    tombol.classList.toggle('tersalin', ok);
    if (label) label.textContent = ok ? 'Tersalin' : 'Gagal';
    if (ikon) ikon.className = 'ti ' + (ok ? 'ti-check' : 'ti-copy');
    umumkan(ok ? 'Tersalin' : 'Gagal menyalin. Salin manual ya.');
    clearTimeout(tombol._t);
    tombol._t = setTimeout(function () {
      tombol.classList.remove('tersalin');
      if (label) label.textContent = 'Salin';
      if (ikon) ikon.className = 'ti ti-copy';
    }, 1600);
  }
  function salin(teks, tombol) {
    function selesai(ok) { tandai(tombol, ok); tombol.focus({ preventScroll: true }); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(teks).then(function () { selesai(true); }, function () { selesai(salinCadangan(teks)); });
    } else {
      selesai(salinCadangan(teks));
    }
  }

  /* ---------------- 19. Klik, ketik, tombol ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-periode],[data-filter-order],[data-filter-pembeli],[data-ref],[data-salin],[data-tutup],[data-tema-tombol],[data-keluar],[data-coba-lagi],[data-mode-masuk],[data-intip],tr[data-href]');
    if (!t) return;
    if (t.hasAttribute('data-periode')) {
      S.periode = t.getAttribute('data-periode');
      document.getElementById('sub-judul').textContent = subJudul('ringkasan');
      document.getElementById('slot-periode').innerHTML = segmenPeriode();
      gambarRingkasan();
      umumkan('Periode ' + PERIODE[S.periode].label);
    } else if (t.hasAttribute('data-filter-order')) {
      S.filterOrder = t.getAttribute('data-filter-order');
      document.querySelectorAll('[data-filter-order]').forEach(function (b) { b.setAttribute('aria-pressed', b === t); });
      umumkan(gambarTabelOrder() + ' order tampil');
    } else if (t.hasAttribute('data-filter-pembeli')) {
      S.filterPembeli = t.getAttribute('data-filter-pembeli');
      document.querySelectorAll('[data-filter-pembeli]').forEach(function (b) { b.setAttribute('aria-pressed', b === t); });
      umumkan(gambarTabelPembeli() + ' pembeli tampil');
    } else if (t.hasAttribute('data-ref')) {
      var ref = t.getAttribute('data-ref');
      S.refBuka[ref] = !S.refBuka[ref];
      gambarTabelAffiliate();
      var b = elIsi.querySelector('.buka-ref[data-ref="' + ref.replace(/[^A-Za-z0-9_-]/g, '') + '"]');
      if (b) b.focus({ preventScroll: true });
    } else if (t.hasAttribute('data-salin')) {
      salin(t.getAttribute('data-salin'), t);
    } else if (t.hasAttribute('data-tutup')) {
      location.hash = '#order';
    } else if (t.hasAttribute('data-tema-tombol')) {
      pasangTema(document.documentElement.getAttribute('data-tema') === 'gelap' ? 'terang' : 'gelap', true);
    } else if (t.hasAttribute('data-keluar')) {
      keluar();
    } else if (t.hasAttribute('data-coba-lagi')) {
      if (MODE_CONTOH) mulaiContoh(); else ambilData();
    } else if (t.hasAttribute('data-mode-masuk')) {
      var m = t.getAttribute('data-mode-masuk');
      if (m === 'lupa') document.getElementById('email-lupa').value = document.getElementById('email-masuk').value;
      modeMasuk(m);
      var kolom = FORM[m] && FORM[m].querySelector('input');
      if (kolom) kolom.focus();
    } else if (t.hasAttribute('data-intip')) {
      var input = document.getElementById(t.getAttribute('data-intip'));
      var lihat = input.type === 'password';
      input.type = lihat ? 'text' : 'password';
      t.setAttribute('aria-pressed', String(lihat));
      t.setAttribute('aria-label', lihat ? 'Tutup password' : 'Intip password');
      t.querySelector('i').className = 'ti ' + (lihat ? 'ti-eye-off' : 'ti-eye');
    } else if (t.matches('tr[data-href]') && !e.target.closest('a,button')) {
      location.hash = t.getAttribute('data-href');
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'cari-order') return;
    S.cari = e.target.value;
    var n = gambarTabelOrder();
    clearTimeout(umumkan._t);
    umumkan._t = setTimeout(function () { umumkan(n + ' order cocok'); }, 400);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && laciId) { e.preventDefault(); location.hash = '#order'; }
  });
  window.addEventListener('hashchange', gambar);

  /* ---------------- 20. Mulai ---------------- */
  pasangTema(document.documentElement.getAttribute('data-tema') === 'terang' ? 'terang' : 'gelap', false);
  if (MODE_CONTOH) {
    S.fase = 'memuat';
    modeMasuk('masuk');
    gambar();
    mulaiContoh();
  } else {
    if (PARAM.get('code')) { S.fase = 'masuk'; modeMasuk(null, { jenis: 'info', teks: 'Memeriksa link dari email…' }); }
    else if (adaTokenTersimpan()) { S.fase = 'memuat'; }
    else { S.fase = 'masuk'; modeMasuk('masuk'); }
    gambar();
    mulaiLive();
  }
})();
