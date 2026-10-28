// Capa de datos: cuentas y proyectos.
// Con Firebase configurado usa Authentication + Firestore; si no, guarda todo
// en este navegador (modo demostración) con la misma interfaz.

const FIREBASE_VERSION = "10.12.2";
// Firestore guarda documentos de hasta 1 MB: los archivos se parten en trozos.
const CHUNK = 900 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function createBackend(config) {
  if (config.firebase && config.firebase.apiKey) return firebaseBackend(config);
  return demoBackend();
}

function toMillis(ts) {
  if (!ts) return Date.now();
  if (typeof ts === "number") return ts;
  return ts.toMillis ? ts.toMillis() : Date.now();
}

// ---------- Firebase ----------

async function firebaseBackend(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const { initializeApp } = await import(base + "firebase-app.js");
  const A = await import(base + "firebase-auth.js");
  const F = await import(base + "firebase-firestore.js");

  const app = initializeApp(config.firebase);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const projects = F.collection(db, "projects");
  const filesOf = (pid) => F.collection(db, "projects", pid, "files");
  const chunkRef = (pid, fid, i) => F.doc(db, "projects", pid, "files", fid, "chunks", String(i));

  async function removeFile(pid, meta) {
    const batch = F.writeBatch(db);
    for (let i = 0; i < meta.chunks; i++) batch.delete(chunkRef(pid, meta.id, i));
    batch.delete(F.doc(db, "projects", pid, "files", meta.id));
    await batch.commit();
  }

  const fromDoc = (d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      updatedAt: toMillis(data.updatedAt),
      createdAt: toMillis(data.createdAt),
      gradedAt: data.gradedAt ? toMillis(data.gradedAt) : null,
    };
  };

  async function profileOf(u) {
    let name = u.displayName || "";
    try {
      const snap = await F.getDoc(F.doc(db, "users", u.uid));
      if (snap.exists() && snap.data().name) name = snap.data().name;
    } catch (e) {
      // Si falla la lectura del perfil se usa el nombre de la cuenta.
    }
    return { uid: u.uid, email: (u.email || "").toLowerCase(), name: name || u.email.split("@")[0] };
  }

  return {
    mode: "firebase",

    onAuth(cb) {
      return A.onAuthStateChanged(auth, async (u) => cb(u ? await profileOf(u) : null));
    },

    async signIn(email, password) {
      await A.signInWithEmailAndPassword(auth, email, password);
    },

    async signUp(name, email, password) {
      const cred = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.updateProfile(cred.user, { displayName: name });
      await F.setDoc(F.doc(db, "users", cred.user.uid), {
        name,
        email: cred.user.email.toLowerCase(),
        createdAt: F.serverTimestamp(),
      });
      return { uid: cred.user.uid, email: cred.user.email.toLowerCase(), name };
    },

    async resetPassword(email) {
      await A.sendPasswordResetEmail(auth, email);
    },

    async signOut() {
      await A.signOut(auth);
    },

    watchProjects(filter, cb, onError) {
      const q = filter.ownerId ? F.query(projects, F.where("ownerId", "==", filter.ownerId)) : projects;
      return F.onSnapshot(q, (snap) => cb(snap.docs.map(fromDoc)), onError);
    },

    watchProject(id, cb, onError) {
      return F.onSnapshot(
        F.doc(db, "projects", id),
        (d) => cb(d.exists() ? fromDoc(d) : null),
        onError
      );
    },

    async createProject(user, title, code) {
      const ref = await F.addDoc(projects, {
        ownerId: user.uid,
        ownerName: user.name,
        ownerEmail: user.email,
        title,
        code,
        grade: null,
        feedback: "",
        createdAt: F.serverTimestamp(),
        updatedAt: F.serverTimestamp(),
      });
      return ref.id;
    },

    async saveProject(id, { title, code }) {
      await F.updateDoc(F.doc(db, "projects", id), { title, code, updatedAt: F.serverTimestamp() });
    },

    async gradeProject(id, { grade, feedback }) {
      await F.updateDoc(F.doc(db, "projects", id), { grade, feedback, gradedAt: F.serverTimestamp() });
    },

    async deleteProject(id) {
      const snap = await F.getDocs(filesOf(id));
      for (const d of snap.docs) await removeFile(id, { id: d.id, ...d.data() });
      await F.deleteDoc(F.doc(db, "projects", id));
    },

    watchFiles(pid, cb, onError) {
      return F.onSnapshot(
        filesOf(pid),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data(), uploadedAt: toMillis(d.data().uploadedAt) }))),
        onError
      );
    },

    async uploadFile(pid, { name, type, bytes }) {
      const ref = F.doc(filesOf(pid));
      const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
      const batch = F.writeBatch(db);
      for (let i = 0; i < chunks; i++) {
        batch.set(chunkRef(pid, ref.id, i), { data: F.Bytes.fromUint8Array(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)) });
      }
      batch.set(ref, { name, type, size: bytes.length, chunks, uploadedAt: F.serverTimestamp() });
      await batch.commit();
      return ref.id;
    },

    async readFile(pid, meta) {
      const parts = await Promise.all(
        Array.from({ length: meta.chunks }, (_, i) => F.getDoc(chunkRef(pid, meta.id, i)))
      );
      const arrays = parts.map((d) => d.data().data.toUint8Array());
      const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
      let at = 0;
      for (const a of arrays) {
        out.set(a, at);
        at += a.length;
      }
      return out;
    },

    deleteFile: removeFile,
  };
}

// ---------- Modo demostración (solo este navegador) ----------

function demoBackend() {
  const memory = {};
  const store = {
    get(key, fallback) {
      if (key in memory) return memory[key];
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return key in memory ? memory[key] : fallback;
      }
    },
    set(key, value) {
      memory[key] = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        // Sin almacenamiento: los datos duran mientras la página esté abierta.
      }
    },
  };

  const K_USERS = "pp_demo_users";
  const K_PROJECTS = "pp_demo_projects";
  const K_SESSION = "pp_demo_session";
  const K_FILES = "pp_demo_files";
  const authListeners = new Set();
  const projectListeners = new Set();

  const users = () => store.get(K_USERS, {});
  const allProjects = () => store.get(K_PROJECTS, {});
  const fail = (code) => {
    const e = new Error(code);
    e.code = code;
    throw e;
  };
  const publicUser = (u) => (u ? { uid: u.uid, email: u.email, name: u.name } : null);
  const currentUser = () => {
    const uid = store.get(K_SESSION, null);
    return publicUser(Object.values(users()).find((u) => u.uid === uid));
  };
  const emitAuth = () => authListeners.forEach((cb) => cb(currentUser()));
  const emitProjects = () => projectListeners.forEach((fn) => fn());
  const delay = () => new Promise((r) => setTimeout(r, 150));
  const fileListeners = new Set();
  const allFiles = () => store.get(K_FILES, {});
  const emitFiles = () => fileListeners.forEach((fn) => fn());
  const toB64 = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  function writeProject(id, patch) {
    const all = allProjects();
    if (!all[id]) fail("not-found");
    all[id] = { ...all[id], ...patch };
    store.set(K_PROJECTS, all);
    emitProjects();
  }

  return {
    mode: "demo",

    onAuth(cb) {
      authListeners.add(cb);
      setTimeout(() => cb(currentUser()), 0);
      return () => authListeners.delete(cb);
    },

    async signIn(email, password) {
      await delay();
      const u = users()[email.toLowerCase()];
      if (!u || u.password !== password) fail("auth/invalid-credential");
      store.set(K_SESSION, u.uid);
      emitAuth();
    },

    async signUp(name, email, password) {
      await delay();
      email = email.toLowerCase();
      const all = users();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("auth/invalid-email");
      if (all[email]) fail("auth/email-already-in-use");
      if (password.length < 6) fail("auth/weak-password");
      const u = { uid: "u" + Date.now().toString(36), email, name, password };
      all[email] = u;
      store.set(K_USERS, all);
      store.set(K_SESSION, u.uid);
      emitAuth();
      return publicUser(u);
    },

    async resetPassword() {
      fail("demo/no-email");
    },

    async signOut() {
      store.set(K_SESSION, null);
      emitAuth();
    },

    watchProjects(filter, cb) {
      const fn = () => {
        const list = Object.values(allProjects());
        cb(filter.ownerId ? list.filter((p) => p.ownerId === filter.ownerId) : list);
      };
      projectListeners.add(fn);
      setTimeout(fn, 0);
      return () => projectListeners.delete(fn);
    },

    watchProject(id, cb) {
      const fn = () => cb(allProjects()[id] || null);
      projectListeners.add(fn);
      setTimeout(fn, 0);
      return () => projectListeners.delete(fn);
    },

    async createProject(user, title, code) {
      await delay();
      const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const all = allProjects();
      const now = Date.now();
      all[id] = {
        id,
        ownerId: user.uid,
        ownerName: user.name,
        ownerEmail: user.email,
        title,
        code,
        grade: null,
        feedback: "",
        createdAt: now,
        updatedAt: now,
      };
      store.set(K_PROJECTS, all);
      emitProjects();
      return id;
    },

    async saveProject(id, { title, code }) {
      await delay();
      writeProject(id, { title, code, updatedAt: Date.now() });
    },

    async gradeProject(id, { grade, feedback }) {
      await delay();
      writeProject(id, { grade, feedback, gradedAt: Date.now() });
    },

    async deleteProject(id) {
      await delay();
      const all = allProjects();
      delete all[id];
      store.set(K_PROJECTS, all);
      const files = allFiles();
      delete files[id];
      store.set(K_FILES, files);
      emitProjects();
    },

    watchFiles(pid, cb) {
      const fn = () => cb(Object.values(allFiles()[pid] || {}).map(({ data, ...meta }) => meta));
      fileListeners.add(fn);
      setTimeout(fn, 0);
      return () => fileListeners.delete(fn);
    },

    async uploadFile(pid, { name, type, bytes }) {
      await delay();
      const files = allFiles();
      const id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      files[pid] = files[pid] || {};
      files[pid][id] = { id, name, type, size: bytes.length, chunks: 1, uploadedAt: Date.now(), data: toB64(bytes) };
      store.set(K_FILES, files);
      emitFiles();
      return id;
    },

    async readFile(pid, meta) {
      const f = (allFiles()[pid] || {})[meta.id];
      if (!f) fail("not-found");
      return fromB64(f.data);
    },

    async deleteFile(pid, meta) {
      await delay();
      const files = allFiles();
      if (files[pid]) delete files[pid][meta.id];
      store.set(K_FILES, files);
      emitFiles();
    },
  };
}
