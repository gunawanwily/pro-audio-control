PRO AUDIO CONTROL PWA v22.0

Perbaikan Drag & Drop:
- Overlay DROP AUDIO HERE / DROP AUDIO FILES selalu dibersihkan segera setelah drop.
- Tidak ada indikator drop yang tertinggal karena dragleave pada elemen anak.
- Cleanup global ditambahkan untuk drop, dragend, blur, dan visibilitychange.

# PRO AUDIO CONTROL — PWA v16

Versi ini menggunakan satu codebase untuk PC/laptop, tablet, dan handphone.

## Jalankan di web/PWA

Upload isi folder ini ke hosting HTTPS. GitHub Pages dapat digunakan langsung.

Setelah halaman dibuka:
- Android/Chrome: gunakan Install app / Add to Home screen.
- iPhone/iPad: Safari → Share → Add to Home Screen.
- Windows/macOS Chrome/Edge: gunakan ikon Install di address bar atau menu browser.

## Catatan audio

Materi audio yang dipilih melalui ADD MUSIC adalah file lokal perangkat. File tersebut tidak dikirim ke server. Browser meminta izin melalui interaksi pengguna sebelum playback audio.

PWA menyimpan shell aplikasi untuk penggunaan offline setelah aplikasi pernah dibuka. Playlist/audio lokal tetap mengikuti penyimpanan browser dan dapat perlu dipilih kembali setelah data browser dihapus.

## Fitur

12 audio pads, ADD MUSIC per pad, edit nama, volume per pad, master volume bawah, fade in/out, auto fade antar pad, countdown timecode, grafik bar/visualizer per pad, music player dengan playlist scroll, dan fade out dan stop khusus music player.


## Versi PC Windows

Folder yang sama juga mempertahankan file Electron. Jalankan `INSTALL-PRO-AUDIO-CONTROL.bat` pada PC Windows bila ingin membuat installer `.exe`.


## v11 additions
- CLEAR ALL khusus Music Player untuk mengosongkan playlist dan materi music yang tersimpan lokal.
- STOP ALL menghentikan semua PAD dan Music Player sekaligus, serta mengembalikan posisi playback ke awal.


VERSI 13.0: Music Player kini memiliki slider seek dan tombol STOP khusus yang dapat digeser langsung untuk berpindah ke detik/menit tertentu. Slider sinkron dengan timecode, progress, dan playback serta ramah touchscreen.


## v12 additions
- Tombol STOP khusus pada Music Player menghentikan playback dan mengembalikan posisi lagu ke 00:00 tanpa menghapus playlist.
- Tombol STOP tetap berbeda dari CLEAR ALL: STOP hanya menghentikan playback, sedangkan CLEAR ALL menghapus seluruh playlist.


## v21.0 — Manual Playlist Ordering
- Music Player playlist supports drag-and-drop reordering using the ☷ handle.
- Works with mouse, touch and pointer input.
- Manual order is persisted in IndexedDB and restored on next launch.
- Dragging automatically switches Playlist Mode to Default (manual order).


Fitur v19.0: tombol × untuk menghapus lagu secara individual dari Music Player; indikator status PAD aktif di kanan bawah diperbesar agar lebih mudah dibaca.


## v19.0 — Tampilan
- Visualizer Music Player diperkecil agar area playlist dan kontrol lebih luas.
- Pengaturan (⚙) menyediakan 2 tampilan: **Broadcast Blue** dan **Studio Violet**.
- Pilihan tampilan disimpan otomatis di perangkat dan dipulihkan saat aplikasi dibuka kembali.


Versi 16.0 menambahkan 5 skin tampilan console, visualizer per-PAD yang lebih responsif terhadap irama, dan visualizer Music Player yang lebih ringkas.


## v19.0 – PAD action emphasis
Setiap tombol fungsi PAD kini memiliki indikator visual yang lebih jelas saat digunakan: PLAY menyala/pulse selama aktif, STOP/CUE memberi highlight sesaat, LOOP tetap aktif dengan indikator gradasi/glow tanpa label ON, dan F.IN/F.OUT menonjol selama proses fade.


## v19.0
Perbaikan auto fade antar seluruh PAD saat berpindah cue, reset PAD sebelumnya ke 00:00 setelah fade selesai, dan indikator LOOP aktif dengan gradasi/glow pada setiap PAD.


### v21.0
- Drag & drop file audio langsung ke setiap PAD. Jika beberapa file dijatuhkan pada satu PAD, file dimuat berurutan mulai dari PAD tersebut.
- Drag & drop beberapa file langsung ke area Audio Pads untuk mengisi PAD yang tersedia.
- Drag & drop beberapa file ke Music Player untuk menambah playlist.
- Area drop memiliki indikator visual saat file sedang ditarik.
- Responsive layout diperkuat untuk desktop, tablet, dan handphone dengan kontrol yang lebih ramah touch.
