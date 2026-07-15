# RFID Pair

Aplikasi lokal tanpa dependency untuk memasangkan daftar nama dengan kode kartu RFID.

## Menjalankan

Cara paling sederhana: buka `index.html` di browser modern (Chrome atau Edge).

Jika browser membatasi fitur clipboard ketika file dibuka langsung, jalankan server lokal dari folder ini, misalnya:

```powershell
python -m http.server 8080
```

Lalu buka `http://localhost:8080`.

## Cara memakai

1. Hubungkan USB RFID reader dan pastikan lampunya menyala.
2. Isi daftar nama, satu nama per baris, lalu pilih **Mulai scan**.
3. Saat nama tampil, tap kartu yang sesuai. Aplikasi mendukung reader yang mengirim `Enter`, `Tab`, atau berhenti sejenak setelah mengetik UID.
4. Setelah selesai, pilih **Edit data** untuk memeriksa tabel dan mengunduh CSV.

Data progres disimpan di `localStorage` browser yang sedang dipakai. Kode RFID diperlakukan sebagai teks supaya nol di depan tidak dihapus oleh aplikasi.

## Catatan reader

Aplikasi ini mengasumsikan reader bekerja sebagai *keyboard-wedge*: saat kartu ditempel, reader seolah-olah mengetik UID. Tes cepatnya adalah membuka Notepad lalu menempelkan kartu. Jika UID muncul, reader kompatibel dengan aplikasi ini.
