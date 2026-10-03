/* Supabase 連線設定。
   這裡放的是「公開的 publishable key」，本來就設計成可以出現在網頁裡；
   資料安全由資料庫的 RLS（每人只能讀寫自己的資料）與登入來保護。
   絕對不要把 service_role / secret key 放進任何網頁檔案。 */
const CONFIG = {
  url: 'https://aokogofszjkxwtmqlale.supabase.co',
  key: 'sb_publishable__2nc2_Ux4Jry8Pg2UNhpNg_cK1i1HUD',
};
