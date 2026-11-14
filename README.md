# GBIWeb

GBIWeb adalah aplikasi pencatatan pertandingan badminton Single/Double dengan dashboard win rate berbasis React + Express + MySQL.

## Menjalankan aplikasi

1. Pastikan Node.js dan MySQL tersedia.
2. Buat database dan tabel:
   ```bash
   mysql -u root -p < server/schema.sql
   ```
3. Salin `server/.env.example` menjadi `server/.env`, lalu isi kredensial MySQL.
4. Instal dependency:
   ```bash
   npm run install:all
   ```
5. Jalankan frontend dan API:
   ```bash
   npm run dev
   ```

Frontend tersedia di `http://localhost:5173`, API di `http://localhost:3000`.
