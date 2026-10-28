// Ejecuta Python (Pyodide) fuera de la página, para que un bucle infinito
// no congele la pantalla y el botón "Detener" pueda cortarlo.

const WORKDIR = "/home/pyodide/proyecto";

let pyodide = null;
let runPy = null;
let micropipSpecs = {};
let buffer = "";
let lastFlush = 0;
const installed = new Set();

const PRELUDE = `
import builtins, sys, os, random, traceback, shutil, warnings

# pandas 2.2 avisa que en el futuro pedirá pyarrow; no aplica aquí.
warnings.filterwarnings("ignore", message=r"(?s).*Pyarrow", category=DeprecationWarning)

os.environ["MPLBACKEND"] = "Agg"

class _NeedInput(BaseException):
    pass

_state = {"inputs": [], "i": 0, "need": False}

def _input(prompt=""):
    if prompt:
        sys.stdout.write(str(prompt))
    i = _state["i"]
    if i < len(_state["inputs"]):
        value = _state["inputs"][i]
        _state["i"] = i + 1
        sys.stdout.write(value + "\\n")
        return value
    _state["need"] = True
    raise _NeedInput()

def _show(*args, **kwargs):
    import io, base64, js
    import matplotlib.pyplot as plt
    for num in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(num).savefig(buf, format="png", dpi=110, bbox_inches="tight")
        sys.stdout.flush()
        js.pyImage(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")

def _setup_matplotlib():
    os.environ["MPLBACKEND"] = "Agg"
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.show = _show
    plt.close("all")

def _reset_dir(path):
    os.makedirs(path, exist_ok=True)
    os.chdir("/")
    for name in os.listdir(path):
        full = os.path.join(path, name)
        if os.path.isdir(full):
            shutil.rmtree(full, ignore_errors=True)
        else:
            os.remove(full)

def _run(code, inputs, seed, workdir):
    _state.update(inputs=list(inputs), i=0, need=False)
    random.seed(seed)
    builtins.input = _input
    os.chdir(workdir)
    if "matplotlib.pyplot" in sys.modules:
        sys.modules["matplotlib.pyplot"].close("all")
    ns = {"__name__": "__main__", "__builtins__": builtins}
    status = "ok"
    try:
        exec(compile(code, "main.py", "exec"), ns)
    except _NeedInput:
        pass
    except SystemExit:
        pass
    except BaseException as e:
        if not _state["need"]:
            tb = e.__traceback__.tb_next if e.__traceback__ else None
            sys.stderr.write("".join(traceback.format_exception(type(e), e, tb)))
            status = "error"
    sys.stdout.flush()
    sys.stderr.flush()
    if "matplotlib.pyplot" in sys.modules:
        try:
            _show()
        except Exception as e:
            sys.stderr.write("No se pudo dibujar el gráfico: %s\\n" % e)
    return "input" if _state["need"] else status
`;

function flush(force) {
  const now = performance.now();
  if (buffer && (force || now - lastFlush > 40 || buffer.length > 4000)) {
    self.postMessage({ type: "out", text: buffer });
    buffer = "";
    lastFlush = now;
  }
}

function makeWriter(stream) {
  const decoder = new TextDecoder();
  return {
    write(bytes) {
      const text = decoder.decode(bytes, { stream: true });
      if (stream === "err") {
        flush(true);
        self.postMessage({ type: "err", text });
      } else {
        buffer += text;
        flush(false);
      }
      return bytes.length;
    },
  };
}

self.pyImage = (b64) => {
  flush(true);
  self.postMessage({ type: "img", data: b64 });
};

const status = (text) => self.postMessage({ type: "status", text });

// Instala solo lo que el código usa, la primera vez que lo usa.
async function ensurePackages(code, files) {
  let imports = [];
  try {
    imports = pyodide.pyimport("pyodide.code").find_imports(code).toJs();
  } catch (e) {
    // Si el código tiene un error de sintaxis, Python lo mostrará al ejecutar.
  }
  const uses = new Set(imports);
  const excel = /read_excel|to_excel|ExcelFile|ExcelWriter/.test(code) || uses.has("openpyxl");
  if (uses.has("seaborn") || excel) uses.add("pandas");
  if (uses.has("seaborn")) uses.add("matplotlib");

  const fromPyodide = ["numpy", "pandas", "matplotlib"].filter((p) => uses.has(p) && !installed.has(p));
  if (excel && files.some((f) => /\.xls$/i.test(f.name)) && !installed.has("xlrd")) fromPyodide.push("xlrd");
  if (fromPyodide.length) {
    status(`Instalando ${fromPyodide.join(", ")}… (solo la primera vez)`);
    const failed = [];
    await pyodide.loadPackage(fromPyodide, { errorCallback: () => {} });
    for (const p of fromPyodide) {
      if (pyodide.loadedPackages[p]) installed.add(p);
      else failed.push(p);
    }
    if (failed.length) throw new Error(`no se pudo descargar ${failed.join(", ")}`);
  }
  await pyodide.loadPackagesFromImports(code);

  const fromPypi = [];
  if (uses.has("seaborn") && !installed.has("seaborn")) fromPypi.push("seaborn");
  if (excel && !installed.has("openpyxl")) fromPypi.push("openpyxl");
  if (fromPypi.length) {
    status(`Instalando ${fromPypi.join(", ")}… (solo la primera vez)`);
    if (!installed.has("micropip")) {
      await pyodide.loadPackage("micropip", { errorCallback: () => {} });
      if (!pyodide.loadedPackages.micropip) throw new Error("no se pudo descargar micropip");
      installed.add("micropip");
    }
    const micropip = pyodide.pyimport("micropip");
    for (const name of fromPypi) {
      await micropip.install(pyodide.toPy(micropipSpecs[name] || [name]));
      installed.add(name);
    }
  }

  if ((uses.has("matplotlib") || uses.has("seaborn")) && !installed.has("mpl-setup")) {
    status("Preparando gráficos… (solo la primera vez)");
    pyodide.globals.get("_setup_matplotlib")();
    installed.add("mpl-setup");
  }
}

function writeFiles(files) {
  pyodide.globals.get("_reset_dir")(WORKDIR);
  const uploaded = new Map();
  for (const f of files) {
    pyodide.FS.writeFile(WORKDIR + "/" + f.name, f.bytes);
    uploaded.set(f.name, f.bytes);
  }
  return uploaded;
}

function sameBytes(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Archivos que el programa creó o cambió (ej. df.to_csv("resultado.csv")).
function createdFiles(uploaded) {
  const out = [];
  for (const name of pyodide.FS.readdir(WORKDIR)) {
    if (name === "." || name === "..") continue;
    const path = WORKDIR + "/" + name;
    if (!pyodide.FS.isFile(pyodide.FS.stat(path).mode)) continue;
    const bytes = pyodide.FS.readFile(path);
    if (bytes.length > 5 * 1024 * 1024) continue;
    if (!sameBytes(uploaded.get(name), bytes)) out.push({ name, bytes });
  }
  return out;
}

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      micropipSpecs = msg.micropip || {};
      importScripts(msg.url + "pyodide.js");
      pyodide = await loadPyodide({ indexURL: msg.url });
      pyodide.setStdout(makeWriter("out"));
      pyodide.setStderr(makeWriter("err"));
      pyodide.runPython(PRELUDE);
      runPy = pyodide.globals.get("_run");
      self.postMessage({ type: "ready" });
    } else if (msg.type === "run") {
      const files = msg.files || [];
      try {
        await ensurePackages(msg.code, files);
      } catch (e) {
        const detail = String(e.message || e).trim().split("\n").pop();
        self.postMessage({ type: "err", text: "No se pudo instalar una librería (" + detail + ").\nRevisa la conexión a internet y vuelve a ejecutar.\n" });
      }
      const uploaded = writeFiles(files);
      status("Ejecutando…");
      const result = runPy(msg.code, pyodide.toPy(msg.inputs), msg.seed, WORKDIR);
      flush(true);
      let created = [];
      if (result !== "input") {
        try {
          created = createdFiles(uploaded);
        } catch (e) {
          created = [];
        }
      }
      self.postMessage({ type: "done", status: result, created });
    }
  } catch (e) {
    flush(true);
    self.postMessage({ type: "fatal", text: String(e && e.message ? e.message : e) });
  }
};
