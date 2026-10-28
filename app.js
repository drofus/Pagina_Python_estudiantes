import { CONFIG } from "./config.js";
import { createBackend, MAX_FILE_BYTES } from "./backend.js";

const $ = (id) => document.getElementById(id);
const G = CONFIG.grade;
const TEACHERS = CONFIG.teacherEmails.map((e) => e.trim().toLowerCase());

const state = {
  backend: null,
  user: null,
  isTeacher: false,
  page: null,
  signUp: false,
  projects: [],
  selectedId: null,
  confirmDeleteId: null,
  unsubProjects: null,
  allProjects: [],
  unsubAll: null,
  editor: null,
};

// ---------- Utilidades ----------

const AUTH_ERRORS = {
  "auth/invalid-credential": "El correo o la contraseña no coinciden.",
  "auth/wrong-password": "El correo o la contraseña no coinciden.",
  "auth/user-not-found": "El correo o la contraseña no coinciden.",
  "auth/invalid-email": "Escribe un correo válido, por ejemplo nombre@colegio.edu.co.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Usa la pestaña Ingresar.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  "auth/network-request-failed": "No hay conexión a internet. Revisa la red e intenta de nuevo.",
  "auth/missing-email": "Escribe tu correo primero.",
  "permission-denied": "No tienes permiso para hacer esto.",
  "demo/no-email": "En el modo demostración no se envían correos.",
};
const errorText = (e) => AUTH_ERRORS[e && e.code] || "Algo salió mal: " + (e && e.message ? e.message : e);

let toastTimer;
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

const fmtGrade = (g) => (g == null ? "" : Number(g).toFixed(1));
const gradeClass = (g) => (g == null ? "" : g >= G.pass ? "pass" : "fail");

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

function starterCode(title) {
  return `# ${title}\n\nnombre = input("¿Cómo te llamas? ")\nprint("¡Hola,", nombre + "!")\n\nfor i in range(1, 4):\n    print("Línea", i)\n`;
}

// ---------- Ingreso ----------

function setSignUp(on) {
  state.signUp = on;
  $("tab-in").setAttribute("aria-selected", String(!on));
  $("tab-up").setAttribute("aria-selected", String(on));
  $("field-name").hidden = !on;
  $("btn-submit").textContent = on ? "Crear cuenta" : "Ingresar";
  $("btn-forgot").hidden = on;
  $("login-title").textContent = on ? "Crea tu cuenta" : "Ingresa a tu taller";
  $("in-pass").autocomplete = on ? "new-password" : "current-password";
  $("login-msg").textContent = "";
}

async function submitLogin(ev) {
  ev.preventDefault();
  const msg = $("login-msg");
  msg.className = "form-msg";
  const name = $("in-name").value.trim();
  const email = $("in-email").value.trim().toLowerCase();
  const pass = $("in-pass").value;

  if (state.signUp && name.length < 3) return (msg.textContent = "Escribe tu nombre completo.");
  if (!email) return (msg.textContent = "Escribe tu correo.");
  if (!pass) return (msg.textContent = "Escribe tu contraseña.");
  if (state.signUp && CONFIG.allowedDomain && !email.endsWith("@" + CONFIG.allowedDomain.toLowerCase())) {
    return (msg.textContent = `Usa tu correo del colegio (@${CONFIG.allowedDomain}).`);
  }

  const btn = $("btn-submit");
  btn.disabled = true;
  msg.textContent = "";
  try {
    if (state.signUp) {
      const user = await state.backend.signUp(name, email, pass);
      enterApp(user);
    } else {
      await state.backend.signIn(email, pass);
    }
  } catch (e) {
    msg.textContent = errorText(e);
  } finally {
    btn.disabled = false;
  }
}

async function forgotPassword() {
  const msg = $("login-msg");
  const email = $("in-email").value.trim();
  if (!email) {
    msg.className = "form-msg";
    msg.textContent = "Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?».";
    return;
  }
  try {
    await state.backend.resetPassword(email);
    msg.className = "form-msg ok";
    msg.textContent = "Te enviamos un correo para crear una contraseña nueva.";
  } catch (e) {
    msg.className = "form-msg";
    msg.textContent = errorText(e);
  }
}

// ---------- Sesión ----------

function enterApp(user) {
  if (state.user && state.user.uid === user.uid) {
    if (user.name) state.user.name = user.name;
    return;
  }
  state.user = user;
  state.isTeacher = TEACHERS.includes(user.email);
  $("boot").hidden = true;
  $("view-login").hidden = true;
  $("view-app").hidden = false;
  $("nav-students").hidden = !state.isTeacher;
  $("in-pass").value = "";

  state.unsubProjects = state.backend.watchProjects(
    { ownerId: user.uid },
    (list) => {
      state.projects = list.sort((a, b) => b.updatedAt - a.updatedAt);
      if (state.page === "projects") renderProjects();
    },
    (e) => toast(errorText(e))
  );
  if (state.isTeacher) {
    state.unsubAll = state.backend.watchProjects(
      {},
      (list) => {
        state.allProjects = list;
        if (state.page === "students") renderStudents();
      },
      (e) => toast(errorText(e))
    );
  }
  show(state.isTeacher ? "students" : "projects");
}

function leaveApp() {
  closeEditor();
  state.unsubProjects && state.unsubProjects();
  state.unsubAll && state.unsubAll();
  Object.assign(state, { user: null, isTeacher: false, projects: [], allProjects: [], selectedId: null, page: null });
  $("boot").hidden = true;
  $("view-app").hidden = true;
  $("view-login").hidden = false;
  setSignUp(false);
}

// ---------- Navegación ----------

const PAGES = ["projects", "students", "account", "editor"];

function show(page) {
  if (state.page === "editor" && page !== "editor") closeEditor();
  state.page = page;
  for (const p of PAGES) $("page-" + p).hidden = p !== page;
  document.querySelectorAll(".rail-btn").forEach((b) => {
    const current = b.dataset.nav === page || (page === "editor" && b.dataset.nav === (state.isTeacher && state.editor && !state.editor.own ? "students" : "projects"));
    b.toggleAttribute("aria-current", false);
    if (current) b.setAttribute("aria-current", "page");
  });
  if (page === "projects") renderProjects();
  if (page === "students") renderStudents();
  if (page === "account") renderAccount();
  $("view-app").querySelector(".main").scrollTop = 0;
}

async function onNav(target) {
  if (target === "logout") {
    await flushSave();
    await state.backend.signOut();
    leaveApp();
    return;
  }
  if (target === "new") {
    show("projects");
    openNewForm();
    return;
  }
  show(target);
}

// ---------- Mis proyectos ----------

function openNewForm() {
  $("form-new").hidden = false;
  $("in-new-title").value = "";
  $("in-new-title").focus();
}

async function createProject(ev) {
  ev.preventDefault();
  const title = $("in-new-title").value.trim() || "Proyecto sin nombre";
  $("btn-create").disabled = true;
  try {
    const id = await state.backend.createProject(state.user, title, starterCode(title));
    $("form-new").hidden = true;
    openEditor(id);
  } catch (e) {
    toast(errorText(e));
  } finally {
    $("btn-create").disabled = false;
  }
}

function renderProjects() {
  $("hello").textContent = `Hola, ${firstName(state.user.name)}`;
  const list = $("project-list");
  list.replaceChildren();

  if (!state.projects.length) {
    list.append(
      el("li", { class: "empty" },
        el("strong", {}, "Todavía no tienes proyectos"),
        "Crea el primero con «+ Nuevo proyecto». Se guarda solo mientras escribes."
      )
    );
    $("project-card").hidden = true;
    return;
  }

  if (!state.projects.some((p) => p.id === state.selectedId)) state.selectedId = state.projects[0].id;

  for (const p of state.projects) {
    list.append(
      el("li", {},
        el("button", {
          type: "button",
          class: "proj",
          "aria-pressed": String(p.id === state.selectedId),
          onclick: () => {
            if (state.selectedId === p.id) return openEditor(p.id);
            state.selectedId = p.id;
            state.confirmDeleteId = null;
            renderProjects();
          },
          ondblclick: () => openEditor(p.id),
        },
          el("span", { class: "proj-title" }, p.title, el("span", { class: "proj-sub" }, "Editado " + timeAgo(p.updatedAt))),
          el("span", { class: "grade-chip " + gradeClass(p.grade) }, p.grade == null ? "—" : fmtGrade(p.grade))
        )
      )
    );
  }
  renderCard(state.projects.find((p) => p.id === state.selectedId));
}

function renderCard(p) {
  const card = $("project-card");
  card.hidden = false;
  card.replaceChildren(el("h2", {}, p.title), el("p", { class: "grade-label" }, "Nota"));

  if (p.grade == null) {
    card.append(el("p", { class: "grade-big none" }, "Sin calificar todavía"));
  } else {
    card.append(
      el("p", { class: "grade-big " + gradeClass(p.grade) }, fmtGrade(p.grade)),
      el("p", { class: "grade-scale" }, `de ${G.max.toFixed(1)}`)
    );
  }
  if (p.feedback) card.append(el("p", { class: "grade-note" }, p.feedback));

  if (state.confirmDeleteId === p.id) {
    card.append(
      el("div", { class: "confirm" },
        `¿Borrar «${p.title}»? No se puede recuperar.`,
        el("div", {},
          el("button", { type: "button", class: "btn small danger", onclick: () => deleteProject(p.id) }, "Sí, borrar"),
          el("button", { type: "button", class: "btn small ghost", onclick: () => { state.confirmDeleteId = null; renderProjects(); } }, "Cancelar")
        )
      )
    );
  } else {
    const actions = el("div", { class: "card-actions" },
      el("button", { type: "button", class: "btn primary", onclick: () => openEditor(p.id) }, "Abrir")
    );
    if (p.grade == null) {
      actions.append(el("button", { type: "button", class: "btn danger", onclick: () => { state.confirmDeleteId = p.id; renderProjects(); } }, "Borrar"));
    }
    card.append(actions);
  }
}

async function deleteProject(id) {
  try {
    await state.backend.deleteProject(id);
    state.confirmDeleteId = null;
    toast("Proyecto borrado");
  } catch (e) {
    toast(errorText(e));
  }
}

// ---------- Vista del profesor ----------

function renderStudents() {
  const q = $("in-search").value.trim().toLowerCase();
  const status = $("in-status").value;
  const all = state.allProjects.filter((p) => !TEACHERS.includes((p.ownerEmail || "").toLowerCase()));
  const rows = all
    .filter((p) => status === "all" || (status === "pending" ? p.grade == null : p.grade != null))
    .filter((p) => !q || [p.ownerName, p.ownerEmail, p.title].some((s) => (s || "").toLowerCase().includes(q)))
    .sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || "", "es") || b.updatedAt - a.updatedAt);

  const students = new Set(all.map((p) => p.ownerId)).size;
  const pending = all.filter((p) => p.grade == null).length;
  $("students-summary").textContent = `${students} estudiantes · ${all.length} proyectos · ${pending} sin calificar`;

  const body = $("students-body");
  body.replaceChildren();
  if (!rows.length) {
    body.append(el("tr", {}, el("td", { colspan: "4", class: "empty-row" },
      all.length ? "Ningún proyecto coincide con la búsqueda." : "Cuando las estudiantes creen proyectos, aparecerán aquí.")));
    return;
  }
  for (const p of rows) {
    body.append(
      el("tr", { tabindex: "0", onclick: () => openEditor(p.id), onkeydown: (e) => e.key === "Enter" && openEditor(p.id) },
        el("td", { class: "who" }, p.ownerName || "Sin nombre", el("small", {}, p.ownerEmail)),
        el("td", {}, p.title),
        el("td", {}, timeAgo(p.updatedAt)),
        el("td", { class: "num" }, el("span", { class: "grade-chip " + gradeClass(p.grade) }, p.grade == null ? "—" : fmtGrade(p.grade)))
      )
    );
  }
}

// ---------- Cuenta ----------

function renderAccount() {
  $("account-name").textContent = state.user.name;
  $("account-email").textContent = state.user.email;
  $("account-role").textContent = state.isTeacher ? "Profesor" : "Estudiante";
  $("account-msg").textContent = "";
}

async function resetFromAccount() {
  const msg = $("account-msg");
  try {
    await state.backend.resetPassword(state.user.email);
    msg.className = "form-msg ok";
    msg.textContent = `Enviamos el correo a ${state.user.email}.`;
  } catch (e) {
    msg.className = "form-msg";
    msg.textContent = errorText(e);
  }
}

// ---------- Python ----------

class PythonRunner {
  constructor(url) {
    this.url = new URL(url, location.href).href;
    this.worker = null;
    this.ready = null;
    this.handlers = null;
  }

  ensure(onState) {
    if (this.ready) return this.ready;
    onState("Cargando Python… la primera vez tarda unos segundos");
    this.worker = new Worker("py-worker.js");
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") resolve();
        else if (m.type === "fatal" && !this.handlers) reject(new Error(m.text));
        else if (this.handlers) this.handlers(m);
      };
      this.worker.onerror = (e) => reject(new Error(e.message || "No se pudo iniciar Python."));
    });
    const micropip = {};
    for (const [name, specs] of Object.entries(CONFIG.micropip || {})) {
      micropip[name] = specs.map((s) => (s.endsWith(".whl") ? new URL(s, location.href).href : s));
    }
    this.worker.postMessage({ type: "init", url: this.url, micropip });
    this.ready.then(() => onState("Python listo"), (e) => { onState("Python no cargó"); this.reset(); throw e; });
    return this.ready;
  }

  async run(code, inputs, seed, files, onMessage, onState) {
    await this.ensure(onState);
    return new Promise((resolve) => {
      this.handlers = (m) => {
        if (m.type === "out" || m.type === "err" || m.type === "img") onMessage(m);
        else if (m.type === "status") onState(m.text);
        else if (m.type === "done" || m.type === "fatal") {
          this.handlers = null;
          if (m.type === "fatal") onMessage({ type: "err", text: m.text + "\n" });
          resolve(m.type === "done" ? { status: m.status, created: m.created || [] } : { status: "error", created: [] });
        }
      };
      this.resolveStop = () => resolve({ status: "stopped", created: [] });
      this.worker.postMessage({ type: "run", code, inputs, seed, files });
    });
  }

  stop() {
    this.handlers = null;
    this.reset();
    if (this.resolveStop) this.resolveStop();
  }

  reset() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
  }
}

const runner = new PythonRunner(CONFIG.pyodideUrl);
const MAX_OUTPUT = 100000;

const consoleState = { running: false, inputs: [], seed: 0, code: "", chars: 0 };

function setPyState(text) {
  $("py-state").textContent = text;
}

function consoleWrite(text, cls) {
  const out = $("console-out");
  if (consoleState.chars > MAX_OUTPUT) return;
  consoleState.chars += text.length;
  if (consoleState.chars > MAX_OUTPUT) {
    text = text.slice(0, Math.max(0, text.length - (consoleState.chars - MAX_OUTPUT)));
    out.append(text, el("span", { class: "sys" }, "\n[La salida es muy larga y se cortó aquí.]\n"));
  } else if (cls) {
    out.append(el("span", { class: cls }, text));
  } else {
    const last = out.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) last.appendData(text);
    else out.append(text);
  }
  out.scrollTop = out.scrollHeight;
}

function consoleImage(b64) {
  const out = $("console-out");
  out.append(el("img", { src: "data:image/png;base64," + b64, alt: "Gráfico generado por el programa" }));
  out.scrollTop = out.scrollHeight;
}

function consoleCreatedFile(file) {
  const ed = state.editor;
  const row = el("div", { class: "console-file" },
    el("span", {}, "Tu programa creó ", el("code", {}, file.name), ` (${fmtSize(file.bytes.length)})`)
  );
  if (ed && ed.own) {
    const save = el("button", { type: "button", class: "btn small" }, "Guardar en Archivos de datos");
    save.addEventListener("click", async () => {
      save.disabled = true;
      const ok = await storeFile(file.name, file.bytes);
      save.textContent = ok ? "Guardado" : "Guardar en Archivos de datos";
      if (!ok) save.disabled = false;
    });
    row.append(save);
  }
  row.append(el("button", { type: "button", class: "btn small", onclick: () => downloadBytes(file.name, file.bytes) }, "Descargar"));
  $("console-out").append(row);
}

function clearConsole() {
  $("console-out").replaceChildren();
  consoleState.chars = 0;
}

async function runCode(fresh) {
  if (!state.editor) return;
  if (consoleState.running) return;
  if (fresh) {
    consoleState.inputs = [];
    consoleState.seed = Math.floor(Math.random() * 1e9);
    consoleState.code = state.editor.cm.getValue();
  }
  consoleState.running = true;
  $("console-in").hidden = true;
  $("btn-run").disabled = true;
  $("btn-stop").disabled = false;
  clearConsole();
  setPyState(runner.ready ? "Ejecutando…" : "Cargando Python…");
  const started = performance.now();
  const ed = state.editor;

  let files = [];
  try {
    if (ed.files.some((f) => !ed.fileCache.has(f.id))) setPyState("Cargando archivos de datos…");
    files = await Promise.all(ed.files.map(async (f) => ({ name: f.name, bytes: await fileBytes(f) })));
  } catch (e) {
    consoleWrite("No se pudieron cargar los archivos de datos: " + errorText(e) + "\n", "err");
  }

  const { status, created } = await runner.run(
    consoleState.code,
    consoleState.inputs,
    consoleState.seed,
    files,
    (m) => (m.type === "img" ? consoleImage(m.data) : consoleWrite(m.text, m.type === "err" ? "err" : null)),
    setPyState
  ).catch((e) => {
    consoleWrite("No se pudo cargar Python: " + e.message + "\nRevisa la conexión a internet y vuelve a ejecutar.\n", "err");
    return { status: "error", created: [] };
  });

  consoleState.running = false;
  $("btn-run").disabled = false;
  $("btn-stop").disabled = true;
  if (state.editor !== ed) return;
  created.forEach(consoleCreatedFile);

  if (status === "input") {
    $("console-in").hidden = false;
    $("console-input").value = "";
    $("console-input").focus();
    setPyState("Esperando tu respuesta");
  } else if (status === "stopped") {
    consoleWrite("\n[Programa detenido]\n", "sys");
    setPyState("Detenido");
  } else {
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setPyState(status === "error" ? "Terminó con un error" : `Terminó en ${secs} s`);
  }
}

function submitInput(ev) {
  ev.preventDefault();
  if (consoleState.running) return;
  consoleState.inputs.push($("console-input").value);
  runCode(false);
}

function stopCode() {
  if (consoleState.running) runner.stop();
  else {
    $("console-in").hidden = true;
    setPyState("Detenido");
  }
}

// ---------- Editor ----------

function openEditor(id) {
  closeEditor();
  show("editor");
  const ed = {
    id, project: null, own: false, dirty: false, saving: false, timer: null, unsub: null, cm: null, savedAt: null,
    files: [], fileCache: new Map(), unsubFiles: null, confirmFileId: null,
  };
  state.editor = ed;
  clearConsole();
  $("console-in").hidden = true;
  setPyState(runner.ready ? "Python listo" : "");
  $("ed-title").value = "Cargando…";
  $("ed-status").textContent = "";
  $("ed-owner").textContent = "";
  $("ed-grade").textContent = "";
  $("ed-feedback").hidden = true;
  $("grade-bar").hidden = true;

  const host = $("code-host");
  host.replaceChildren();
  ed.cm = CodeMirror(host, {
    value: "",
    mode: "python",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    lineWrapping: false,
    extraKeys: {
      Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ", "end")),
      "Shift-Tab": (cm) => cm.indentSelection("subtract"),
      "Ctrl-Enter": () => runCode(true),
      "Cmd-Enter": () => runCode(true),
      "Ctrl-S": () => saveNow(),
      "Cmd-S": () => saveNow(),
    },
  });
  ed.cm.on("change", (cm, change) => change.origin !== "setValue" && markDirty());

  ed.unsub = state.backend.watchProject(
    id,
    (p) => {
      if (state.editor !== ed) return;
      if (!p) {
        toast("Este proyecto ya no existe");
        show(state.isTeacher ? "students" : "projects");
        return;
      }
      const first = !ed.project;
      ed.project = p;
      if (first) {
        ed.own = p.ownerId === state.user.uid;
        ed.cm.setValue(p.code || "");
        ed.cm.clearHistory();
        $("ed-title").value = p.title;
        $("ed-title").readOnly = !ed.own;
        $("btn-save").hidden = !ed.own;
        $("ed-owner").textContent = ed.own ? "" : `De ${p.ownerName} · ${p.ownerEmail}`;
        ed.savedAt = p.updatedAt;
        if (state.isTeacher && !ed.own) {
          $("grade-bar").hidden = false;
          $("in-grade").value = p.grade == null ? "" : fmtGrade(p.grade);
          $("in-feedback").value = p.feedback || "";
          $("grade-msg").textContent = "";
          show("editor");
        }
        setTimeout(() => ed.cm.refresh(), 0);
        if (ed.own) ed.cm.focus();
        renderFiles();
      }
      renderEditorMeta();
    },
    (e) => toast(errorText(e))
  );

  $("files-msg").textContent = "";
  renderFiles();
  ed.unsubFiles = state.backend.watchFiles(
    id,
    (list) => {
      if (state.editor !== ed) return;
      ed.files = list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      renderFiles();
    },
    (e) => toast(errorText(e))
  );

  runner.ensure(setPyState).catch(() => {});
}

function renderEditorMeta() {
  const ed = state.editor;
  if (!ed || !ed.project) return;
  const p = ed.project;
  const chip = $("ed-grade");
  chip.className = "grade-chip " + gradeClass(p.grade);
  chip.textContent = p.grade == null ? "" : `Nota ${fmtGrade(p.grade)}`;

  const fb = $("ed-feedback");
  fb.hidden = !(ed.own && p.feedback);
  fb.textContent = p.feedback ? `Comentario del profesor: ${p.feedback}` : "";

  const status = $("ed-status");
  status.className = "";
  if (!ed.own) status.textContent = `Editado ${timeAgo(p.updatedAt)} · tus cambios aquí son de prueba y no se guardan`;
  else if (ed.saving) status.textContent = "Guardando…";
  else if (ed.dirty) { status.textContent = "Cambios sin guardar"; status.className = "unsaved"; }
  else status.textContent = "Guardado " + timeAgo(ed.savedAt || p.updatedAt);
}

function markDirty() {
  const ed = state.editor;
  if (!ed || !ed.own) return;
  ed.dirty = true;
  renderEditorMeta();
  clearTimeout(ed.timer);
  ed.timer = setTimeout(saveNow, 1500);
}

async function saveNow() {
  const ed = state.editor;
  if (!ed || !ed.own || !ed.project) return;
  clearTimeout(ed.timer);
  if (ed.saving) {
    ed.timer = setTimeout(saveNow, 500);
    return;
  }
  ed.saving = true;
  ed.dirty = false;
  renderEditorMeta();
  const title = $("ed-title").value.trim() || "Proyecto sin nombre";
  try {
    await state.backend.saveProject(ed.id, { title, code: ed.cm.getValue() });
    ed.savedAt = Date.now();
  } catch (e) {
    ed.dirty = true;
    toast("No se pudo guardar. " + errorText(e));
  } finally {
    ed.saving = false;
    renderEditorMeta();
  }
}

async function flushSave() {
  const ed = state.editor;
  if (ed && ed.own && ed.dirty) await saveNow();
}

function closeEditor() {
  const ed = state.editor;
  if (!ed) return;
  if (ed.own && ed.dirty) saveNow();
  clearTimeout(ed.timer);
  ed.unsub && ed.unsub();
  ed.unsubFiles && ed.unsubFiles();
  if (consoleState.running) runner.stop();
  state.editor = null;
}

async function submitGrade(ev) {
  ev.preventDefault();
  const ed = state.editor;
  const msg = $("grade-msg");
  msg.className = "form-msg";
  const raw = $("in-grade").value.trim().replace(",", ".");
  const grade = raw === "" ? null : Math.round(Number(raw) * 10) / 10;
  if (grade != null && (!Number.isFinite(grade) || grade < G.min || grade > G.max)) {
    msg.textContent = `La nota debe estar entre ${G.min.toFixed(1)} y ${G.max.toFixed(1)}. Déjala vacía para quitarla.`;
    return;
  }
  $("btn-grade").disabled = true;
  try {
    await state.backend.gradeProject(ed.id, { grade, feedback: $("in-feedback").value.trim() });
    msg.className = "form-msg ok";
    msg.textContent = grade == null ? "Nota borrada." : `Nota ${fmtGrade(grade)} guardada. La estudiante ya la puede ver.`;
  } catch (e) {
    msg.textContent = errorText(e);
  } finally {
    $("btn-grade").disabled = false;
  }
}

// ---------- Archivos de datos ----------

const FILE_TYPES = ["csv", "tsv", "txt", "json", "xlsx", "xls"];
const MAX_FILES = 10;
const extOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");

function fmtSize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

function downloadBytes(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function fileBytes(meta) {
  const ed = state.editor;
  if (!ed.fileCache.has(meta.id)) ed.fileCache.set(meta.id, await state.backend.readFile(ed.id, meta));
  return ed.fileCache.get(meta.id);
}

function setFilesOpen(open) {
  $("files-body").hidden = !open;
  $("files-toggle").setAttribute("aria-expanded", String(open));
  $("files-pane").classList.toggle("open", open);
  try {
    localStorage.setItem("pp_files_open", open ? "1" : "0");
  } catch (e) {
    // Preferencia solo de este navegador.
  }
  if (state.editor) setTimeout(() => state.editor.cm.refresh(), 0);
}

function renderFiles() {
  const ed = state.editor;
  if (!ed) return;
  const canEdit = ed.project ? ed.own : false;
  $("upload-label").hidden = !canEdit;
  $("files-count").textContent = ed.files.length ? String(ed.files.length) : "";
  const list = $("file-list");
  list.replaceChildren();

  if (!ed.files.length) {
    list.append(el("li", {},
      el("p", { class: "file-empty" },
        canEdit
          ? "Arrastra aquí un archivo .csv o .xlsx, o usa «Subir archivo». Después léelo con "
          : "Este proyecto no tiene archivos de datos.",
        canEdit ? el("code", {}, 'pd.read_csv("archivo.csv")') : null
      )
    ));
    return;
  }

  for (const f of ed.files) {
    const ext = extOf(f.name);
    const actions = el("span", { class: "file-actions" });
    if (ed.confirmFileId === f.id) {
      actions.append(
        el("button", { type: "button", class: "btn small danger", onclick: () => removeFile(f) }, "Sí, borrar"),
        el("button", { type: "button", class: "btn small ghost", onclick: () => { ed.confirmFileId = null; renderFiles(); } }, "No")
      );
    } else {
      actions.append(
        el("button", { type: "button", class: "btn small ghost", title: "Escribe en el código la línea para leer este archivo", onclick: () => insertSnippet(f) }, "Usar en el código"),
        el("button", { type: "button", class: "btn small ghost", onclick: async () => downloadBytes(f.name, await fileBytes(f)) }, "Descargar")
      );
      if (canEdit) {
        actions.append(el("button", { type: "button", class: "btn small danger", "aria-label": `Borrar ${f.name}`, onclick: () => { ed.confirmFileId = f.id; renderFiles(); } }, "Borrar"));
      }
    }
    list.append(
      el("li", { class: "file-row" },
        el("span", { class: "file-tag " + ext }, ext.toUpperCase() || "ARCH"),
        el("span", { class: "file-name", title: f.name }, f.name, el("small", {}, fmtSize(f.size) + " · " + timeAgo(f.uploadedAt))),
        actions
      )
    );
  }
}

// Mira el CSV para sugerir separador y codificación (Excel en español suele usar ";" y latin-1).
function sniffCsv(bytes) {
  let encoding = null;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    encoding = "latin-1";
    text = new TextDecoder("latin1").decode(bytes.subarray(0, 64 * 1024));
  }
  const first = text.slice(0, 4096).split(/\r?\n/)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of first) if (ch in counts) counts[ch]++;
  const [sep, count] = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
  const second = text.slice(0, 8192).split(/\r?\n/)[1] || "";
  const decimalComma = sep === ";" && count > 0 && /\d,\d/.test(second);
  return { sep: count > 0 ? sep : ",", encoding, decimalComma };
}

async function insertSnippet(f) {
  const ed = state.editor;
  const cm = ed.cm;
  const ext = extOf(f.name);
  const n = JSON.stringify(f.name);
  let line;
  if (ext === "csv" || ext === "tsv") {
    let opts = ext === "tsv" ? ', sep="\\t"' : "";
    try {
      const { sep, encoding, decimalComma } = sniffCsv(await fileBytes(f));
      if (ext === "csv" && sep !== ",") opts += sep === ";" ? ', sep=";"' : ', sep="\\t"';
      if (decimalComma) opts += ', decimal=","';
      if (encoding) opts += `, encoding="${encoding}"`;
    } catch (e) {
      // Sin vista previa del archivo se usa la lectura estándar.
    }
    line = `df = pd.read_csv(${n}${opts})\nprint(df.head())\n`;
  } else if (ext === "xlsx" || ext === "xls") {
    line = `df = pd.read_excel(${n})\nprint(df.head())\n`;
  } else if (ext === "json") {
    line = `df = pd.read_json(${n})\nprint(df.head())\n`;
  } else {
    line = `with open(${n}, encoding="utf-8") as archivo:\n    texto = archivo.read()\nprint(texto)\n`;
  }

  const cur = cm.getCursor();
  const atText = cm.getLine(cur.line).trim() !== "";
  cm.replaceRange(atText ? "\n" + line : line, atText ? { line: cur.line, ch: cm.getLine(cur.line).length } : { line: cur.line, ch: 0 });
  if (line.includes("pd.") && !/^\s*import\s+pandas\s+as\s+pd\b/m.test(cm.getValue())) {
    cm.replaceRange("import pandas as pd\n\n", { line: 0, ch: 0 });
  }
  cm.focus();
  toast(ed.own ? "Línea agregada al código" : "Línea agregada (solo para probar)");
}

async function storeFile(name, bytes) {
  const ed = state.editor;
  const msg = $("files-msg");
  msg.className = "form-msg";
  if (bytes.length > MAX_FILE_BYTES) {
    msg.textContent = `«${name}» pesa ${fmtSize(bytes.length)}. El máximo es ${fmtSize(MAX_FILE_BYTES)}.`;
    return false;
  }
  const previous = ed.files.find((f) => f.name === name);
  if (!previous && ed.files.length >= MAX_FILES) {
    msg.textContent = `Cada proyecto puede tener hasta ${MAX_FILES} archivos. Borra uno para subir otro.`;
    return false;
  }
  try {
    const id = await state.backend.uploadFile(ed.id, { name, type: extOf(name), bytes });
    ed.fileCache.set(id, bytes);
    if (previous) await state.backend.deleteFile(ed.id, previous);
    msg.className = "form-msg ok";
    msg.textContent = previous ? `«${name}» reemplazado.` : `«${name}» subido. Úsalo con «Usar en el código».`;
    return true;
  } catch (e) {
    msg.textContent = `No se pudo subir «${name}». ` + errorText(e);
    return false;
  }
}

async function uploadFiles(fileList) {
  const ed = state.editor;
  if (!ed || !ed.own) return;
  for (const file of fileList) {
    const name = file.name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
    if (!FILE_TYPES.includes(extOf(name))) {
      $("files-msg").className = "form-msg";
      $("files-msg").textContent = `«${file.name}» no es un tipo permitido. Sube archivos .csv, .xlsx, .xls, .tsv, .json o .txt.`;
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      $("files-msg").className = "form-msg";
      $("files-msg").textContent = `«${file.name}» pesa ${fmtSize(file.size)}. El máximo es ${fmtSize(MAX_FILE_BYTES)}.`;
      continue;
    }
    $("files-msg").className = "form-msg ok";
    $("files-msg").textContent = `Subiendo «${name}»…`;
    await storeFile(name, new Uint8Array(await file.arrayBuffer()));
  }
  if (!$("files-body").hidden) return;
  setFilesOpen(true);
}

async function removeFile(f) {
  const ed = state.editor;
  try {
    await state.backend.deleteFile(ed.id, f);
    ed.fileCache.delete(f.id);
    ed.confirmFileId = null;
    $("files-msg").className = "form-msg ok";
    $("files-msg").textContent = `«${f.name}» borrado.`;
  } catch (e) {
    toast(errorText(e));
  }
}

// ---------- Arranque ----------

function wire() {
  $("tab-in").addEventListener("click", () => setSignUp(false));
  $("tab-up").addEventListener("click", () => setSignUp(true));
  $("form-login").addEventListener("submit", submitLogin);
  $("btn-forgot").addEventListener("click", forgotPassword);

  document.querySelectorAll(".rail-btn").forEach((b) => b.addEventListener("click", () => onNav(b.dataset.nav)));
  $("btn-new").addEventListener("click", openNewForm);
  $("form-new").addEventListener("submit", createProject);
  $("btn-cancel-new").addEventListener("click", () => ($("form-new").hidden = true));

  $("in-search").addEventListener("input", renderStudents);
  $("in-status").addEventListener("change", renderStudents);
  $("btn-reset").addEventListener("click", resetFromAccount);

  $("btn-back").addEventListener("click", () => show(state.editor && !state.editor.own ? "students" : "projects"));
  $("btn-save").addEventListener("click", saveNow);
  $("ed-title").addEventListener("input", markDirty);
  $("btn-run").addEventListener("click", () => runCode(true));
  $("btn-stop").addEventListener("click", stopCode);
  $("btn-clear").addEventListener("click", clearConsole);
  $("console-in").addEventListener("submit", submitInput);
  $("grade-bar").addEventListener("submit", submitGrade);

  $("files-toggle").addEventListener("click", () => setFilesOpen($("files-body").hidden));
  $("file-input").addEventListener("change", (e) => {
    uploadFiles([...e.target.files]);
    e.target.value = "";
  });
  const drop = $("ed-left");
  drop.addEventListener("dragover", (e) => {
    if (!state.editor || !state.editor.own || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    $("files-pane").classList.add("dragover");
  });
  drop.addEventListener("dragleave", (e) => {
    if (!drop.contains(e.relatedTarget)) $("files-pane").classList.remove("dragover");
  });
  drop.addEventListener("drop", (e) => {
    $("files-pane").classList.remove("dragover");
    if (!state.editor || !state.editor.own || !e.dataTransfer.files.length) return;
    e.preventDefault();
    uploadFiles([...e.dataTransfer.files]);
  });
  let filesOpen = true;
  try {
    filesOpen = localStorage.getItem("pp_files_open") !== "0";
  } catch (e) {
    filesOpen = true;
  }
  setFilesOpen(filesOpen);
  $("in-grade").placeholder = `${G.min.toFixed(1)} – ${G.max.toFixed(1)}`;

  window.addEventListener("beforeunload", (e) => {
    if (state.editor && state.editor.dirty) {
      saveNow();
      e.preventDefault();
    }
  });
  setInterval(() => {
    if (state.page === "editor") renderEditorMeta();
  }, 30000);
}

async function start() {
  document.title = CONFIG.schoolName;
  $("school-name").textContent = CONFIG.schoolName;
  wire();
  try {
    state.backend = await createBackend(CONFIG);
  } catch (e) {
    $("boot").textContent = "No se pudo conectar con Firebase. Revisa config.js y la conexión a internet.";
    return;
  }
  if (state.backend.mode === "demo") {
    $("demo-note").hidden = false;
    $("demo-teacher").textContent = TEACHERS[0];
  }
  state.backend.onAuth((user) => (user ? enterApp(user) : leaveApp()));
}

start();
