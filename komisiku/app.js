/* =====================================================================
   Komisiku · app.js · tampilan halaman /komisiku/ (T-283 final)
   Vonis Bolo 27 Sep malam: "campur dua duanya fokus tabnya pisah aja ges"
   -> 2 tab: Sebar (isi Opsi B "Etalase": link, kit, caption)
             Dompet (isi Opsi A "Dompet": saldo, Cairkan, mutasi, pencairan).
   Daftar = hitungan uang A + contoh hasil B. Cairkan & mode tandai = A,
   plus catatan wajib kalau Tolak (B) dan konfirmasi sebelum keputusan dikirim.
   Data cuma lewat window.KomisikuApi (api.js): mode contoh atau asli,
   tampilan tidak tahu bedanya. Keamanan: DOM dibangun lewat createElement
   dan textContent saja, nol HTML mentah dari data.
   ===================================================================== */
(function () {
  'use strict';

  var isi = document.getElementById('isi');
  var merek = document.getElementById('merek');
  var merekSub = document.getElementById('merek-sub');
  var kepalaKanan = document.getElementById('kepala-kanan');
  var tabAtas = document.getElementById('tab-atas');
  var tabBawah = document.getElementById('tab-bawah');
  var kaki = document.getElementById('kaki');
  var toastEl = document.getElementById('toast');
  var pengumum = document.getElementById('pengumum');
  var SVGNS = 'http://www.w3.org/2000/svg';
  /* Satu-satunya angka aturan yang tidak ikut jawaban `program`: kunci ganti rekening
     (hitung.ts PROGRAM.kunci_ganti_rekening_jam, dikonfirmasi ubah-tujuan.terkunci_jam) */
  var KUNCI_JAM = 48;
  var TAMU = { 'daftar': 1, 'masuk': 1, 'cek-email': 1 };
  var gerakPelan = window.matchMedia('(prefers-reduced-motion: reduce)');

  var A = null; /* adaptor data dari api.js */
  var S = {
    urut: 0,
    sudahGambar: false,
    program: null,
    data: null,
    dataJam: 0,
    kit: undefined,
    profil: 'rina',
    tab: 'sebar',
    putusToken: '',
    putusData: null,
    putusGalat: null,
    putusHasil: null,
    cekEmail: null,
    pesanMasuk: null,
    pesanRekening: null,
    cairTerkirim: null,
    gulirAturan: false
  };
  var timerUlang = null;
  var timerToast = null;

  /* ------------------------------------------------------------------
     Alat DOM (textContent saja)
     ------------------------------------------------------------------ */
  /* M-03: angka + satuannya ("14 hari", "27 Okt 2026", "•••• 4821") gak boleh kepisah baris */
  function rapat(s) {
    return String(s)
      .replace(/(\d) (?=[A-Za-z])/g, '$1 ')
      .replace(/\b([A-Z][a-z]{2}) (?=\d{4}\b)/g, '$1 ')
      .replace(/(•) (?=\d)/g, '$1 ');
  }
  function tambah(n, anak) {
    if (anak === null || anak === undefined || anak === false) return;
    if (Array.isArray(anak)) { anak.forEach(function (a) { tambah(n, a); }); return; }
    if (typeof anak === 'string' || typeof anak === 'number') { n.appendChild(document.createTextNode(rapat(anak))); return; }
    n.appendChild(anak);
  }
  function el(tag, opsi, anak) {
    var n = document.createElement(tag);
    if (opsi) {
      Object.keys(opsi).forEach(function (k) {
        var v = opsi[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = rapat(v);
        else if (k === 'on') Object.keys(v).forEach(function (e) { n.addEventListener(e, v[e]); });
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, String(v));
      });
    }
    tambah(n, anak);
    return n;
  }
  function svg(tag, atribut) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(atribut || {}).forEach(function (k) { n.setAttribute(k, atribut[k]); });
    return n;
  }
  function ikon(nama, kelas) {
    var s = svg('svg', { 'class': 'ikon' + (kelas ? ' ' + kelas : ''), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svg('use', { href: '#i-' + nama }));
    return s;
  }
  function umumkan(teks) {
    pengumum.textContent = '';
    setTimeout(function () { pengumum.textContent = teks; }, 40);
  }
  function toast(teks, jenis) {
    toastEl.replaceChildren(ikon(jenis === 'galat' ? 'seru' : 'cek'), el('span', { text: teks }));
    toastEl.className = 'toast tampil' + (jenis === 'galat' ? ' toast--galat' : '');
    clearTimeout(timerToast);
    timerToast = setTimeout(function () { toastEl.className = 'toast'; }, 3600);
  }

  /* ------------------------------------------------------------------
     Format angka & tanggal (WIB, gak ikut zona waktu komputer)
     ------------------------------------------------------------------ */
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  function rupiah(n) {
    var x = Number(n) || 0;
    var s = String(Math.round(Math.abs(x))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (x < 0 ? '-' : '') + 'Rp' + s;
  }
  function rupiahPendek(n) {
    var x = Math.round(Number(n) || 0);
    if (x >= 1e6) return 'Rp' + String(Math.round(x / 1e4) / 100).replace('.', ',') + 'jt';
    if (x >= 1e3) return 'Rp' + String(Math.round(x / 100) / 10).replace('.', ',') + 'rb';
    return 'Rp' + x;
  }
  /* "2026-10-21" dibaca apa adanya (sudah WIB dari server); cap waktu ISO dikonversi ke WIB */
  function wib(s) {
    var t = String(s || '');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (m) return { y: +m[1], m: +m[2], d: +m[3], h: null, mi: null };
    var ms = Date.parse(t);
    if (!isFinite(ms)) return null;
    var d = new Date(ms + 7 * 3600e3);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }
  function dua(x) { return (x < 10 ? '0' : '') + x; }
  function hariKe(t) { return new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay(); }
  function tglPendek(s) { var t = wib(s); return t ? t.d + ' ' + BULAN[t.m - 1] : ''; }
  function tglHari(s) { var t = wib(s); return t ? HARI[hariKe(t)] + ', ' + t.d + ' ' + BULAN[t.m - 1] : ''; }
  function tglLengkap(s) { var t = wib(s); return t ? t.d + ' ' + BULAN[t.m - 1] + ' ' + t.y : ''; }
  function tglHariLengkap(s) { var t = wib(s); return t ? HARI[hariKe(t)] + ', ' + t.d + ' ' + BULAN[t.m - 1] + ' ' + t.y : ''; }
  function bulanTahun(s) { var t = wib(s); return t ? BULAN_PANJANG[t.m - 1] + ' ' + t.y : ''; }
  function jam(s) { var t = wib(s); return t && t.h !== null ? dua(t.h) + '.' + dua(t.mi) : ''; }
  function selang(a, b) {
    var ms = Date.parse(b) - Date.parse(a);
    if (!isFinite(ms) || ms < 0) return '';
    var menit = Math.round(ms / 60000);
    if (menit < 1) return '';
    if (menit < 60) return menit + ' menit';
    var j = Math.round(menit / 60);
    return j < 48 ? j + ' jam' : Math.round(j / 24) + ' hari';
  }
  function namaDepan(nama) { return String(nama || '').trim().split(/\s+/)[0] || ''; }
  function samarkanEmail(email) {
    var e = String(email || '').trim().toLowerCase();
    var at = e.lastIndexOf('@');
    return at < 1 ? '***' : e.charAt(0) + '***' + e.slice(at);
  }
  function tanpaSkema(url) { return String(url || '').replace(/^https?:\/\//, ''); }
  /* {harga} diisi dari program (server), jadi ganti harga cukup di satu tempat, caption ikut */
  function isiLink(teks, link, harga) { return String(teks || '').split('{harga}').join(harga || '').split('{link}').join(link); }
  function halamanLokal() { return location.hostname === '127.0.0.1' || location.hostname === 'localhost'; }
  /* URL aset/tautan dari data: cuma https (atau http lokal saat uji), nol javascript: */
  function urlAman(u) {
    if (!u) return '';
    try {
      var x = new URL(String(u), location.href);
      if (x.protocol === 'https:' || (x.protocol === 'http:' && halamanLokal())) return x.href;
    } catch (e) { /* rusak: dibuang */ }
    return '';
  }

  /* ------------------------------------------------------------------
     Salin ke clipboard (+ cadangan execCommand)
     ------------------------------------------------------------------ */
  function salinCadangan(teks) {
    return new Promise(function (ok, gagal) {
      var ta = document.createElement('textarea');
      ta.value = teks;
      ta.setAttribute('readonly', '');
      ta.className = 'sr-only';
      document.body.appendChild(ta);
      ta.select();
      var berhasil = false;
      try { berhasil = document.execCommand('copy'); } catch (e) { berhasil = false; }
      ta.remove();
      if (berhasil) ok(); else gagal(new Error('salin'));
    });
  }
  function salinTeks(teks) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(teks).catch(function () { return salinCadangan(teks); });
    }
    return salinCadangan(teks);
  }

  /* ------------------------------------------------------------------
     Komponen kecil
     ------------------------------------------------------------------ */
  function teksTombol(teks) { return el('span', { 'class': 'tombol-teks', text: teks }); }
  function mulaiMuat(b, label) {
    var t = b.querySelector('.tombol-teks');
    b.setAttribute('data-asli', t ? t.textContent : '');
    if (t) t.textContent = label;
    b.insertBefore(el('span', { 'class': 'putar', 'aria-hidden': 'true' }), b.firstChild);
    b.disabled = true;
    b.setAttribute('aria-busy', 'true');
  }
  function selesaiMuat(b) {
    var t = b.querySelector('.tombol-teks');
    if (t) t.textContent = b.getAttribute('data-asli') || t.textContent;
    var s = b.querySelector('.putar');
    if (s) s.remove();
    b.disabled = false;
    b.removeAttribute('aria-busy');
  }
  function pesan(jenis, teks, ikonNama) {
    var nama = ikonNama || (jenis === 'sukses' ? 'cek' : jenis === 'info' ? 'surat' : 'seru');
    return el('div', { 'class': 'pesan pesan--' + jenis, role: jenis === 'galat' ? 'alert' : 'status' }, [ikon(nama), el('span', { text: teks })]);
  }
  function wadahPesan() { return el('div', { 'class': 'wadah-pesan' }); }
  function tampilPesan(wadah, jenis, teks) {
    if (!teks) { wadah.replaceChildren(); return; }
    wadah.replaceChildren(pesan(jenis, teks));
  }
  function chip(kelas, label) { return el('span', { 'class': 'chip chip--' + kelas, text: label }); }
  function angkaBesar(n, kelas) {
    var s = rupiah(n);
    var minus = s.charAt(0) === '-';
    return el('p', { 'class': kelas + ' angka' }, [minus ? '-' : null, el('span', { 'class': 'rp', text: 'Rp' }), s.replace(/^-?Rp/, '')]);
  }
  function tombolMati(ikonNama, label) {
    return el('button', { 'class': 'tombol tombol--utama tombol--kunci', type: 'button', disabled: true }, [ikon(ikonNama), teksTombol(label)]);
  }
  function kepalaBagian(label, judul, ket, id) {
    return el('div', { 'class': 'bagian-kepala' }, [
      label ? el('p', { 'class': 'k-label k-label--bara', text: label }) : null,
      el('h2', { id: id, text: judul }),
      ket ? el('p', { text: ket }) : null
    ]);
  }

  function tombolSalin(label, ambilTeks, pesanOk, kelas, opsi) {
    opsi = opsi || {};
    var teks = teksTombol(label);
    var b = el('button', { 'class': 'tombol tombol-salin ' + (kelas || 'tombol--garis'), type: 'button', 'aria-label': opsi.aria || null }, [
      ikon(opsi.ikon || 'salin', 'ikon-salin'), ikon('cek', 'ikon-cek'), teks
    ]);
    var timer = null;
    b.addEventListener('click', function () {
      salinTeks(ambilTeks()).then(function () {
        b.classList.add('tersalin');
        teks.textContent = 'Tersalin';
        toast(pesanOk);
        clearTimeout(timer);
        timer = setTimeout(function () { b.classList.remove('tersalin'); teks.textContent = label; }, 2000);
      }, function () {
        toast('Gagal nyalin otomatis. Tekan lama teksnya lalu pilih Salin.', 'galat');
      });
    });
    return b;
  }
  function tautanWA(teks, label, kelas) {
    return el('a', { 'class': 'tombol ' + kelas, href: 'https://wa.me/?text=' + encodeURIComponent(teks), target: '_blank', rel: 'noopener' }, [
      ikon('wa'), teksTombol(label), el('span', { 'class': 'sr-only', text: ' (buka WhatsApp)' })
    ]);
  }

  /* Garis cahaya + titik bara (motif hero app /tools & beranda), versi kartu besar (A) */
  var urutCahaya = 0;
  function garisCahaya() {
    var id = 'grad-cahaya-' + (++urutCahaya);
    var s = svg('svg', { viewBox: '0 0 600 200', preserveAspectRatio: 'none', focusable: 'false' });
    var defs = svg('defs');
    var g = svg('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: '0', y1: '0', x2: '600', y2: '0' });
    [['0', '#F97316', '0'], ['.34', '#F97316', '.5'], ['.62', '#FFE3C4', '.95'], ['.86', '#F97316', '.42'], ['1', '#F97316', '0']].forEach(function (st) {
      g.appendChild(svg('stop', { offset: st[0], 'stop-color': st[1], 'stop-opacity': st[2] }));
    });
    defs.appendChild(g);
    s.appendChild(defs);
    var d = 'M-10 150 C 120 150, 220 60, 372 60 S 560 150, 610 120';
    [['7', '.14'], ['1.5', '1']].forEach(function (p) {
      s.appendChild(svg('path', { d: d, fill: 'none', stroke: 'url(#' + id + ')', 'stroke-width': p[0], 'stroke-opacity': p[1], 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
    });
    return el('div', { 'class': 'cahaya', 'aria-hidden': 'true' }, [s, el('span', { 'class': 'cahaya-titik' })]);
  }
  /* Versi pita tipis di atas hero Sebar (B): gak pernah lewat di belakang teks isi */
  function gelombang() {
    var id = 'gel-' + (++urutCahaya);
    var s = svg('svg', { 'class': 'gelombang', viewBox: '0 0 600 64', preserveAspectRatio: 'xMaxYMin meet', 'aria-hidden': 'true', focusable: 'false' });
    var defs = svg('defs');
    var lin = svg('linearGradient', { id: id, x1: '0', y1: '0', x2: '1', y2: '0' });
    [['0', '#FDBA74', '0'], ['.55', '#FDBA74', '.8'], ['1', '#F97316', '0']].forEach(function (st) {
      lin.appendChild(svg('stop', { offset: st[0], 'stop-color': st[1], 'stop-opacity': st[2] }));
    });
    var rad = svg('radialGradient', { id: id + 'r' });
    [['0', '#FFE3C4', '.85'], ['1', '#F97316', '0']].forEach(function (st) {
      rad.appendChild(svg('stop', { offset: st[0], 'stop-color': st[1], 'stop-opacity': st[2] }));
    });
    defs.appendChild(lin);
    defs.appendChild(rad);
    s.appendChild(defs);
    s.appendChild(svg('path', { d: 'M0 58 C 150 58, 260 13, 400 13 S 560 44, 612 38', fill: 'none', stroke: 'url(#' + id + ')', 'stroke-width': '1.6' }));
    s.appendChild(svg('circle', { cx: '400', cy: '13', r: '12', fill: 'url(#' + id + 'r)' }));
    s.appendChild(svg('circle', { cx: '400', cy: '13', r: '2.8', fill: '#FFF4E8' }));
    return s;
  }

  /* Satu isian form: label kelihatan + bantuan + pesan galat */
  function isian(o) {
    var idBantu = o.bantuan ? o.id + '-bantu' : null;
    var idGalat = o.id + '-galat';
    var atribut = {
      id: o.id, name: o.name || o.id,
      autocomplete: o.autocomplete, inputmode: o.inputmode, placeholder: o.placeholder,
      spellcheck: o.spellcheck, autocapitalize: o.autocapitalize, maxlength: o.maxlength,
      'aria-describedby': [idBantu, o.describedby, idGalat].filter(Boolean).join(' ')
    };
    if (!o.tag) atribut.type = o.type || 'text';
    var input = el(o.tag || 'input', atribut);
    if (o.value) input.value = o.value;
    var galat = el('p', { 'class': 'isian-galat', id: idGalat, hidden: true });
    var bungkus = el('div', { 'class': 'isian' }, [
      el('label', { 'for': o.id, text: o.label }),
      input,
      o.sisip || null,
      o.bantuan ? el('p', { 'class': 'isian-bantu', id: idBantu, text: o.bantuan }) : null,
      galat
    ]);
    return {
      bungkus: bungkus,
      input: input,
      galat: function (teks) {
        if (teks) { input.setAttribute('aria-invalid', 'true'); galat.replaceChildren(ikon('seru'), el('span', { text: teks })); galat.hidden = false; }
        else { input.removeAttribute('aria-invalid'); galat.replaceChildren(); galat.hidden = true; }
      }
    };
  }
  function cariInvalid(akar) { return akar.querySelector('[aria-invalid="true"]'); }
  /* Honeypot "situs": tersembunyi dari manusia & pembaca layar, bot biasanya ngisi */
  function isianMadu(id) {
    var input = el('input', { type: 'text', id: id, name: 'situs', tabindex: '-1', autocomplete: 'off' });
    return { bungkus: el('div', { 'class': 'madu', 'aria-hidden': 'true' }, [el('label', { 'for': id, text: 'Situs web (kosongkan)' }), input]), input: input };
  }

  var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  /* Salinan aturan kode handler.ts (server tetap penentu akhir, galatnya ditampilkan apa adanya) */
  var KODE_TERLARANG = ['admin', 'adverthinking', 'adv', 'bolo', 'geri', 'ig', 'fb', 'meta', 'tiktok', 'wa', 'iklan',
    'google', 'test', 'tes', 'promo', 'official', 'resmi', 'cs', 'support', 'komisiku', 'affiliate'];
  var PESAN_KODE = {
    kosong: 'Pilih kode link dulu.',
    huruf: 'Cuma boleh huruf kecil, angka, - dan _ (tanpa spasi).',
    awal: 'Awali kode dengan huruf atau angka.',
    pendek: 'Kode minimal 3 karakter.',
    panjang: 'Kode maksimal 20 karakter.',
    cadangan: 'Kode ini gak bisa dipakai, coba pakai nama kamu atau nama tokomu.'
  };
  function cekKode(k) {
    if (!k) return 'kosong';
    if (/[^a-z0-9_-]/.test(k)) return 'huruf';
    if (!/^[a-z0-9]/.test(k)) return 'awal';
    if (k.length < 3) return 'pendek';
    if (k.length > 20) return 'panjang';
    if (KODE_TERLARANG.indexOf(k) !== -1) return 'cadangan';
    return null;
  }
  function normalWa(v) {
    var d = String(v || '').replace(/[^\d+]/g, '');
    if (d.indexOf('+62') === 0) return '0' + d.slice(3);
    if (d.indexOf('62') === 0) return '0' + d.slice(2);
    return d;
  }
  function pesanGalat(e, cadangan) {
    if (!e || typeof e.status !== 'number') return cadangan;
    return e.status === 0 ? cadangan : e.pesan || cadangan;
  }

  /* ------------------------------------------------------------------
     Rute & data
     ------------------------------------------------------------------ */
  function bacaHash() {
    try { return decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { return ''; }
  }
  /* -> { nama: daftar|masuk|cek-email|akun|cairkan|putus, tab, profil } atau null */
  function tafsir(h) {
    if (TAMU[h]) return { nama: h };
    if (h === 'putus') return { nama: 'putus' };
    if (h === 'cairkan') return { nama: 'cairkan', tab: 'dompet' };
    if (h === 'sebar' || h === 'dompet') return { nama: 'akun', tab: h };
    var m = /^komisiku(-baru)?(?:-(sebar|dompet))?$/.exec(h);
    if (m) return { nama: 'akun', tab: m[2] || null, profil: m[1] ? 'baru' : 'rina' };
    return null;
  }
  function hashAkun(tab) {
    if (A && A.mode === 'contoh') return '#komisiku' + (S.profil === 'baru' ? '-baru' : '') + '-' + tab;
    return '#' + tab;
  }
  function gantiHash(h) {
    try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { /* file:// lama: biarkan */ }
  }
  function pindah(h) {
    if (location.hash === h) gambar(); else location.hash = h;
  }
  /* Asli: data dasbor dibaca ulang kalau sudah > 60 detik (tab HP sering dibiarkan terbuka berhari-hari) */
  var UMUR_DATA_MS = 60000;
  function simpanData(d) { S.data = d; S.dataJam = Date.now(); }
  function dataBasi() { return A.mode === 'asli' && (!S.dataJam || Date.now() - S.dataJam > UMUR_DATA_MS); }
  function tabAdaptif(d) {
    return d && d.ringkasan && d.program && d.ringkasan.siap_cair >= d.program.minimal_cair ? 'dompet' : 'sebar';
  }
  function akunBaru(d) {
    return d.ringkasan.jumlah_pembeli === 0 && (!d.order || !d.order.length) && (!d.payout || !d.payout.length);
  }
  function pastikanProgram() {
    if (S.program) return Promise.resolve(S.program);
    return A.program().then(function (p) { S.program = p; return p; });
  }
  /* Kit gagal dimuat = null (bagian kit tampil galat + Coba lagi), bukan halaman gagal */
  function pastikanKit() {
    if (S.kit !== undefined && S.kit !== null) return Promise.resolve(S.kit);
    return A.kit().then(function (k) { S.kit = Array.isArray(k) ? k : []; return S.kit; }, function () { S.kit = null; return null; });
  }
  function cariCaption(kit, pola) {
    var c = (kit || []).filter(function (k) { return k.jenis === 'caption' && k.teks; });
    for (var i = 0; i < c.length; i++) if (pola.test(c[i].judul || '')) return c[i];
    return null;
  }

  /* ------------------------------------------------------------------
     Kepala, tab, kaki
     ------------------------------------------------------------------ */
  function lencanaContoh() {
    return el('span', { 'class': 'lencana lencana--contoh', title: 'Nama, email, nomor, dan semua angka di layar ini fiktif', text: 'Data contoh' });
  }
  function aturKepala(mode, rute) {
    kepalaKanan.replaceChildren();
    document.body.classList.toggle('ada-lencana', A && A.mode === 'contoh');
    if (mode === 'bolo') {
      merek.removeAttribute('href');
      merekSub.textContent = 'Pencairan affiliate';
      kepalaKanan.appendChild(el('span', { 'class': 'lencana lencana--bolo', text: 'Mode Bolo' }));
      if (A.mode === 'contoh') kepalaKanan.appendChild(lencanaContoh());
      return;
    }
    merekSub.textContent = 'Komisiku';
    if (A && A.mode === 'contoh') kepalaKanan.appendChild(lencanaContoh());
    if (mode === 'tamu') {
      merek.setAttribute('href', '#daftar');
      if (rute === 'daftar') kepalaKanan.appendChild(el('a', { 'class': 'tombol tombol--garis tombol--kecil kepala-tamu', href: '#masuk' }, [ikon('masuk'), teksTombol('Masuk')]));
      else kepalaKanan.appendChild(el('a', { 'class': 'tombol tombol--garis tombol--kecil kepala-tamu', href: '#daftar' }, [teksTombol('Daftar')]));
      return;
    }
    var af = S.data && S.data.affiliate;
    merek.setAttribute('href', hashAkun(S.tab));
    if (!af) return;
    kepalaKanan.appendChild(el('div', { 'class': 'akun' }, [
      el('span', { 'class': 'akun-inisial', 'aria-hidden': 'true', text: (af.nama || '?').charAt(0).toUpperCase() }),
      el('span', { 'class': 'akun-teks' }, [
        el('span', { 'class': 'akun-nama' }, [el('span', { 'class': 'nama-penuh', text: af.nama }), el('span', { 'class': 'nama-depan', text: namaDepan(af.nama) })]),
        el('span', { 'class': 'akun-email', text: af.email_samar })
      ])
    ]));
  }
  function tautanTab(tab, aktif) {
    var d = S.data;
    var lencana = null;
    if (tab === 'dompet' && d && d.ringkasan && d.ringkasan.siap_cair > 0) {
      lencana = el('span', { 'class': 'tab-lencana' }, [el('span', { 'class': 'sr-only', text: ', siap cair ' }), rupiahPendek(d.ringkasan.siap_cair)]);
    }
    return el('a', { 'class': 'tab' + (aktif ? ' tab--aktif' : ''), href: hashAkun(tab), 'aria-current': aktif ? 'page' : null }, [
      ikon(tab), el('span', { 'class': 'tab-label', text: tab === 'sebar' ? 'Sebar' : 'Dompet' }), lencana
    ]);
  }
  function aturTab(aktif) {
    [tabAtas, tabBawah].forEach(function (nav) {
      nav.replaceChildren();
      nav.hidden = !aktif;
      if (aktif) { nav.appendChild(tautanTab('sebar', aktif === 'sebar')); nav.appendChild(tautanTab('dompet', aktif === 'dompet')); }
    });
    document.body.classList.toggle('ada-tab', !!aktif);
  }
  var RUTE_CONTOH = [['#daftar', 'Daftar'], ['#masuk', 'Masuk'], ['#cek-email', 'Cek email'], ['#komisiku', 'Komisiku'],
    ['#komisiku-baru', 'Komisiku baru'], ['#cairkan', 'Cairkan'], ['#putus', 'Mode Bolo']];
  function aturKaki(mode) {
    kaki.replaceChildren();
    if (A.mode === 'contoh') {
      kaki.appendChild(el('p', { 'class': 'kaki-merek', text: 'Mode contoh · nama, email, nomor, dan angka di halaman ini fiktif' }));
      if (mode !== 'bolo') {
        var sekarang = location.hash || '#daftar';
        kaki.appendChild(el('nav', { 'class': 'kaki-nav', 'aria-label': 'Keadaan contoh' }, RUTE_CONTOH.map(function (r) {
          return el('a', { href: r[0], 'aria-current': r[0] === sekarang ? 'page' : null, text: r[1] });
        })));
      }
      return;
    }
    kaki.appendChild(el('p', { 'class': 'kaki-merek', text: 'Adverthinking AI · Program affiliate' }));
  }

  /* Dipanggil tiap layar selesai digambar: judul tab, urutan animasi, fokus */
  function selesai(nama, judul) {
    document.body.setAttribute('data-rute', nama);
    document.title = judul;
    var m = isi.querySelectorAll('.muncul');
    for (var i = 0; i < m.length; i++) m[i].style.setProperty('--i', String(Math.min(i, 6)));
    if (S.sudahGambar) {
      window.scrollTo(0, 0);
      var h1 = isi.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
    S.sudahGambar = true;
    if (S.gulirAturan) {
      S.gulirAturan = false;
      var aturan = document.getElementById('judul-aturan');
      if (aturan) {
        aturan.scrollIntoView({ behavior: gerakPelan.matches ? 'auto' : 'smooth', block: 'start' });
        aturan.focus({ preventScroll: true });
      }
    }
  }

  /* ------------------------------------------------------------------
     Keadaan memuat & galat (R-27)
     ------------------------------------------------------------------ */
  function kerangkaAkun() {
    return el('div', { 'class': 'dompet', 'aria-busy': 'true' }, [
      el('div', { 'class': 'kolom' }, [
        el('div', { 'class': 'saldo at-glass blok-saldo' }, [
          el('span', { 'class': 'kerangka kerangka--label' }), el('span', { 'class': 'kerangka kerangka--angka' }), el('span', { 'class': 'kerangka kerangka--tombol' })
        ]),
        el('div', { 'class': 'panel at-glass-soft blok-riwayat' }, [0, 1, 2, 3].map(function () { return el('span', { 'class': 'kerangka kerangka--baris' }); }))
      ]),
      el('div', { 'class': 'kolom' }, [
        el('div', { 'class': 'panel at-glass-soft blok-rekening' }, [el('span', { 'class': 'kerangka kerangka--label' }), el('span', { 'class': 'kerangka kerangka--baris' })])
      ])
    ]);
  }
  function tampilMemuat(teks, kerangka) {
    isi.replaceChildren(el('p', { 'class': 'sr-only', role: 'status', text: teks }), kerangka || el('div', { 'class': 'memuat-tengah', 'aria-hidden': 'true' }, [el('span', { 'class': 'putar putar--besar' })]));
  }
  function tampilGalat(judul, teks, ulang) {
    var tombol = el('button', { 'class': 'tombol tombol--lembut', type: 'button' }, [teksTombol('Coba lagi')]);
    tombol.addEventListener('click', function () { mulaiMuat(tombol, 'Memuat ulang'); ulang(); });
    isi.replaceChildren(el('section', { 'class': 'panel at-glass-soft keadaan muncul', role: 'alert' }, [
      el('span', { 'class': 'auth-ikon', 'aria-hidden': 'true' }, [ikon('seru')]),
      el('h1', { text: judul }),
      el('p', { text: teks }),
      ulang ? tombol : null
    ]));
  }

  /* ------------------------------------------------------------------
     DAFTAR (kartu hitungan uang A + strip contoh hasil B + form)
     ------------------------------------------------------------------ */
  function fakta(judul, ket) { return el('li', null, [el('b', { text: judul }), ket]); }
  function barisStruk(label, nilai, kelas) {
    return el('div', { 'class': kelas || null }, [el('dt', { text: label }), el('dd', { 'class': 'angka', text: nilai })]);
  }

  function gambarDaftar() {
    var P = S.program;
    var persen = Math.round(P.komisi_per_pembeli / P.harga_produk * 100);
    var pembeliMin = Math.max(1, Math.ceil(P.minimal_cair / P.komisi_per_pembeli));
    var form = formDaftar(P);

    var pitch = el('section', { 'class': 'pitch at-glass muncul', 'aria-labelledby': 'judul-pitch' });
    pitch.appendChild(garisCahaya());
    pitch.appendChild(el('p', { 'class': 'k-label k-label--bara', text: 'Program affiliate Adverthinking' }));
    pitch.appendChild(el('h1', { id: 'judul-pitch' }, ['Dapat ', el('span', { 'class': 'at-text-ember', text: rupiah(P.komisi_per_pembeli) }), ' dari tiap pembeli lewat linkmu']));
    pitch.appendChild(el('p', { 'class': 'pitch-sub', text: 'Daftar gratis, pilih kode link sendiri, lalu bagikan ke WA, IG, atau TikTok. Komisinya tercatat di Komisiku dan bisa kamu cairkan ke bank atau e-wallet.' }));
    var keForm = el('button', { 'class': 'tombol tombol--utama tombol--bara', type: 'button' }, [teksTombol('Daftar gratis')]);
    keForm.addEventListener('click', function () {
      form.kartu.scrollIntoView({ behavior: gerakPelan.matches ? 'auto' : 'smooth', block: 'start' });
      form.pertama.focus({ preventScroll: true });
    });
    pitch.appendChild(el('div', { 'class': 'pitch-aksi' }, [keForm, el('a', { 'class': 'tautan', href: '#masuk', text: 'Sudah daftar? Masuk' })]));
    pitch.appendChild(el('div', { 'class': 'struk-pitch' }, [
      el('p', { 'class': 'struk-judul', text: 'Hitungan per pembeli' }),
      el('dl', { 'class': 'struk-hitung' }, [
        barisStruk('Pembeli bayar', rupiah(P.harga_produk)),
        el('div', { 'class': 'struk-komisi' }, [el('dt', { text: 'Komisi kamu (' + persen + '%)' }), el('dd', { 'class': 'angka at-text-ember', text: rupiah(P.komisi_per_pembeli) })])
      ]),
      el('ul', { 'class': 'struk-fakta' }, [
        fakta('Ditahan ' + P.masa_tahan_hari + ' hari', 'Selama pembeli masih boleh minta uang kembali'),
        fakta('Cair mulai ' + rupiah(P.minimal_cair), 'Cukup dari ' + pembeliMin + ' pembeli'),
        fakta('Ditransfer maks ' + P.transfer_maks, 'Ke bank atau e-wallet pilihanmu'),
        fakta('Masuk pakai link email', 'Tanpa password, daftar gratis')
      ]),
      el('p', { 'class': 'struk-syarat', text: 'Gak dapat komisi: beli lewat link sendiri, dan pembeli yang minta uang kembali dalam ' + P.masa_tahan_hari + ' hari.' })
    ]));
    pitch.appendChild(el('a', { 'class': 'tautan pitch-produk', href: 'https://adverthinking.site/', target: '_blank', rel: 'noopener', text: 'Belum kenal produknya? Lihat Adverthinking' }));

    var kiri = el('div', { 'class': 'daftar-kiri' }, [pitch, bagianEtalase(P)]);
    var kanan = el('div', { 'class': 'daftar-kanan' }, [form.kartu]);
    isi.replaceChildren(el('div', { 'class': 'daftar-grid' }, [kiri, kanan]));
    selesai('daftar', 'Daftar affiliate · Adverthinking AI');
  }

  /* Strip contoh hasil (B): bukti produk yang bakal disebar, dari kit yang sama */
  function bagianEtalase(P) {
    var media = (S.kit || []).filter(function (k) { return (k.jenis === 'video' || k.jenis === 'gambar') && urlAman(k.file); });
    if (!media.length) return null;
    return el('section', { 'class': 'bagian etalase-bagian muncul', 'aria-labelledby': 'judul-etalase' }, [
      kepalaBagian('Yang bakal kamu sebar', 'Contoh hasil tool Adverthinking',
        'Isinya tool AI yang bikinin prompt siap tempel ke ChatGPT atau Gemini buat foto produk, poster, dan video jualan. Harganya ' + rupiah(P.harga_produk) + ' sekali bayar, bukan langganan. Setelah daftar, contoh ini jadi bahan promosimu, lengkap dengan caption berisi linkmu.', 'judul-etalase'),
      el('div', { 'class': 'etalase' }, media.map(function (k) {
        var label = judulPendek(k.judul);
        return el('figure', { 'class': 'etalase-item' }, [
          bingkaiMedia(k, label),
          el('figcaption', { 'class': 'etalase-cap' }, [el('b', { text: label }), k.catatan || ''])
        ]);
      }))
    ]);
  }

  function formDaftar(P) {
    var kartu = el('section', { 'class': 'form-kartu at-glass-soft muncul', 'aria-labelledby': 'judul-form' });
    kartu.appendChild(el('h2', { id: 'judul-form', text: 'Daftar gratis' }));
    kartu.appendChild(el('p', { 'class': 'form-sub', text: 'Link masuk langsung dikirim ke emailmu. Gak perlu bikin password.' }));
    var wadah = wadahPesan();
    kartu.appendChild(wadah);

    var fNama = isian({ id: 'd-nama', label: 'Nama', autocomplete: 'name', placeholder: 'Nama lengkap', maxlength: '60' });
    var fEmail = isian({ id: 'd-email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'nama@email.com', spellcheck: 'false', autocapitalize: 'none', maxlength: '120' });
    var fWa = isian({ id: 'd-wa', label: 'Nomor WA', type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '08xxxxxxxxxx', maxlength: '20' });
    var pratKode = el('b', { 'class': 'prat-kode prat-kode--kosong', text: 'kodemu' });
    var prat = el('p', { 'class': 'pratinjau', id: 'd-kode-prat' }, [
      el('span', { 'class': 'prat-label', text: 'Linkmu nanti' }),
      el('span', { 'class': 'prat-link' }, [el('span', { text: tanpaSkema(P.link_dasar) }), pratKode])
    ]);
    var fKode = isian({
      id: 'd-kode', label: 'Kode link', autocomplete: 'off', placeholder: 'mis. rinajualan', spellcheck: 'false', autocapitalize: 'none', maxlength: '20',
      describedby: 'd-kode-prat', sisip: prat,
      bantuan: '3-20 karakter: huruf kecil, angka, - atau _. Kode gak bisa diganti setelah daftar.'
    });
    var madu = isianMadu('d-situs');

    fKode.input.addEventListener('input', function () {
      var v = fKode.input.value;
      var kecil = v.toLowerCase().replace(/\s+/g, '');
      if (kecil !== v) {
        var pos = Math.max(0, (fKode.input.selectionStart || kecil.length) - (v.length - kecil.length));
        fKode.input.value = kecil;
        try { fKode.input.setSelectionRange(pos, pos); } catch (e) { /* tipe input lain */ }
      }
      var cek = cekKode(kecil);
      pratKode.textContent = kecil || 'kodemu';
      pratKode.classList.toggle('prat-kode--kosong', !kecil);
      var tampil = kecil && cek && cek !== 'pendek';
      fKode.galat(tampil ? PESAN_KODE[cek] : null);
      prat.classList.toggle('pratinjau--galat', !!tampil);
    });
    fKode.input.addEventListener('blur', function () {
      var k = fKode.input.value;
      if (k && cekKode(k)) { fKode.galat(PESAN_KODE[cekKode(k)]); prat.classList.add('pratinjau--galat'); }
    });
    [fNama, fEmail, fWa].forEach(function (f) {
      f.input.addEventListener('input', function () { if (f.input.getAttribute('aria-invalid')) f.galat(null); });
    });

    var centang = el('input', { type: 'checkbox', id: 'd-setuju', name: 'setuju', 'aria-describedby': 'd-setuju-galat' });
    var galatSetuju = el('p', { 'class': 'isian-galat', id: 'd-setuju-galat', hidden: true });
    function setujuGalat(teks) {
      if (teks) { centang.setAttribute('aria-invalid', 'true'); galatSetuju.replaceChildren(ikon('seru'), el('span', { text: teks })); galatSetuju.hidden = false; }
      else { centang.removeAttribute('aria-invalid'); galatSetuju.replaceChildren(); galatSetuju.hidden = true; }
    }
    var daftarAturan = el('ul', { 'class': 'aturan-daftar aturan-daftar--form', id: 'd-aturan', hidden: true }, (P.aturan || []).map(function (a) { return el('li', { text: a }); }));
    var bukaAturan = el('button', { type: 'button', 'class': 'tautan-kecil', 'aria-expanded': 'false', 'aria-controls': 'd-aturan', text: 'Lihat aturan main' });
    bukaAturan.addEventListener('click', function () {
      var buka = daftarAturan.hidden;
      daftarAturan.hidden = !buka;
      bukaAturan.setAttribute('aria-expanded', String(buka));
      bukaAturan.textContent = buka ? 'Tutup aturan main' : 'Lihat aturan main';
    });
    centang.addEventListener('change', function () { if (centang.checked) setujuGalat(null); });
    var setuju = el('div', { 'class': 'setuju' }, [
      el('label', { 'class': 'centang', 'for': 'd-setuju' }, [
        centang,
        el('span', { 'class': 'centang-kotak', 'aria-hidden': 'true' }, [ikon('cek')]),
        el('span', { 'class': 'centang-teks', text: 'Aku sudah baca dan setuju aturan main' })
      ]),
      bukaAturan,
      daftarAturan,
      galatSetuju
    ]);

    var kirim = el('button', { 'class': 'tombol tombol--utama tombol--lebar tombol--bara', type: 'submit' }, [teksTombol('Daftar & kirim link masuk')]);
    var form = el('form', { 'class': 'form-isian', novalidate: true, 'aria-labelledby': 'judul-form' }, [fNama.bungkus, fEmail.bungkus, fWa.bungkus, fKode.bungkus, madu.bungkus, setuju, kirim]);
    kartu.appendChild(form);
    kartu.appendChild(el('p', { 'class': 'alih' }, ['Sudah daftar? ', el('a', { 'class': 'tautan', href: '#masuk', text: 'Masuk' })]));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (kirim.disabled) return;
      tampilPesan(wadah, null, null);
      var nama = fNama.input.value.trim();
      var email = fEmail.input.value.trim();
      var wa = fWa.input.value.trim();
      var kode = fKode.input.value;
      fNama.galat(nama.length >= 2 ? null : 'Isi nama kamu dulu, minimal 2 huruf.');
      fEmail.galat(EMAIL_OK.test(email) ? null : (email ? 'Cek lagi emailnya, contoh: nama@gmail.com' : 'Isi email kamu dulu.'));
      fWa.galat(/^0\d{8,14}$/.test(normalWa(wa)) ? null : 'Tulis nomor WA aktif, contoh 081234567890.');
      var ck = cekKode(kode);
      fKode.galat(ck ? PESAN_KODE[ck] : null);
      prat.classList.toggle('pratinjau--galat', !!(ck && kode));
      setujuGalat(centang.checked ? null : 'Centang dulu kalau kamu setuju aturan main.');
      var salah = cariInvalid(form);
      if (salah) { salah.focus(); umumkan('Ada isian yang perlu dicek.'); return; }
      mulaiMuat(kirim, 'Mengirim link masuk');
      A.daftar({ nama: nama, email: email, wa: wa, kode: kode, setuju: true, situs: madu.input.value }).then(function (j) {
        S.cekEmail = { samar: j.email_samar || samarkanEmail(email), pesan: j.pesan, email: email, asal: 'daftar' };
        pindah('#cek-email');
      }, function (er) {
        selesaiMuat(kirim);
        if (er && er.salah) {
          var peta = { nama: fNama, email: fEmail, wa: fWa, kode: fKode };
          Object.keys(er.salah).forEach(function (k) {
            if (k === 'setuju') setujuGalat(er.salah[k]);
            else if (peta[k]) peta[k].galat(er.salah[k]);
          });
          if (er.salah.kode) prat.classList.add('pratinjau--galat');
          var pertama = cariInvalid(form);
          if (pertama) pertama.focus();
          umumkan('Ada isian yang perlu dicek.');
          return;
        }
        tampilPesan(wadah, 'galat', pesanGalat(er, 'Gagal nyambung ke server. Isianmu masih ada, cek internet lalu coba lagi.'));
      });
    });
    return { kartu: kartu, pertama: fNama.input };
  }

  /* ------------------------------------------------------------------
     MASUK & CEK EMAIL
     ------------------------------------------------------------------ */
  function logoBesar() {
    var s = svg('svg', { viewBox: '0 0 24 24', focusable: 'false' });
    s.appendChild(svg('use', { href: '#i-percik' }));
    return el('span', { 'class': 'logo-tanda logo-tanda--besar', 'aria-hidden': 'true' }, [s]);
  }

  function gambarMasuk() {
    var kartu = el('section', { 'class': 'auth at-glass muncul', 'aria-labelledby': 'judul-masuk' });
    kartu.appendChild(logoBesar());
    kartu.appendChild(el('h1', { id: 'judul-masuk', text: 'Masuk ke Komisiku' }));
    kartu.appendChild(el('p', { 'class': 'auth-sub', text: 'Tulis email yang kamu pakai waktu daftar. Link masuk dikirim ke sana, tanpa password.' }));
    var wadah = wadahPesan();
    if (S.pesanMasuk) { wadah.appendChild(pesan(S.pesanMasuk.jenis, S.pesanMasuk.teks, S.pesanMasuk.ikon)); S.pesanMasuk = null; }
    kartu.appendChild(wadah);

    var fEmail = isian({ id: 'm-email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'nama@email.com', spellcheck: 'false', autocapitalize: 'none', maxlength: '120' });
    fEmail.input.addEventListener('input', function () { if (fEmail.input.getAttribute('aria-invalid')) fEmail.galat(null); });
    var madu = isianMadu('m-situs');
    var kirim = el('button', { 'class': 'tombol tombol--utama tombol--lebar tombol--bara', type: 'submit' }, [teksTombol('Kirim link masuk')]);
    var form = el('form', { 'class': 'auth-form', novalidate: true, 'aria-labelledby': 'judul-masuk' }, [fEmail.bungkus, madu.bungkus, kirim]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (kirim.disabled) return;
      tampilPesan(wadah, null, null);
      var email = fEmail.input.value.trim();
      if (!EMAIL_OK.test(email)) {
        fEmail.galat(email ? 'Cek lagi emailnya, contoh: nama@gmail.com' : 'Tulis email yang kamu pakai waktu daftar.');
        fEmail.input.focus();
        return;
      }
      fEmail.galat(null);
      mulaiMuat(kirim, 'Mengirim link');
      A.masuk({ email: email, situs: madu.input.value }).then(function (j) {
        S.cekEmail = { samar: j.email_samar || samarkanEmail(email), pesan: j.pesan, email: email, asal: 'masuk' };
        pindah('#cek-email');
      }, function (er) {
        selesaiMuat(kirim);
        if (er && er.salah && er.salah.email) { fEmail.galat(er.salah.email); fEmail.input.focus(); return; }
        tampilPesan(wadah, 'galat', pesanGalat(er, 'Gagal nyambung ke server. Cek internet lalu coba lagi.'));
      });
    });
    kartu.appendChild(form);
    kartu.appendChild(el('p', { 'class': 'alih' }, ['Belum daftar? ', el('a', { 'class': 'tautan', href: '#daftar', text: 'Daftar gratis' })]));
    isi.replaceChildren(el('div', { 'class': 'tengah' }, [kartu]));
    selesai('masuk', 'Masuk · Komisiku');
  }

  function gambarCekEmail() {
    var c = S.cekEmail || A.cekEmailAwal();
    var kartu = el('section', { 'class': 'auth at-glass muncul', 'aria-labelledby': 'judul-cek' });
    kartu.appendChild(el('span', { 'class': 'auth-ikon', 'aria-hidden': 'true' }, [ikon('surat')]));
    kartu.appendChild(el('h1', { id: 'judul-cek', text: 'Cek email kamu' }));
    /* Kalimat dari server: jawabannya sama walau email belum terdaftar (nol bocoran siapa affiliate) */
    kartu.appendChild(el('p', { 'class': 'auth-sub', text: (c && c.pesan) || 'Kalau emailnya benar, link masuk sudah dikirim. Cek kotak masuk atau folder spam ya.' }));
    if (c && c.samar) kartu.appendChild(el('p', { 'class': 'auth-email' }, ['Email yang kamu tulis: ', el('b', { text: c.samar })]));
    kartu.appendChild(el('p', { 'class': 'auth-tip', text: 'Link-nya cuma bisa dipakai sekali.' }));
    var wadah = wadahPesan();
    kartu.appendChild(wadah);

    var ulang;
    if (c && c.email) {
      ulang = el('button', { 'class': 'tombol tombol--lembut tombol--lebar', type: 'button' }, [teksTombol('Kirim ulang link')]);
      ulang.addEventListener('click', function () {
        if (ulang.disabled) return;
        tampilPesan(wadah, null, null);
        mulaiMuat(ulang, 'Mengirim ulang');
        A.masuk({ email: c.email }).then(function () {
          selesaiMuat(ulang);
          tampilPesan(wadah, 'sukses', 'Permintaan link baru terkirim ke ' + c.samar + '.');
          jedaUlang(ulang, 30);
        }, function (er) {
          selesaiMuat(ulang);
          tampilPesan(wadah, 'galat', pesanGalat(er, 'Gagal mengirim ulang. Cek internet lalu coba lagi.'));
        });
      });
    } else {
      ulang = el('a', { 'class': 'tombol tombol--lembut tombol--lebar', href: '#masuk' }, [teksTombol('Minta link baru')]);
    }
    kartu.appendChild(el('div', { 'class': 'auth-aksi' }, [
      ulang,
      el('a', { 'class': 'tombol tombol--garis tombol--lebar', href: c && c.asal === 'daftar' ? '#daftar' : '#masuk' }, [teksTombol('Ganti email')])
    ]));
    if (A.mode === 'contoh') {
      var tujuan = c && c.asal === 'daftar' ? '#komisiku-baru' : '#komisiku';
      kartu.appendChild(el('div', { 'class': 'contoh-saja' }, [
        el('p', { 'class': 'contoh-label', text: 'Khusus mode contoh' }),
        el('p', { text: 'Di halaman asli, langkah berikutnya ada di email: link diklik, langsung masuk Komisiku.' }),
        el('a', { 'class': 'tombol tombol--garis tombol--lebar', href: tujuan }, [teksTombol('Buka link dari email (contoh)')])
      ]));
    }
    isi.replaceChildren(el('div', { 'class': 'tengah' }, [kartu]));
    selesai('cek-email', 'Cek email · Komisiku');
  }
  function jedaUlang(b, detik) {
    var t = b.querySelector('.tombol-teks');
    var sisa = detik;
    b.disabled = true;
    function tulis() { t.textContent = 'Kirim ulang lagi dalam ' + sisa + ' dtk'; }
    tulis();
    clearInterval(timerUlang);
    timerUlang = setInterval(function () {
      sisa -= 1;
      if (sisa <= 0) { clearInterval(timerUlang); b.disabled = false; t.textContent = 'Kirim ulang link'; return; }
      tulis();
    }, 1000);
  }

  /* ------------------------------------------------------------------
     Media kit (dipakai tab Sebar & strip contoh di Daftar)
     ------------------------------------------------------------------ */
  function hurufBesarAwal(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function judulPendek(j) { return hurufBesarAwal(String(j || '').replace(/^contoh\s+/i, '')); }
  function namaFile(url) { return String(url).split('/').pop().split('?')[0]; }

  function bingkaiMedia(k, label) {
    var file = urlAman(k.file);
    function gagal(b) {
      b.classList.add('kit-bingkai--gagal');
      if (!b.querySelector('.kit-gagal')) b.appendChild(el('span', { 'class': 'kit-gagal', text: 'Pratinjau gagal dimuat. File tetap bisa diunduh.' }));
    }
    if (k.jenis === 'video') {
      var poster = urlAman(k.poster);
      var v = el('video', { preload: poster ? 'none' : 'metadata', playsinline: true, poster: poster || null, 'aria-label': label });
      v.src = poster ? file : file + '#t=0.1';
      var putar = el('button', { type: 'button', 'class': 'kit-putar', 'aria-label': 'Putar ' + label.toLowerCase() }, [ikon('putar')]);
      var bingkai = el('div', { 'class': 'kit-bingkai' }, [v, el('span', { 'class': 'kit-tag', text: 'Video' }), putar]);
      putar.addEventListener('click', function () {
        v.controls = true;
        putar.hidden = true;
        var main = v.play();
        if (main && main.catch) {
          main.catch(function () {
            v.controls = false;
            putar.hidden = false;
            toast('Video belum bisa diputar di browser ini. Pakai tombol Unduh.', 'galat');
          });
        }
      });
      v.addEventListener('error', function () { gagal(bingkai); });
      return bingkai;
    }
    var img = el('img', { src: file, alt: label + ', ' + String(k.catatan || '').toLowerCase(), width: '600', height: '800' });
    var tautan = el('a', { 'class': 'kit-bingkai', href: file, target: '_blank', rel: 'noopener', 'aria-label': 'Buka ' + label.toLowerCase() + ' ukuran penuh' }, [
      img, el('span', { 'class': 'kit-tag', text: 'Gambar' })
    ]);
    img.addEventListener('error', function () { img.remove(); gagal(tautan); });
    return tautan;
  }

  /* ------------------------------------------------------------------
     TAB SEBAR (isi Opsi B): hero link, kit promosi, caption berisi link
     ------------------------------------------------------------------ */
  function kotakLink(link) {
    var t = tanpaSkema(link);
    var i = t.indexOf('?ref=');
    var dasar = i >= 0 ? t.slice(0, i + 5) : t;
    var kode = i >= 0 ? t.slice(i + 5) : '';
    return el('div', { 'class': 'link-kotak hero-link' }, [
      ikon('link'),
      el('p', { 'class': 'link-teks' }, [el('span', { text: dasar }), el('wbr'), el('span', { 'class': 'link-kode', text: kode })])
    ]);
  }
  function nodeCaption(tpl, link, harga) {
    var p = el('p', { 'class': 'caption-teks' });
    String(tpl).split('{harga}').join(harga || '').split('{link}').forEach(function (bagian, i) {
      if (i > 0) p.appendChild(el('span', { 'class': 'caption-link', text: link }));
      if (bagian) p.appendChild(document.createTextNode(bagian));
    });
    return p;
  }

  function gambarSebar(d) {
    var af = d.affiliate, P = d.program, r = d.ringkasan;
    var harga = rupiahPendek(P.harga_produk);
    var baru = akunBaru(d);
    var link = af.link;
    var capWA = cariCaption(S.kit, /\bwa\b/i);
    var capIG = cariCaption(S.kit, /story|\big\b/i);
    var teksWA = capWA ? isiLink(capWA.teks, link, harga) : link;

    var hero = el('section', { 'class': 'hero at-glass muncul' + (baru ? ' hero--baru' : ''), 'aria-labelledby': 'judul-sebar' });
    hero.appendChild(gelombang());
    if (!baru) hero.appendChild(garisCahaya()); /* desktop: garis cahaya lebar di kolom kanan, seperti hero app */
    hero.appendChild(el('p', { 'class': 'k-label k-label--bara hero-label', text: 'Komisiku · ' + af.nama }));
    hero.appendChild(baru
      ? el('h1', { id: 'judul-sebar', 'class': 'hero-judul' }, ['Sebar ', el('span', { 'class': 'at-text-ember', text: 'link pertamamu' })])
      : el('h1', { id: 'judul-sebar', 'class': 'hero-judul' }, ['Link kamu ', el('span', { 'class': 'at-text-ember', text: 'siap disebar' })]));
    hero.appendChild(kotakLink(link));
    var salinLink = function (kelas) {
      return tombolSalin('Salin link', function () { return link; }, 'Link tersalin. Tempel di chat, bio, atau caption.', kelas, { ikon: 'link' });
    };
    if (baru) {
      hero.appendChild(el('p', { 'class': 'hero-sub' }, ['Satu pembeli lewat link ini, kamu dapat ', el('b', { text: rupiah(P.komisi_per_pembeli) }), '. Pesan WA-nya sudah jadi, tinggal kirim ke kontak, grup, atau status.']));
      if (capWA) {
        hero.appendChild(el('div', { 'class': 'pesan-pertama hero-samping' }, [
          el('p', { 'class': 'k-label', text: 'Pesan WA siap kirim' }),
          nodeCaption(capWA.teks, link, harga)
        ]));
      }
      hero.appendChild(el('div', { 'class': 'hero-aksi' }, [
        tautanWA(teksWA, 'Kirim ke WA', 'tombol--bara'),
        capWA ? tombolSalin('Salin pesan', function () { return teksWA; }, 'Pesan tersalin, linkmu sudah ada di dalamnya.', 'tombol--garis') : null,
        salinLink('tombol--garis')
      ]));
    } else {
      hero.appendChild(el('p', { 'class': 'hero-sub' }, ['Tiap orang yang beli Adverthinking lewat link ini, kamu dapat ', el('b', { text: rupiah(P.komisi_per_pembeli) }), '. Caption dan contoh hasil buat promosinya ada di bawah.']));
      hero.appendChild(el('div', { 'class': 'hero-aksi' }, [
        salinLink('tombol--bara'),
        tautanWA(teksWA, 'Bagikan ke WA', 'tombol--garis'),
        capIG ? tombolSalin('Salin caption IG', function () { return isiLink(capIG.teks, link, harga); },
          'Caption story tersalin. Di IG Story, tempel sebagai teks lalu pasang stiker Link ke linkmu.', 'tombol--garis', { ikon: 'ig', aria: 'Salin caption buat story IG' }) : null
      ]));
      hero.appendChild(el('dl', { 'class': 'hero-angka hero-samping' }, [
        el('div', null, [el('dt', { text: 'pembeli lewat linkmu' }), el('dd', { 'class': 'angka', text: String(r.jumlah_pembeli) })]),
        el('div', null, [el('dt', { text: 'komisi tiap pembeli' }), el('dd', { 'class': 'angka', text: rupiah(P.komisi_per_pembeli) })])
      ]));
    }

    var tautanAturan = el('a', { 'class': 'tautan', href: hashAkun('dompet'), text: 'aturan main', on: { click: function () { S.gulirAturan = true; } } });
    isi.replaceChildren(el('div', { 'class': 'sebar' }, [
      hero,
      bagianKit(d, baru),
      el('p', { 'class': 'sebar-kaki muncul' }, ['Sebelum nyebar, baca ', tautanAturan, ' dulu ya.'])
    ]));
    selesai('sebar', 'Sebar link · Komisiku');
  }

  function kartuKit(k) {
    var label = judulPendek(k.judul);
    var file = urlAman(k.file);
    return el('article', { 'class': 'kit-item at-glass-soft kit-item--' + k.jenis }, [
      bingkaiMedia(k, label),
      el('div', { 'class': 'kit-info' }, [
        el('p', { 'class': 'kit-judul', text: label }),
        k.catatan ? el('p', { 'class': 'kit-alat', text: k.catatan }) : null,
        el('div', { 'class': 'kit-unduh' }, [
          el('a', { 'class': 'tombol tombol--garis', href: file, download: namaFile(file), target: '_blank', rel: 'noopener', 'aria-label': 'Unduh ' + label.toLowerCase() }, [ikon('unduh'), teksTombol('Unduh')])
        ])
      ])
    ]);
  }
  function kartuCaption(c, link, harga) {
    var teks = isiLink(c.teks, link, harga);
    var wa = /\bwa\b/i.test(c.judul || '');
    return el('article', { 'class': 'caption-kartu at-glass-soft' }, [
      el('p', { 'class': 'caption-judul', text: c.judul }),
      nodeCaption(c.teks, link, harga),
      el('div', { 'class': 'caption-aksi' }, [
        tombolSalin('Salin caption', function () { return teks; }, 'Caption tersalin, linkmu sudah ada di dalamnya.', 'tombol--lembut', { aria: 'Salin caption ' + String(c.judul || '').toLowerCase() }),
        wa ? tautanWA(teks, 'Kirim ke WA', 'tombol--garis') : null
      ])
    ]);
  }
  function bagianKit(d, baru) {
    var link = d.affiliate.link;
    var harga = rupiahPendek(d.program.harga_produk);
    var sec = el('section', { 'class': 'bagian kit muncul', 'aria-labelledby': 'judul-kit' });
    sec.appendChild(kepalaBagian('Kit promosi', baru ? 'Bahan buat promosi pertamamu' : 'Bahan siap sebar',
      'Contoh hasil asli dari tool Adverthinking. Unduh buat status atau feed, lalu pakai caption-nya. Linkmu otomatis ada di tiap caption.', 'judul-kit'));
    if (S.kit === null) {
      var ulang = el('button', { 'class': 'tombol tombol--lembut', type: 'button' }, [teksTombol('Muat ulang kit')]);
      ulang.addEventListener('click', function () {
        mulaiMuat(ulang, 'Memuat kit');
        S.kit = undefined;
        pastikanKit().then(function () { gambar(); });
      });
      sec.appendChild(el('div', { 'class': 'panel at-glass-soft keadaan-kecil', role: 'alert' }, [
        el('p', { 'class': 'kosong-judul', text: 'Kit promosi gagal dimuat' }),
        el('p', { text: 'Link kamu tetap bisa disalin dan dibagikan dari atas. Cek internet lalu muat ulang kit.' }),
        ulang
      ]));
      return sec;
    }
    var kit = S.kit || [];
    var media = kit.filter(function (k) { return (k.jenis === 'video' || k.jenis === 'gambar') && urlAman(k.file); })
      .sort(function (a, b) { return (a.jenis === 'video' ? 0 : 1) - (b.jenis === 'video' ? 0 : 1); });
    var caps = kit.filter(function (k) { return k.jenis === 'caption' && k.teks; });
    if (baru) caps = caps.filter(function (c) { return !/\bwa\b/i.test(c.judul || ''); });
    var blokMedia = media.length ? [
      el('div', { 'class': 'sub-kepala' }, [el('h3', { text: 'Contoh hasil buat status dan feed' }), el('p', { text: 'Ketuk gambar buat lihat ukuran penuh' })]),
      el('div', { 'class': 'kit-media' }, media.map(kartuKit))
    ] : null;
    var blokCap = caps.length ? [
      el('div', { 'class': 'sub-kepala' }, [
        el('h3', { text: baru ? 'Caption lain, buat IG dan TikTok' : 'Caption siap tempel' }),
        el('p', { text: 'Linkmu sudah terpasang: ' + tanpaSkema(link) })
      ]),
      el('div', { 'class': 'kit-caption' + (caps.length === 3 ? ' kit-caption--tiga' : '') }, caps.map(function (c) { return kartuCaption(c, link, harga); }))
    ] : null;
    tambah(sec, baru ? [blokCap, blokMedia] : [blokMedia, blokCap]);
    if (!blokMedia && !blokCap) sec.appendChild(el('p', { 'class': 'kosong', text: 'Kit promosi lagi disiapkan. Sementara, salin link di atas dan bagikan pakai kata-katamu sendiri.' }));
    return sec;
  }

  /* ------------------------------------------------------------------
     TAB DOMPET (isi Opsi A): saldo, Cairkan, angka, mutasi, pencairan
     ------------------------------------------------------------------ */
  function gambarDompet(d) {
    var af = d.affiliate;
    var baru = akunBaru(d);
    var sapa = el('div', { 'class': 'sapa muncul' }, [
      el('h1', { id: 'judul-dompet', text: 'Halo, ' + namaDepan(af.nama) }),
      el('p', null, baru
        ? ['Link ', el('b', { 'class': 'kode', text: af.kode }), ' aktif sejak ' + tglLengkap(af.aktif_sejak) + '. Tinggal dibagikan.']
        : ['Komisi dari link ', el('b', { 'class': 'kode', text: af.kode }), ', aktif sejak ' + tglLengkap(af.aktif_sejak) + '.'])
    ]);
    var kiri = el('div', { 'class': 'kolom kolom--kiri' });
    var kanan = el('div', { 'class': 'kolom kolom--kanan' });
    if (baru) {
      kiri.appendChild(kartuSaldoBaru(d));
      kiri.appendChild(panelRiwayatKosong(d));
      kanan.appendChild(kartuRekening(d));
      kanan.appendChild(panelAturan(d));
    } else {
      kiri.appendChild(kartuSaldo(d));
      kiri.appendChild(stripAngka(d.ringkasan));
      kiri.appendChild(panelRiwayat(d));
      kanan.appendChild(kartuRekening(d));
      kanan.appendChild(panelPencairan(d));
      kanan.appendChild(panelAturan(d));
    }
    isi.replaceChildren(sapa, el('div', { 'class': 'dompet' + (baru ? ' dompet--baru' : '') }, [kiri, kanan]));
    selesai('dompet', 'Dompet komisi · Komisiku');
  }

  function tombolCairkan(d) {
    var af = d.affiliate, r = d.ringkasan, P = d.program;
    if (r.diminta > 0) {
      return el('p', { 'class': 'saldo-status' }, [chip('diminta', 'Diproses'), rupiah(r.diminta) + ' lagi ditransfer, maks ' + P.transfer_maks + '.']);
    }
    var kunci = af.tujuan && af.tujuan.terkunci_sampai;
    if (kunci) return tombolMati('kunci', 'Terkunci sampai ' + tglHari(kunci) + ' ' + jam(kunci));
    if (r.siap_cair >= P.minimal_cair) {
      return el('a', { 'class': 'tombol tombol--utama tombol--bara', href: '#cairkan' }, [teksTombol('Cairkan ' + rupiah(r.siap_cair))]);
    }
    return tombolMati('kunci', 'Cairkan aktif mulai ' + rupiah(P.minimal_cair));
  }

  function kartuSaldo(d) {
    var af = d.affiliate, r = d.ringkasan, P = d.program;
    var order = d.order || [];
    var nSiap = order.filter(function (o) { return o.status === 'siap'; }).length;
    var tahan = order.filter(function (o) { return o.status === 'tertahan'; }).map(function (o) { return o.cair_mulai; }).sort();
    var kartu = el('section', { 'class': 'saldo at-glass blok-saldo muncul', 'aria-labelledby': 'label-saldo' });
    kartu.appendChild(garisCahaya());
    var atas = el('div', { 'class': 'saldo-atas' }, [el('h2', { 'class': 'k-label', id: 'label-saldo', text: 'Siap cair' })]);
    if (af.tujuan) atas.appendChild(el('span', { 'class': 'saldo-tujuan' }, [el('span', { 'class': 'sr-only', text: 'Rekening tujuan ' }), af.tujuan.nama_tujuan + ' ' + af.tujuan.nomor_samar]));
    kartu.appendChild(atas);
    kartu.appendChild(angkaBesar(r.siap_cair, 'saldo-angka' + (r.siap_cair > 0 ? ' at-text-ember' : ' saldo-angka--nol')));
    var sub;
    if (r.siap_cair < 0) sub = 'Minus karena ada pembeli yang minta uang kembali setelah komisinya dicairkan. Dipotong dari komisi berikutnya.';
    else if (nSiap > 0) sub = 'Dari ' + nSiap + ' pembeli yang sudah lewat masa tahan ' + P.masa_tahan_hari + ' hari.';
    else if (r.diminta > 0) sub = 'Semua saldo siap cair sudah kamu minta.';
    else sub = 'Belum ada komisi yang lewat masa tahan ' + P.masa_tahan_hari + ' hari.';
    kartu.appendChild(el('p', { 'class': 'saldo-sub', text: sub }));
    var aksi = el('div', { 'class': 'saldo-aksi' }, [tombolCairkan(d)]);
    if (r.tertahan > 0 && tahan.length) {
      aksi.appendChild(el('p', { 'class': 'saldo-susul' }, [el('span', null, [el('b', { text: rupiah(r.tertahan) }), ' lagi tertahan, mulai cair ' + tglPendek(tahan[0]) + '.'])]));
    }
    kartu.appendChild(aksi);
    kartu.appendChild(el('p', { 'class': 'saldo-info', text: 'Komisi ditahan ' + P.masa_tahan_hari + ' hari, lalu bisa dicairkan mulai ' + rupiah(P.minimal_cair) + '. Ditransfer manual maks ' + P.transfer_maks + ' ke bank atau e-wallet.' }));
    return kartu;
  }

  function kartuSaldoBaru(d) {
    var r = d.ringkasan, P = d.program;
    var kartu = el('section', { 'class': 'saldo saldo--baru at-glass blok-saldo muncul', 'aria-labelledby': 'label-saldo' });
    kartu.appendChild(garisCahaya());
    kartu.appendChild(el('div', { 'class': 'saldo-atas' }, [el('h2', { 'class': 'k-label', id: 'label-saldo', text: 'Saldo komisi' })]));
    kartu.appendChild(angkaBesar(r.siap_cair, 'saldo-angka saldo-angka--nol'));
    kartu.appendChild(el('p', { 'class': 'saldo-target' }, ['1 pembeli lewat linkmu = ', el('b', { 'class': 'at-text-ember', text: rupiah(P.komisi_per_pembeli) })]));
    kartu.appendChild(el('div', { 'class': 'target' }, [
      el('div', {
        'class': 'target-jalur', role: 'progressbar', 'aria-label': 'Menuju cair pertama',
        'aria-valuemin': '0', 'aria-valuemax': String(P.minimal_cair), 'aria-valuenow': String(Math.max(0, r.siap_cair)),
        'aria-valuetext': rupiah(r.siap_cair) + ' dari ' + rupiah(P.minimal_cair)
      }, [el('span', { 'class': 'target-titik' }), el('span', { 'class': 'target-ujung' })]),
      el('div', { 'class': 'target-label' }, [
        el('span', null, [el('b', { text: rupiah(r.siap_cair) }), ' sekarang']),
        el('span', null, ['Cair mulai ', el('b', { text: rupiah(P.minimal_cair) })])
      ])
    ]));
    kartu.appendChild(el('div', { 'class': 'saldo-aksi' }, [
      el('a', { 'class': 'tombol tombol--garis', href: hashAkun('sebar') }, [ikon('sebar'), teksTombol('Sebar linkmu sekarang')])
    ]));
    kartu.appendChild(el('p', { 'class': 'saldo-info', text: 'Komisi ditahan ' + P.masa_tahan_hari + ' hari, lalu bisa dicairkan. Ditransfer manual maks ' + P.transfer_maks + ' ke bank atau e-wallet.' }));
    return kartu;
  }

  function stripAngka(r) {
    function sel(label, nilai) { return el('div', { 'class': 'mini' }, [el('dt', { text: label }), el('dd', { 'class': 'angka', text: nilai })]); }
    return el('dl', { 'class': 'angka-mini at-glass-soft blok-angka muncul', 'aria-label': 'Ringkasan komisi' }, [
      sel('Pembeli', String(r.jumlah_pembeli)),
      sel('Tertahan', rupiah(r.tertahan)),
      sel('Dibayar', rupiah(r.dibayar))
    ]);
  }

  function kartuRekening(d) {
    var t = d.affiliate.tujuan;
    var kunci = t && t.terkunci_sampai;
    return el('section', { 'class': 'panel at-glass-soft rekening-kartu blok-rekening muncul', 'aria-labelledby': 'judul-rek' }, [
      el('div', { 'class': 'rek-isi' }, [
        el('h2', { id: 'judul-rek', text: 'Rekening pencairan' }),
        t
          ? el('p', { 'class': 'rek-nama' }, [el('b', { text: t.nama_tujuan + ' ' + t.nomor_samar }), ' a.n. ' + t.atas_nama])
          : el('p', { 'class': 'rek-nama rek-nama--kosong', text: 'Belum diisi. Isi sekarang, jadi begitu komisi siap tinggal klik Cairkan.' }),
        kunci ? el('p', { 'class': 'rek-kunci' }, [ikon('kunci'), 'Cairkan terkunci sampai ' + tglHari(kunci) + ' ' + jam(kunci) + ' karena rekening baru diganti.']) : null
      ]),
      el('a', { 'class': 'tombol tombol--garis tombol--kecil rek-aksi', href: '#cairkan' }, [teksTombol(t ? 'Ganti rekening' : 'Isi rekening')])
    ]);
  }

  function statusOrder(o) {
    if (o.status === 'tertahan') return { kelas: 'tertahan', label: 'Tertahan s/d ' + tglPendek(o.cair_mulai) };
    if (o.status === 'siap') return { kelas: 'siap', label: 'Siap cair' };
    if (o.status === 'diminta') return { kelas: 'diminta', label: 'Lagi dicairkan' };
    if (o.status === 'batal') return { kelas: 'ditolak', label: 'Batal, refund' };
    if (o.status === 'dicek') return { kelas: 'dicek', label: 'Dicek dulu' };
    return { kelas: 'dibayar', label: 'Dibayar' };
  }
  /* Baris mutasi: [ikon] email | nominal, lalu tanggal | chip. Kolom kanan selebar nominal. */
  function barisMutasi(kelas, ikonNama, judul, meta, nominal, chipLabel) {
    return el('li', { 'class': 'baris baris--' + kelas }, [
      el('span', { 'class': 'baris-ikon', 'aria-hidden': 'true' }, [ikon(ikonNama)]),
      el('span', { 'class': 'baris-judul', text: judul }),
      el('span', { 'class': 'baris-nominal angka', text: nominal }),
      el('span', { 'class': 'baris-bawah' }, [el('span', { 'class': 'baris-meta', text: meta }), chipLabel ? chip(kelas, chipLabel) : null])
    ]);
  }
  function panelRiwayat(d) {
    var daftar = (d.order || []).slice().sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0; });
    var panel = el('section', { 'class': 'panel at-glass-soft blok-riwayat muncul', 'aria-labelledby': 'judul-riwayat' }, [
      el('div', { 'class': 'panel-kepala' }, [el('h2', { id: 'judul-riwayat', text: 'Riwayat komisi' }), el('span', { 'class': 'panel-ket', text: d.ringkasan.jumlah_pembeli + ' pembeli lewat linkmu · email disamarkan' })])
    ]);
    if (!daftar.length) {
      panel.appendChild(el('p', { 'class': 'kosong', text: 'Belum ada pembeli yang tercatat.' }));
      return panel;
    }
    var ul = null, bulanIni = '';
    daftar.forEach(function (o) {
      var b = bulanTahun(o.tanggal);
      if (b !== bulanIni) {
        bulanIni = b;
        panel.appendChild(el('h3', { 'class': 'grup-bulan', text: b }));
        ul = el('ul', { 'class': 'mutasi' });
        panel.appendChild(ul);
      }
      var st = statusOrder(o);
      var nominal = o.komisi > 0 ? '+' + rupiah(o.komisi) : rupiah(0);
      ul.appendChild(barisMutasi(st.kelas, 'uang-masuk', o.pembeli_samar, tglHari(o.tanggal), nominal, st.label));
    });
    return panel;
  }
  function panelRiwayatKosong(d) {
    return el('section', { 'class': 'panel at-glass-soft blok-riwayat muncul', 'aria-labelledby': 'judul-riwayat' }, [
      el('div', { 'class': 'panel-kepala' }, [el('h2', { id: 'judul-riwayat', text: 'Riwayat komisi' }), el('span', { 'class': 'panel-ket', text: 'Belum ada pembeli' })]),
      el('ul', { 'class': 'mutasi' }, [
        barisMutasi('hantu', 'uang-masuk', 'Pembeli pertamamu', 'Muncul di sini begitu ada yang beli lewat linkmu', '+' + rupiah(d.program.komisi_per_pembeli), null)
      ]),
      el('p', { 'class': 'kosong', text: 'Tiap pembeli tercatat dengan tanggal, email yang disamarkan, dan status komisinya. Riwayat pencairan menyusul setelah cair pertama.' })
    ]);
  }
  function statusPayout(p, P) {
    if (p.status === 'dibayar') {
      var lama = selang(p.diminta_at, p.diputus_at);
      return { kelas: 'dibayar', label: 'Dibayar', meta: tglHari(p.diputus_at) + (lama ? ' · ' + lama + ' setelah diminta' : '') };
    }
    if (p.status === 'ditolak') return { kelas: 'ditolak', label: 'Ditolak', meta: tglHari(p.diputus_at || p.diminta_at) + ' · saldo balik ke siap cair' };
    return { kelas: 'diminta', label: 'Diproses', meta: 'Diminta ' + tglHari(p.diminta_at) + ' ' + jam(p.diminta_at) + ' · maks ' + P.transfer_maks };
  }
  function panelPencairan(d) {
    var payout = d.payout || [];
    var panel = el('section', { 'class': 'panel at-glass-soft blok-cair muncul', 'aria-labelledby': 'judul-cair' }, [
      el('div', { 'class': 'panel-kepala' }, [el('h2', { id: 'judul-cair', text: 'Riwayat pencairan' }), el('span', { 'class': 'panel-ket', text: 'Total dibayar ' + rupiah(d.ringkasan.dibayar) })])
    ]);
    if (!payout.length) {
      panel.appendChild(el('p', { 'class': 'kosong', text: 'Belum ada pencairan. Begitu siap cair minimal ' + rupiah(d.program.minimal_cair) + ', tombol Cairkan menyala.' }));
      return panel;
    }
    var ul = el('ul', { 'class': 'mutasi' });
    payout.slice().sort(function (a, b) { return Date.parse(b.diminta_at) - Date.parse(a.diminta_at); }).forEach(function (p) {
      var st = statusPayout(p, d.program);
      ul.appendChild(barisMutasi(st.kelas, 'uang-keluar', 'Ke ' + p.tujuan, st.meta, rupiah(p.jumlah), st.label));
    });
    panel.appendChild(ul);
    return panel;
  }
  function panelAturan(d) {
    var P = d.program, af = d.affiliate;
    var keluar = el('button', { 'class': 'tombol tombol--garis tombol--kecil', type: 'button' }, [ikon('keluar'), teksTombol('Keluar')]);
    keluar.addEventListener('click', function () {
      if (keluar.disabled) return;
      mulaiMuat(keluar, 'Keluar');
      A.keluar().then(function () {
        S.data = null;
        S.pesanMasuk = { jenis: 'info', teks: 'Kamu sudah keluar. Masuk lagi kapan saja pakai link email.', ikon: 'keluar' };
        pindah('#masuk');
      });
    });
    return el('section', { 'class': 'panel at-glass-soft aturan blok-aturan muncul', id: 'aturan', 'aria-labelledby': 'judul-aturan' }, [
      el('h2', { id: 'judul-aturan', tabindex: '-1', text: 'Aturan main' }),
      el('ul', { 'class': 'aturan-daftar' }, (P.aturan || []).map(function (a) { return el('li', { text: a }); })),
      el('p', { 'class': 'aturan-komisi', text: 'Komisi ' + rupiah(P.komisi_per_pembeli) + ' berlaku buat harga ' + rupiah(P.harga_produk) + '.' }),
      el('div', { 'class': 'akun-baris' }, [
        el('p', null, ['Masuk sebagai ', el('b', { text: af.nama }), ' · ' + af.email_samar + ' · kode ', el('b', { text: af.kode })]),
        keluar
      ])
    ]);
  }

  /* ------------------------------------------------------------------
     CAIRKAN (dalam tab Dompet, layout A)
     ------------------------------------------------------------------ */
  function barisDl(label, nilai) { return el('div', null, [el('dt', { text: label }), el('dd', null, nilai)]); }

  function kartuKonfirmasi(d) {
    var af = d.affiliate, r = d.ringkasan, P = d.program, t = af.tujuan;
    var siap = (d.order || []).filter(function (o) { return o.status === 'siap'; });
    var kartu = el('section', { 'class': 'konfirmasi at-glass muncul', 'aria-labelledby': 'label-jumlah' });
    kartu.appendChild(garisCahaya());
    kartu.appendChild(el('h2', { 'class': 'k-label', id: 'label-jumlah', text: 'Jumlah dicairkan' }));
    kartu.appendChild(angkaBesar(Math.max(0, r.siap_cair), 'saldo-angka' + (r.siap_cair > 0 ? ' at-text-ember' : ' saldo-angka--nol')));
    if (siap.length) {
      kartu.appendChild(el('p', { 'class': 'saldo-sub', text: 'Semua saldo siap cair, dari ' + siap.length + ' pembeli:' }));
      kartu.appendChild(el('ul', { 'class': 'cair-order' }, siap.map(function (o) {
        return el('li', null, [el('span', { text: o.pembeli_samar + ' · ' + tglPendek(o.tanggal) }), el('span', { 'class': 'angka', text: rupiah(o.komisi) })]);
      })));
    } else {
      kartu.appendChild(el('p', { 'class': 'saldo-sub', text: r.diminta > 0 ? 'Permintaan sebelumnya masih diproses.' : 'Belum ada saldo yang siap cair.' }));
    }
    kartu.appendChild(el('dl', { 'class': 'struk' }, [
      barisDl('Ke', t ? t.nama_tujuan + ' ' + t.nomor_samar : 'Belum ada rekening'),
      barisDl('Atas nama', t ? t.atas_nama : 'Isi di form rekening'),
      barisDl('Diproses', 'Transfer manual, maks ' + P.transfer_maks)
    ]));

    var wadah = wadahPesan();
    var kunci = t && t.terkunci_sampai;
    var bisa = d.cairkan ? !!d.cairkan.boleh : !!(t && !kunci && r.diminta === 0 && r.siap_cair >= P.minimal_cair);
    var tombol;
    if (bisa) {
      tombol = el('button', { 'class': 'tombol tombol--utama tombol--bara', type: 'button' }, [teksTombol('Cairkan ' + rupiah(r.siap_cair))]);
      tombol.addEventListener('click', function () {
        if (tombol.disabled) return;
        tampilPesan(wadah, null, null);
        mulaiMuat(tombol, 'Mengirim permintaan');
        var tujuanTeks = t.nama_tujuan + ' ' + t.nomor_samar;
        A.cairkan().then(function (j) {
          S.cairTerkirim = { jumlah: (j.payout && j.payout.jumlah) || r.siap_cair, tujuan: tujuanTeks };
          umumkan('Permintaan cair terkirim.');
          return A.status().then(function (d2) { simpanData(d2); }, function () { S.data = null; });
        }, function (er) {
          selesaiMuat(tombol);
          if (er && er.status === 401) { sesiHabis(); return; }
          tampilPesan(wadah, 'galat', er && er.status && er.status !== 0 && er.status < 500
            ? er.pesan
            : 'Permintaan belum terkirim karena koneksi putus. Saldo aman, coba lagi.');
          throw null;
        }).then(function () { gambar(); }, function () { /* galat sudah ditampilkan */ });
      });
    } else if (r.diminta > 0) {
      tombol = tombolMati('kunci', 'Tunggu transfer ' + rupiah(r.diminta) + ' dulu');
    } else if (kunci) {
      tombol = tombolMati('kunci', 'Terkunci sampai ' + tglHari(kunci) + ' ' + jam(kunci));
    } else if (!t && r.siap_cair >= P.minimal_cair) {
      tombol = tombolMati('kunci', 'Isi rekening dulu');
    } else {
      tombol = tombolMati('kunci', 'Cairkan aktif mulai ' + rupiah(P.minimal_cair));
    }
    kartu.appendChild(tombol);
    kartu.appendChild(wadah);
    kartu.appendChild(el('p', { 'class': 'konfirmasi-catatan', text: kunci
      ? 'Rekening baru diganti. Demi keamanan, Cairkan terkunci ' + KUNCI_JAM + ' jam.'
      : (!bisa && d.cairkan && d.cairkan.alasan ? d.cairkan.alasan + ' ' : '') + 'Jumlahnya otomatis semua saldo siap cair.' }));
    return kartu;
  }

  function kartuCairTerkirim(d) {
    var c = S.cairTerkirim, P = d.program;
    return el('section', { 'class': 'konfirmasi at-glass muncul', 'aria-labelledby': 'judul-beres' }, [
      garisCahaya(),
      el('span', { 'class': 'beres-ikon', 'aria-hidden': 'true' }, [ikon('cek')]),
      el('h2', { 'class': 'beres-judul', id: 'judul-beres', text: 'Permintaan cair terkirim' }),
      angkaBesar(c.jumlah, 'saldo-angka at-text-ember'),
      el('p', { 'class': 'saldo-sub', text: 'Ke ' + c.tujuan + '. Ditransfer manual maks ' + P.transfer_maks + '.' }),
      el('p', { 'class': 'saldo-info', text: 'Selama belum ditransfer, statusnya Diproses di Dompet. Begitu uangnya dikirim, berubah jadi Dibayar dan kamu dapat email.' }),
      el('a', { 'class': 'tombol tombol--utama tombol--lebar tombol--bara', href: hashAkun('dompet') }, [teksTombol('Balik ke Dompet')])
    ]);
  }

  function formRekening(d) {
    var af = d.affiliate, t = af.tujuan, P = d.program;
    var boleh = P.tujuan_boleh || { bank: [], ewallet: [] };
    var form = el('form', { 'class': 'panel at-glass-soft rekening muncul', novalidate: true, 'aria-labelledby': 'judul-rekening' });
    form.appendChild(el('h2', { id: 'judul-rekening', text: t ? 'Ganti rekening tujuan' : 'Isi rekening tujuan' }));
    if (t) form.appendChild(el('p', { 'class': 'rekening-sekarang' }, ['Sekarang: ', el('b', { text: t.nama_tujuan + ' ' + t.nomor_samar }), ' a.n. ' + t.atas_nama]));
    var wadah = wadahPesan();
    if (S.pesanRekening) { wadah.appendChild(pesan('sukses', S.pesanRekening)); S.pesanRekening = null; }
    form.appendChild(wadah);

    var jenisAwal = t ? t.jenis : 'ewallet';
    var radios = {};
    var galatJenis = el('p', { 'class': 'isian-galat', id: 'r-jenis-galat', hidden: true });
    var segmen = el('fieldset', { 'class': 'jenis-bungkus', 'aria-describedby': 'r-jenis-galat' }, [el('legend', { 'class': 'isian-label', text: 'Jenis' })]);
    var pilihan = el('div', { 'class': 'segmen' });
    ['ewallet', 'bank'].forEach(function (j) {
      radios[j] = el('input', { type: 'radio', name: 'jenis', value: j, checked: j === jenisAwal });
      pilihan.appendChild(el('label', { 'class': 'segmen-pilih' }, [radios[j], el('span', { text: j === 'ewallet' ? 'E-wallet' : 'Bank' })]));
    });
    segmen.appendChild(pilihan);
    segmen.appendChild(galatJenis);

    var fNama = isian({ id: 'r-nama', label: 'Nama e-wallet', tag: 'select' });
    var fNomor = isian({ id: 'r-nomor', label: 'Nomor HP terdaftar', inputmode: 'numeric', autocomplete: 'off', placeholder: '08xxxxxxxxxx', maxlength: '26', spellcheck: 'false' });
    var fAtas = isian({ id: 'r-atas', label: 'Atas nama', autocomplete: 'name', value: t ? t.atas_nama : af.nama, maxlength: '60', bantuan: 'Sesuai nama pemilik rekening atau akun e-wallet.' });
    /* Bank di luar daftar (mis. Bank Jatim): pilih "Lainnya" lalu tulis namanya; server menyimpan nama ini apa adanya */
    var fLain = isian({ id: 'r-lain', label: 'Nama bank lain', autocomplete: 'off', maxlength: '40', placeholder: 'Contoh: Bank Jatim', spellcheck: 'false' });
    var POLA_BANK_LAIN = /^[A-Za-z0-9][A-Za-z0-9 .()&'-]{1,39}$/;
    function aturLain() {
      var tampil = radios.bank.checked && fNama.input.value === 'Lainnya';
      fLain.bungkus.hidden = !tampil;
      if (!tampil) fLain.galat(null);
    }

    function isiPilihan(jenis, pilih) {
      var daftar = boleh[jenis] || [];
      /* rekening tersimpan dengan nama bank di luar daftar = dulu dipilih lewat "Lainnya" */
      var diLuar = jenis === 'bank' && !!pilih && daftar.indexOf(pilih) === -1 && daftar.indexOf('Lainnya') !== -1;
      fNama.input.replaceChildren(el('option', { value: '', text: jenis === 'bank' ? 'Pilih bank' : 'Pilih e-wallet' }));
      daftar.forEach(function (n) { fNama.input.appendChild(el('option', { value: n, text: n, selected: diLuar ? n === 'Lainnya' : n === pilih })); });
      fLain.input.value = diLuar ? pilih : '';
      fNama.bungkus.querySelector('label').textContent = jenis === 'bank' ? 'Nama bank' : 'Nama e-wallet';
      fNomor.bungkus.querySelector('label').textContent = jenis === 'bank' ? 'Nomor rekening' : 'Nomor HP terdaftar';
      fNomor.input.setAttribute('placeholder', jenis === 'bank' ? 'Angka saja' : '08xxxxxxxxxx');
      [fNama, fNomor].forEach(function (f) { f.galat(null); });
      aturLain();
    }
    isiPilihan(jenisAwal, t ? t.nama_tujuan : '');
    Object.keys(radios).forEach(function (j) {
      radios[j].addEventListener('change', function () { if (radios[j].checked) { isiPilihan(j, ''); galatJenis.hidden = true; } });
    });
    fNama.input.addEventListener('change', function () { fNama.galat(null); aturLain(); });
    [fNomor, fAtas, fLain].forEach(function (f) {
      f.input.addEventListener('input', function () { if (f.input.getAttribute('aria-invalid')) f.galat(null); });
    });

    var catatan = el('p', { 'class': 'catatan-kunci' }, [ikon('kunci'), el('span', null, t
      ? [el('b', { text: 'Ganti rekening = Cairkan terkunci ' + KUNCI_JAM + ' jam.' }), ' Ini buat jaga-jaga kalau akunmu dipakai orang lain.']
      : ['Rekening pertama langsung aktif. ', el('b', { text: 'Kalau nanti diganti, Cairkan terkunci ' + KUNCI_JAM + ' jam.' })])]);
    var simpan = el('button', { 'class': 'tombol tombol--lembut tombol--lebar', type: 'submit' }, [teksTombol(t ? 'Simpan rekening baru' : 'Simpan rekening')]);
    form.appendChild(el('div', { 'class': 'form-isian' }, [segmen, fNama.bungkus, fLain.bungkus, fNomor.bungkus, fAtas.bungkus, catatan, simpan]));

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (simpan.disabled) return;
      tampilPesan(wadah, null, null);
      var jenis = radios.bank.checked ? 'bank' : 'ewallet';
      var nama = fNama.input.value;
      var lain = fLain.input.value.trim();
      var pakaiLain = jenis === 'bank' && nama === 'Lainnya';
      var namaTampil = pakaiLain ? lain : nama;
      var nomor = fNomor.input.value.replace(/[\s.-]/g, '');
      var atas = fAtas.input.value.trim();
      fNama.galat(nama ? null : (jenis === 'bank' ? 'Pilih bank dulu.' : 'Pilih e-wallet dulu.'));
      fLain.galat(!pakaiLain || POLA_BANK_LAIN.test(lain) ? null : 'Tulis nama bank, 2-40 huruf.');
      fNomor.galat(/^\d{6,20}$/.test(nomor) ? null : (jenis === 'bank' ? 'Nomor rekening 6-20 angka.' : 'Nomor HP e-wallet 6-20 angka, contoh 081234567890.'));
      fAtas.galat(atas.length >= 2 ? null : 'Tulis nama pemilik rekening.');
      var salah = cariInvalid(form);
      if (salah) { salah.focus(); umumkan('Ada isian rekening yang perlu dicek.'); return; }
      mulaiMuat(simpan, 'Menyimpan');
      A.ubahTujuan({ jenis: jenis, nama_tujuan: nama, nama_lain: pakaiLain ? lain : undefined, nomor: nomor, atas_nama: atas }).then(function (j) {
        var akhir = nomor.slice(-4);
        return A.status().then(function (d2) {
          simpanData(d2);
          var tj = d2.affiliate.tujuan;
          var kunci = tj && tj.terkunci_sampai;
          S.pesanRekening = 'Rekening tersimpan: ' + namaTampil + ' •••• ' + akhir + '.' +
            (j && j.terkunci_jam > 0 && kunci ? ' Cairkan terkunci sampai ' + tglHari(kunci) + ' ' + jam(kunci) + '.' : '');
        }, function () {
          S.data = null;
          S.pesanRekening = 'Rekening tersimpan: ' + namaTampil + ' •••• ' + akhir + '.';
        });
      }, function (er) {
        selesaiMuat(simpan);
        if (er && er.status === 401) { sesiHabis(); throw null; }
        if (er && er.salah) {
          if (er.salah.jenis) { galatJenis.replaceChildren(ikon('seru'), el('span', { text: er.salah.jenis })); galatJenis.hidden = false; }
          if (er.salah.nama_tujuan) fNama.galat(er.salah.nama_tujuan);
          if (er.salah.nama_lain) fLain.galat(er.salah.nama_lain);
          if (er.salah.nomor) fNomor.galat(er.salah.nomor);
          if (er.salah.atas_nama) fAtas.galat(er.salah.atas_nama);
          var pertama = cariInvalid(form);
          if (pertama) pertama.focus();
          umumkan('Ada isian rekening yang perlu dicek.');
          throw null;
        }
        tampilPesan(wadah, 'galat', er && er.status && er.status < 500 ? er.pesan : 'Rekening belum tersimpan karena koneksi putus. Rekening lama tetap dipakai, coba lagi.');
        throw null;
      }).then(function () {
        umumkan('Rekening tersimpan.');
        gambar();
      }, function () { /* galat sudah ditampilkan */ });
    });
    return form;
  }

  function gambarCairkan(d) {
    var terkirim = !!S.cairTerkirim;
    isi.replaceChildren(
      el('a', { 'class': 'kembali muncul', href: hashAkun('dompet') }, [ikon('kembali'), el('span', { text: 'Dompet' })]),
      el('div', { 'class': 'sapa muncul' }, [
        el('h1', { text: terkirim ? 'Permintaan terkirim' : 'Cairkan komisi' }),
        el('p', { text: terkirim ? 'Tinggal tunggu transfer masuk ke rekeningmu.' : 'Cek jumlah dan rekening tujuan, lalu kirim permintaan.' })
      ]),
      el('div', { 'class': 'cair-grid' }, [
        el('div', { 'class': 'kolom' }, [terkirim ? kartuCairTerkirim(d) : kartuKonfirmasi(d)]),
        el('div', { 'class': 'kolom' }, [formRekening(d)])
      ])
    );
    selesai('cairkan', 'Cairkan komisi · Komisiku');
  }

  /* ------------------------------------------------------------------
     MODE BOLO (?putus=token dari Telegram): nol tab & menu affiliate
     ------------------------------------------------------------------ */
  function barisSalin(label, tampil, teksSalin, pesanOk, kelasNilai, aria) {
    return el('div', null, [
      el('dt', { text: label }),
      el('dd', { 'class': kelasNilai || null, text: tampil }),
      tombolSalin('Salin', function () { return teksSalin; }, pesanOk, 'tombol--lembut salin-kecil', { aria: aria })
    ]);
  }

  function gambarPutus(urut) {
    if (!S.putusData && !S.putusGalat && !S.putusHasil) {
      if (A.mode === 'asli' && !S.putusToken) {
        S.putusGalat = { status: 403, pesan: 'Link tandai gak kebaca di halaman ini. Buka lagi link dari notif Telegram (berlaku 7 hari, sekali pakai).' };
      } else {
        tampilMemuat('Memuat permintaan cair', el('div', { 'class': 'putus' }, [el('div', { 'class': 'putus-kartu at-glass', 'aria-busy': 'true' }, [
          el('span', { 'class': 'kerangka kerangka--label' }), el('span', { 'class': 'kerangka kerangka--angka' }),
          el('span', { 'class': 'kerangka kerangka--baris' }), el('span', { 'class': 'kerangka kerangka--baris' })
        ])]));
        selesai('putus', 'Tandai pencairan · Komisiku');
        A.putusLihat(S.putusToken).then(function (p) {
          S.putusData = p;
        }, function (er) {
          S.putusGalat = er && typeof er.status === 'number' ? er : { status: 0, pesan: '' };
        }).then(function () { if (urut === S.urut) gambar(); });
        return;
      }
    }
    var wrap = el('div', { 'class': 'putus' });

    if (S.putusHasil) {
      var p0 = S.putusData, dibayar = S.putusHasil.hasil === 'dibayar';
      wrap.appendChild(el('section', { 'class': 'putus-kartu putus-beres at-glass muncul', 'aria-labelledby': 'judul-putus' }, [
        el('span', { 'class': 'beres-ikon' + (dibayar ? '' : ' beres-ikon--tolak'), 'aria-hidden': 'true' }, [ikon(dibayar ? 'cek' : 'seru')]),
        el('h1', { 'class': 'beres-judul', id: 'judul-putus', text: dibayar ? 'Sudah ditandai dibayar' : 'Pencairan ditolak' }),
        el('p', { text: dibayar
          ? rupiah(p0.jumlah) + ' ke ' + p0.nama + ' (' + p0.tujuan.nama_tujuan + '). ' + namaDepan(p0.nama) + ' sekarang lihat status Dibayar di Komisiku.'
          : 'Saldo ' + namaDepan(p0.nama) + ' ' + rupiah(p0.jumlah) + ' balik ke siap cair.' }),
        S.putusHasil.catatan ? el('p', null, ['Catatan: ', el('span', { text: S.putusHasil.catatan })]) : null,
        el('p', { 'class': 'putus-kaki', text: 'Link ini sudah dipakai. Halaman ini boleh ditutup.' })
      ]));
      isi.replaceChildren(wrap);
      selesai('putus', 'Tandai pencairan · Komisiku');
      return;
    }

    if (S.putusGalat) {
      var g = S.putusGalat;
      var ulang = null;
      if (g.status === 0 || g.status >= 500) {
        ulang = el('button', { 'class': 'tombol tombol--lembut', type: 'button' }, [teksTombol('Coba lagi')]);
        ulang.addEventListener('click', function () { S.putusGalat = null; gambar(); });
      }
      wrap.appendChild(el('section', { 'class': 'putus-kartu putus-beres at-glass muncul', role: 'alert', 'aria-labelledby': 'judul-putus' }, [
        el('span', { 'class': 'beres-ikon beres-ikon--tolak', 'aria-hidden': 'true' }, [ikon('seru')]),
        el('h1', { 'class': 'beres-judul', id: 'judul-putus', text: g.status === 0 || g.status >= 500 ? 'Permintaan cair gagal dimuat' : 'Link tandai gak bisa dipakai' }),
        el('p', { text: g.status === 0 ? 'Koneksi ke server putus. Link-nya masih berlaku, coba lagi.' : g.pesan }),
        ulang
      ]));
      isi.replaceChildren(wrap);
      selesai('putus', 'Tandai pencairan · Komisiku');
      return;
    }

    var p = S.putusData, t = p.tujuan;
    wrap.appendChild(el('div', { 'class': 'sapa sapa--tengah muncul' }, [
      el('p', { 'class': 'k-label k-label--bara', text: 'Permintaan cair #' + p.payout_id }),
      el('h1', { id: 'judul-putus' }, ['Transfer ', el('span', { 'class': 'at-text-ember', text: rupiah(p.jumlah) }), ' ke ' + p.nama]),
      el('p', { text: 'Diminta ' + tglHariLengkap(p.diminta_at) + ' pukul ' + jam(p.diminta_at) + ' WIB, dari ' + p.jumlah_order + ' order.' })
    ]));

    var rekening = p.rekening_baru_diubah
      ? el('span', { 'class': 'awas' }, [ikon('seru'), 'Baru diganti. Cek dulu ke ' + namaDepan(p.nama) + ' sebelum transfer.'])
      : el('span', { 'class': 'aman' }, [ikon('cek'), 'Gak diganti 7 hari terakhir']);
    var kartu = el('section', { 'class': 'putus-kartu at-glass muncul', 'aria-label': 'Rincian transfer' });
    kartu.appendChild(el('dl', { 'class': 'struk struk--putus' }, [
      barisSalin('Jumlah', rupiah(p.jumlah), String(p.jumlah), 'Jumlah tersalin.', 'jumlah-besar angka', 'Salin jumlah'),
      barisDl('Tujuan', t.nama_tujuan + (t.jenis === 'bank' ? ' (bank)' : ' (e-wallet)')),
      barisSalin('Nomor', t.nomor, t.nomor, 'Nomor tersalin.', 'nomor-utuh', 'Salin nomor ' + t.nama_tujuan),
      barisDl('Atas nama', t.atas_nama),
      barisDl('Affiliate', p.nama + ' · ' + p.kode),
      barisDl('Jumlah order', String(p.jumlah_order)),
      barisDl('Diminta', tglHariLengkap(p.diminta_at) + ', ' + jam(p.diminta_at) + ' WIB'),
      barisDl('Rekening', rekening)
    ]));

    var fCatatan = isian({ id: 'p-catatan', label: 'Catatan (wajib kalau Tolak)', tag: 'textarea', placeholder: 'mis. nomor referensi transfer, atau alasan menolak', maxlength: '300' });
    fCatatan.input.addEventListener('input', function () { if (fCatatan.input.getAttribute('aria-invalid')) fCatatan.galat(null); });
    var wadah = wadahPesan();
    var bayar = el('button', { 'class': 'tombol tombol--utama tombol--bara', type: 'button' }, [ikon('cek'), teksTombol('Sudah dibayar')]);
    var tolak = el('button', { 'class': 'tombol tombol--bahaya', type: 'button' }, [teksTombol('Tolak')]);
    var aksi = el('div', { 'class': 'putus-aksi' }, [bayar, tolak]);
    var konfirmasi = el('div', { 'class': 'putus-konfirmasi', hidden: true });

    function batalKonfirmasi() {
      konfirmasi.hidden = true;
      konfirmasi.replaceChildren();
      aksi.hidden = false;
      fCatatan.input.readOnly = false;
    }
    function minta(hasil) {
      var catatan = fCatatan.input.value.trim();
      if (hasil === 'ditolak' && !catatan) {
        fCatatan.galat('Tulis alasan penolakannya dulu, biar ' + namaDepan(p.nama) + ' tahu kenapa.');
        fCatatan.input.focus();
        return;
      }
      fCatatan.galat(null);
      tampilPesan(wadah, null, null);
      var ya = el('button', { 'class': 'tombol tombol--utama ' + (hasil === 'dibayar' ? 'tombol--bara' : 'tombol--bahaya'), type: 'button' }, [
        teksTombol(hasil === 'dibayar' ? 'Ya, tandai dibayar' : 'Ya, tolak pencairan')
      ]);
      var batal = el('button', { 'class': 'tombol tombol--garis', type: 'button' }, [teksTombol('Batal')]);
      var judulK = el('p', { 'class': 'konfirmasi-judul', id: 'judul-konfirmasi', tabindex: '-1', text: hasil === 'dibayar' ? 'Yakin sudah transfer?' : 'Yakin tolak pencairan ini?' });
      konfirmasi.replaceChildren(
        judulK,
        el('p', { 'class': 'konfirmasi-teks', text: hasil === 'dibayar'
          ? rupiah(p.jumlah) + ' ke ' + t.nama_tujuan + ' ' + t.nomor + ' a.n. ' + t.atas_nama + ' ditandai dibayar. ' + namaDepan(p.nama) + ' langsung lihat status Dibayar dan dapat email.'
          : 'Saldo ' + rupiah(p.jumlah) + ' balik ke siap cair ' + namaDepan(p.nama) + '. Catatanmu ikut dikirim ke emailnya.' }),
        el('p', { 'class': 'konfirmasi-teks konfirmasi-teks--redup', text: 'Link ini sekali pakai. Keputusan gak bisa diubah dari halaman ini.' }),
        el('div', { 'class': 'putus-aksi' }, [ya, batal])
      );
      konfirmasi.setAttribute('role', 'group');
      konfirmasi.setAttribute('aria-labelledby', 'judul-konfirmasi');
      aksi.hidden = true;
      konfirmasi.hidden = false;
      fCatatan.input.readOnly = true;
      judulK.focus();
      batal.addEventListener('click', function () { batalKonfirmasi(); (hasil === 'dibayar' ? bayar : tolak).focus(); });
      konfirmasi.onkeydown = function (ev) {
        if (ev.key === 'Escape' && !ya.disabled) { ev.preventDefault(); batalKonfirmasi(); (hasil === 'dibayar' ? bayar : tolak).focus(); }
      };
      ya.addEventListener('click', function () {
        if (ya.disabled) return;
        mulaiMuat(ya, 'Menyimpan');
        batal.disabled = true;
        A.putus(S.putusToken, hasil, catatan).then(function () {
          S.putusToken = '';
          S.putusHasil = { hasil: hasil, catatan: catatan };
          umumkan(hasil === 'dibayar' ? 'Ditandai dibayar.' : 'Pencairan ditolak.');
          gambar();
        }, function (er) {
          selesaiMuat(ya);
          batal.disabled = false;
          tampilPesan(wadah, 'galat', er && er.status && er.status < 500 ? er.pesan : 'Belum tersimpan karena koneksi putus. Coba lagi, link masih berlaku.');
        });
      });
    }
    bayar.addEventListener('click', function () { minta('dibayar'); });
    tolak.addEventListener('click', function () { minta('ditolak'); });
    kartu.appendChild(el('div', { 'class': 'putus-form' }, [
      el('h2', { 'class': 'putus-judul', text: 'Tandai sudah dibayar' }),
      el('p', { 'class': 'putus-bantu', text: 'Transfer dulu sesuai rincian di atas, lalu ketuk Sudah dibayar. Ada yang janggal? Tulis alasannya, lalu Tolak.' }),
      fCatatan.bungkus,
      aksi,
      konfirmasi,
      wadah
    ]));
    wrap.appendChild(kartu);
    wrap.appendChild(el('p', { 'class': 'putus-kaki', text: 'Link ini sekali pakai dan berlaku 7 hari. Begitu ditandai, ' + namaDepan(p.nama) + ' langsung lihat statusnya di Komisiku.' }));
    isi.replaceChildren(wrap);
    selesai('putus', 'Tandai pencairan · Komisiku');
  }

  /* ------------------------------------------------------------------
     Alur utama
     ------------------------------------------------------------------ */
  function sesiHabis() {
    A.hapusSesi();
    S.data = null;
    S.pesanMasuk = { jenis: 'info', teks: 'Sesi kamu sudah habis. Masuk lagi pakai link email ya.', ikon: 'kunci' };
    pindah('#masuk');
  }

  /* Kerangka baru tampil kalau data belum datang dalam 150 ms: mode contoh (langsung) nol kedip */
  function tungguData(janji, urut, kerangka, teks, lanjut, gagal) {
    var tanda = setTimeout(function () {
      if (urut !== S.urut) return;
      tampilMemuat(teks, kerangka());
      document.title = 'Memuat · Komisiku';
    }, 150);
    janji.then(function (v) {
      clearTimeout(tanda);
      if (urut === S.urut) lanjut(v);
    }, function (er) {
      clearTimeout(tanda);
      if (urut === S.urut) gagal(er);
    });
  }
  function kerangkaDaftar() {
    return el('div', { 'class': 'daftar-grid', 'aria-hidden': 'true' }, [
      el('div', { 'class': 'pitch at-glass' }, [el('span', { 'class': 'kerangka kerangka--label' }), el('span', { 'class': 'kerangka kerangka--angka' }), el('span', { 'class': 'kerangka kerangka--baris' }), el('span', { 'class': 'kerangka kerangka--baris' })]),
      el('div', { 'class': 'form-kartu at-glass-soft' }, [0, 1, 2, 3].map(function () { return el('span', { 'class': 'kerangka kerangka--baris' }); }))
    ]);
  }

  function gambarTamu(nama, urut) {
    aturKepala('tamu', nama);
    aturTab(null);
    aturKaki('tamu');
    if (nama === 'masuk') { gambarMasuk(); return; }
    if (nama === 'cek-email') { gambarCekEmail(); return; }
    if (S.program && S.kit !== undefined) { gambarDaftar(); return; }
    tungguData(Promise.all([pastikanProgram(), pastikanKit()]), urut, kerangkaDaftar, 'Memuat program affiliate',
      function () { gambarDaftar(); },
      function (er) {
        tampilGalat('Program affiliate gagal dimuat', pesanGalat(er, 'Koneksi ke server putus.') + ' Cek internet lalu coba lagi.', function () { gambar(); });
        selesai('daftar', 'Daftar affiliate · Adverthinking AI');
      });
  }

  function gambarAkun(r, urut) {
    var d = S.data;
    var tab = r.nama === 'cairkan' ? 'dompet' : r.tab;
    if (!tab) {
      tab = tabAdaptif(d);
      if (A.mode === 'asli') gantiHash(hashAkun(tab)); /* tab disimpan di URL: bisa dibagikan & di-refresh */
    }
    S.tab = tab;
    aturKepala('akun');
    aturTab(tab);
    aturKaki('akun');
    if (r.nama === 'cairkan') { gambarCairkan(d); return; }
    if (tab === 'dompet') { gambarDompet(d); return; }
    if (S.kit !== undefined) { gambarSebar(d); return; }
    tungguData(pastikanKit(), urut, kerangkaAkun, 'Memuat kit promosi', function () { gambarSebar(d); }, function () { gambarSebar(d); });
  }

  function gambar() {
    var urut = ++S.urut;
    clearInterval(timerUlang);
    var r = tafsir(bacaHash());
    if (r && r.nama === 'putus') {
      aturKepala('bolo');
      aturTab(null);
      aturKaki('bolo');
      gambarPutus(urut);
      return;
    }
    var akun = !!(r && (r.nama === 'akun' || r.nama === 'cairkan'));
    if (A.mode === 'contoh') {
      if (!akun) { gambarTamu(r ? r.nama : 'daftar', urut); return; }
      if (r.profil) S.profil = r.profil;
      A.setProfil(S.profil);
      S.data = null; /* contoh: selalu baca ulang (langsung) supaya perubahan lokal ikut tampil */
    } else if (!A.punyaSesi()) {
      if (akun) {
        gantiHash('#masuk');
        S.pesanMasuk = { jenis: 'info', teks: 'Masuk dulu buat buka Komisiku. Link masuk dikirim ke email kamu.', ikon: 'kunci' };
        gambarTamu('masuk', urut);
        return;
      }
      gambarTamu(r && TAMU[r.nama] ? r.nama : 'daftar', urut);
      return;
    } else if (!akun) {
      r = { nama: 'akun', tab: null }; /* sudah masuk: rute tamu dialihkan ke tab adaptif */
    }
    if (r.nama !== 'cairkan') S.cairTerkirim = null;
    if (S.data && !dataBasi()) { gambarAkun(r, urut); return; }
    tungguData(A.status(), urut, kerangkaAkun, 'Memuat Komisiku', function (d) {
      simpanData(d);
      gambarAkun(r, urut);
    }, function (er) {
      if (er && er.status === 401) { sesiHabis(); return; }
      aturKepala('akun');
      aturTab(null);
      aturKaki('akun');
      tampilGalat('Komisi gagal dimuat', er && er.status === 0
        ? 'Koneksi ke server putus. Saldo dan riwayatmu aman, tinggal dimuat ulang.'
        : pesanGalat(er, 'Lagi ada gangguan.') + ' Saldo dan riwayatmu aman.', function () { gambar(); });
      selesai('dompet', 'Komisiku · Adverthinking AI');
    });
  }

  /* Klik tautan ke keadaan yang sedang tampil: gambar ulang + balik ke atas (bukan tombol mati) */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (a && A && a.getAttribute('href') === location.hash) {
      e.preventDefault();
      gambar();
    }
  });

  function mulaiAsli() {
    /* Token dari link email/Telegram: diambil ke memori lalu SEGERA dibuang dari URL */
    var u;
    try { u = new URL(location.href); } catch (e) { u = null; }
    var tMasuk = u ? u.searchParams.get('masuk') : null;
    var tPutus = u ? u.searchParams.get('putus') : null;
    var TOKEN_OK = /^[A-Za-z0-9_-]{16,200}$/;
    if (tMasuk !== null || tPutus !== null) {
      u.searchParams.delete('masuk');
      u.searchParams.delete('putus');
      var sisa = u.searchParams.toString();
      try { history.replaceState(null, '', u.pathname + (sisa ? '?' + sisa : '') + (tPutus !== null ? '#putus' : '')); } catch (e) { /* biarkan */ }
    }
    if (tPutus !== null) {
      S.putusToken = TOKEN_OK.test(tPutus) ? tPutus : '';
      gambar();
      return;
    }
    if (tMasuk !== null) {
      aturKepala('tamu', 'masuk');
      aturTab(null);
      aturKaki('tamu');
      tampilMemuat('Membuka Komisiku', kerangkaAkun());
      var gagalMasuk = function (teks) {
        S.pesanMasuk = { jenis: 'galat', teks: teks, ikon: 'seru' };
        pindah('#masuk');
      };
      if (!TOKEN_OK.test(tMasuk)) { gagalMasuk('Link masuk gak lengkap. Minta link baru ya.'); return; }
      A.tukar(tMasuk).then(function () {
        S.data = null;
        gambar();
      }, function (er) {
        var teks = er && er.status === 0 ? 'Gagal nyambung ke server. Buka lagi link di email kamu (berlaku 30 menit).' : (er && er.pesan) || 'Link masuk gak bisa dipakai. Minta link baru ya.';
        /* Masih punya sesi lama di browser ini: tetap di Komisiku (status yang menilai sesinya), galat jadi toast */
        if (A.punyaSesi()) { toast(teks, 'galat'); gambar(); return; }
        gagalMasuk(teks);
      });
      return;
    }
    gambar();
  }

  function mulai() {
    tampilMemuat('Memuat Komisiku');
    if (!window.KomisikuApi) {
      tampilGalat('Halaman belum lengkap', 'File api.js gak kebaca. Muat ulang halaman.', function () { location.reload(); });
      return;
    }
    window.KomisikuApi.siapkan().then(function (api) {
      A = api;
      document.body.classList.toggle('mode-contoh', A.mode === 'contoh');
      window.addEventListener('hashchange', gambar);
      document.addEventListener('visibilitychange', function () {
        var rute = document.body.getAttribute('data-rute');
        if (document.visibilityState === 'visible' && (rute === 'sebar' || rute === 'dompet') && S.data && dataBasi()) gambar();
      });
      if (A.mode === 'asli') mulaiAsli(); else gambar();
    }, function (er) {
      tampilGalat('Data contoh gak kebaca', (er && er.pesan) || 'File contoh.js gak ketemu.', function () { location.reload(); });
    });
  }

  mulai();
})();
