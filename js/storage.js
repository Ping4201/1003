/* 資料存取層：Supabase（登入 + 雲端資料庫 + 講義檔案儲存）。
   對外介面維持 list / get / save / remove，畫面程式不需要知道資料存在哪裡。
   所有資料都在 zw_items 表（kind = cases / notes / terms / meta）。 */
const Store = (function () {
  let sb = null;
  let uid = null;

  function client() {
    if (sb) return sb;
    if (typeof supabase === 'undefined') throw new Error('無法載入登入元件，請檢查網路連線後重新整理');
    sb = supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.onAuthStateChange((_e, s) => { uid = s ? s.user.id : null; });
    return sb;
  }
  const uidNow = async () => {
    if (uid) return uid;
    const { data } = await client().auth.getSession();
    uid = data.session ? data.session.user.id : null;
    if (!uid) throw new Error('尚未登入');
    return uid;
  };
  const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const toItem = (r) => ({ ...r.data, id: r.id, updated: r.updated });
  const check = ({ error }) => { if (error) throw new Error(error.message); };

  return {
    uid: uniq,

    /* ---- 登入 ---- */
    async session() {
      const { data } = await client().auth.getSession();
      uid = data.session ? data.session.user.id : null;
      return data.session;
    },
    async signIn(email, password) {
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? '帳號或密碼不正確' : error.message);
    },
    signOut: () => client().auth.signOut(),
    /** 修改密碼：先用舊密碼重新驗證，再更新，避免手機被他人拿到時直接改密碼 */
    async changePassword(current, next) {
      const { data } = await client().auth.getSession();
      const email = data.session && data.session.user.email;
      if (!email) throw new Error('尚未登入');
      const re = await client().auth.signInWithPassword({ email, password: current });
      if (re.error) throw new Error('目前的密碼不正確');
      const up = await client().auth.updateUser({ password: next });
      if (up.error) throw new Error(up.error.message);
    },
    onAuth: (fn) => client().auth.onAuthStateChange((_e, s) => fn(s)),

    /* ---- 資料 ---- */
    async list(kind) {
      const r = await client().from('zw_items').select('id,data,updated').eq('kind', kind).order('updated', { ascending: false });
      check(r);
      return r.data.map(toItem);
    },
    async get(kind, id) {
      const r = await client().from('zw_items').select('id,data,updated').eq('kind', kind).eq('id', id).maybeSingle();
      check(r);
      return r.data ? toItem(r.data) : null;
    },
    async save(kind, item) {
      const user = await uidNow();
      if (!item.id) item.id = uniq();
      item.updated = Date.now();
      const { id, updated, ...rest } = item;
      check(await client().from('zw_items').upsert({ user_id: user, kind, id, data: rest, updated }, { onConflict: 'user_id,kind,id' }));
      return item;
    },
    async remove(kind, id) {
      const user = await uidNow();
      check(await client().from('zw_items').delete().eq('kind', kind).eq('id', id));
    },
    
    /** 匯出文字資料（講義 PDF 檔本身不含） */
    async exportAll() {
      const out = { app: 'ziwei-notes', version: 2, exported: new Date().toISOString() };
      for (const k of ['cases', 'notes', 'terms', 'meta']) out[k] = await this.list(k);
      return out;
    },
    async importAll(data) {
      if (!data || data.app !== 'ziwei-notes') throw new Error('這不是本工具匯出的備份檔');
      let n = 0;
      const user = await uidNow();
      for (const k of ['cases', 'notes', 'terms']) {
        const rows = (data[k] || []).map(({ id, updated, ...rest }) => ({ user_id: user, kind: k, id, data: rest, updated: updated || Date.now() }));
        if (rows.length) {
          check(await client().from('zw_items').upsert(rows, { onConflict: 'user_id,kind,id' }));
          n += rows.length;
        }
      }
      return n;
    },
  };
})();
