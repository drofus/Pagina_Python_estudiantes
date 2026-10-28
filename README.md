# Taller de Python: guía de instalación

Una plataforma donde las estudiantes entran con correo y contraseña, escriben
proyectos de Python, los guardan y los ejecutan en el navegador. El profesor ve
los proyectos de todas, los ejecuta y les pone nota y comentario.

Python corre dentro del navegador de cada estudiante (con Pyodide), así que
no necesitas un servidor que ejecute código. Firebase guarda las cuentas y los
proyectos. Su plan gratuito (Spark) alcanza de sobra para un colegio.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `config.js` | **El único archivo que editas**: Firebase, correos de profesor, escala de notas |
| `firestore.rules` | Reglas de seguridad: quién puede ver y cambiar qué |
| `index.html`, `styles.css`, `app.js`, `backend.js`, `py-worker.js` | La aplicación |
| `vendor/` | El editor de código (CodeMirror) |
| `firebase.json` | Configuración para publicar con Firebase Hosting |

Puedes probarla sin configurar nada: mientras `config.js` no tenga los datos
de Firebase, funciona en **modo demostración** y guarda todo solo en el
navegador donde la abras.

---

## Paso 1. Crear el proyecto en Firebase (unos 10 minutos)

1. Entra a <https://console.firebase.google.com> con una cuenta de Google y
   pulsa **Crear un proyecto**. Ponle un nombre (ej. `taller-python-colegio`).
   Google Analytics no hace falta.
2. **Cuentas con correo y contraseña**: menú *Compilación → Authentication →
   Comenzar → Correo electrónico/contraseña → Habilitar → Guardar*.
3. **Base de datos**: menú *Compilación → Firestore Database → Crear base de
   datos*. Elige una ubicación cercana (ej. `southamerica-east1` o
   `us-east1`) y empieza en **modo de producción**.
4. **Reglas de seguridad**: en Firestore, pestaña *Reglas*. Borra lo que hay,
   pega todo el contenido de `firestore.rules` y cambia
   `profesor@colegio.edu.co` por tu correo (puedes poner varios, separados
   por coma). Pulsa **Publicar**.
5. **Registrar la app web**: en *Configuración del proyecto* (el engranaje) →
   *Tus apps* → icono `</>`. Ponle un nombre. Firebase te muestra un bloque
   `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.

## Paso 2. Editar `config.js`

Abre `config.js` con cualquier editor de texto (Bloc de notas sirve):

```js
firebase: {
  apiKey: "AIza...",                       // copia cada valor del paso 1.5
  authDomain: "taller-python-colegio.firebaseapp.com",
  projectId: "taller-python-colegio",
  storageBucket: "taller-python-colegio.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123",
},
teacherEmails: ["tu.correo@colegio.edu.co"],   // el mismo correo del paso 1.4
allowedDomain: "colegio.edu.co",               // opcional: solo correos del colegio
```

La `apiKey` de Firebase no es secreta: identifica tu proyecto, y lo que
protege los datos son las reglas del paso 1.4.

## Paso 3. Publicar la página

**Opción A: Firebase Hosting (recomendada).** Necesitas Node.js instalado
(<https://nodejs.org>). En una terminal, dentro de esta carpeta:

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

```bash
firebase use --add
```

```bash
firebase deploy
```

`firebase use --add` te deja elegir el proyecto que creaste. Al terminar,
`firebase deploy` te da el enlace, algo como
`https://taller-python-colegio.web.app`. Ese es el que compartes con las
estudiantes. El mismo comando también publica las reglas de seguridad.

**Opción B: sin instalar nada.** Arrastra la carpeta completa a
<https://app.netlify.com/drop>. Luego, en Firebase, ve a *Authentication →
Configuración → Dominios autorizados* y agrega el dominio que te dio Netlify.

## Paso 4. Crear tu cuenta de profesor primero

Entra al enlace, elige **Crear cuenta** y regístrate con el correo que pusiste
en `teacherEmails`. Hazlo antes de compartir el enlace, para que nadie más
pueda registrar ese correo. Al entrar verás la sección **Calificar**.

---

## Cómo se usa

**Estudiantes**

- *Crear cuenta* con nombre, correo y contraseña. *¿Olvidaste tu contraseña?*
  les envía un correo para crear una nueva.
- *+ Nuevo proyecto* abre el editor. El código se guarda solo mientras
  escriben, y también con el botón **Guardar** o con `Ctrl + S`.
- **Ejecutar** (o `Ctrl + Enter`) corre el programa en la consola. Cuando el
  programa usa `input()`, aparece un campo para responder.
- **Detener** corta un programa que no termina, como un `while True` olvidado.
- En el panel ven la **nota** y tu comentario de cada proyecto. Pueden borrar
  un proyecto mientras no tenga nota.

**Librerías y archivos de datos**

- Se pueden usar `math`, `numpy`, `pandas`, `matplotlib` y `seaborn` con un
  `import` normal. La primera vez que un programa las usa, la plataforma las
  instala sola (unos segundos). Después quedan listas mientras la página
  esté abierta, y el navegador guarda la descarga para la próxima vez.
- Los gráficos aparecen como imagen en la consola, con `plt.show()` o al final
  del programa.
- Debajo del editor está **Archivos de datos**. Se sube un archivo con *Subir
  archivo* o arrastrándolo ahí: `.csv`, `.xlsx`, `.xls`, `.tsv`, `.json` o
  `.txt`, de hasta 5 MB y hasta 10 archivos por proyecto. El programa los abre
  por su nombre, por ejemplo `pd.read_csv("notas.csv")`.
- **Usar en el código** escribe la línea para leer el archivo. En los CSV que
  vienen de Excel en español, detecta el separador `;`, la coma decimal y la
  codificación, y los agrega a esa línea.
- Si el programa crea un archivo (por ejemplo `df.to_csv("resultado.csv")`),
  la consola ofrece **Guardar en Archivos de datos** o **Descargar**.

**Profesor**

- **Calificar** muestra todos los proyectos del curso, con buscador y filtro
  *Sin calificar / Calificados*.
- Al abrir uno puedes ejecutarlo y probar cambios (que no se guardan en el
  proyecto de la estudiante), y poner **nota** (de 1.0 a 5.0, se acepta coma o
  punto) y un **comentario**. La estudiante lo ve al instante.

## Ajustes comunes

- **Otra escala de notas**: en `config.js`, `grade: { min: 0, max: 10, pass: 6 }`.
- **Agregar otro profesor**: agrega el correo en `config.js` y en
  `firestore.rules`, y vuelve a publicar (o pega las reglas otra vez en la
  consola de Firebase).
- **Nombre en la pantalla de ingreso**: `schoolName` en `config.js`.

## Qué tener en cuenta

- Python corre en el navegador: la primera ejecución tarda unos segundos
  mientras descarga Python (unos 10 MB, que luego quedan en caché). Funciona
  en Chrome, Edge, Firefox y Safari recientes, también en Chromebooks.
- Toda la biblioteca estándar (`math`, `random`, `datetime`, `statistics`...)
  funciona. `turtle` y `tkinter` no funcionan porque necesitan ventanas.
- pandas, numpy y matplotlib juntas son una descarga grande (unos 55 MB) la
  primera vez en cada computador; después el navegador las guarda. Si la red
  del colegio es lenta, conviene abrir un proyecto con pandas en cada equipo
  antes de la clase. seaborn y openpyxl (para Excel) se descargan de PyPI, así
  que la red del colegio debe permitir `pypi.org` y `files.pythonhosted.org`.
- El profesor puede abrir y descargar los archivos de datos de cada
  estudiante, y ejecutar su programa con esos archivos.
- Con `input()`, el programa se vuelve a ejecutar desde el principio con las
  respuestas ya dadas, en un instante. `random` da los mismos valores en cada
  repetición, pero un programa que use `time.sleep()` antes de un `input()`
  volverá a esperar.
- Cada proyecto es un solo archivo (`main.py`) de hasta 200.000 caracteres.
