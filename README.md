# Taller de Python: guía de instalación

Una plataforma donde las estudiantes entran con correo y contraseña, escriben
proyectos de Python, los guardan y los ejecutan en el navegador. El profesor ve
los proyectos de todas, los ejecuta y les pone nota y comentario.

Python corre dentro del navegador de cada estudiante (con Pyodide), así que
no necesitas un servidor que ejecute código. El trabajo se reparte así:

- **GitHub Pages** publica la página. Cada cambio que entra a la rama `main`
  se publica solo en uno o dos minutos.
- **Firebase** guarda las cuentas, los proyectos, las notas y los archivos de
  datos. Su plan gratuito (Spark) alcanza de sobra para un colegio.

Enlace para las estudiantes: **<https://drofus.github.io/Pagina_Python_estudiantes/>**

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `config.js` | **El único archivo que editas**: Firebase, correos de profesor, escala de notas |
| `firestore.rules` | Reglas de seguridad: quién puede ver y cambiar qué |
| `index.html`, `styles.css`, `app.js`, `backend.js`, `py-worker.js` | La aplicación |
| `vendor/` | El editor de código (CodeMirror) |
| `firebase.json` | Opcional: permite publicar las reglas con la herramienta `firebase` |
| `.nojekyll` | Le dice a GitHub Pages que publique los archivos tal cual |

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
   pega todo el contenido de `firestore.rules` de este repositorio y pulsa
   **Publicar**. Las reglas ya tienen el correo de profesor y el dominio del
   colegio; si cambias alguno, cámbialo también en `config.js`.
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

## Paso 3. Publicar la página con GitHub Pages

1. En GitHub, abre el repositorio y ve a *Settings → Pages*.
2. En *Build and deployment → Source* elige **Deploy from a branch**.
3. En *Branch* elige **main** y la carpeta **/ (root)**. Pulsa **Save**.
4. Espera uno o dos minutos. Arriba de esa misma página aparece el enlace:
   <https://drofus.github.io/Pagina_Python_estudiantes/>
5. En Firebase, ve a *Authentication → Configuración → Dominios autorizados*
   y agrega `drofus.github.io`.

Desde ahí, cada cambio que se aprueba y entra a `main` se publica solo.
**Las reglas de seguridad no se publican con GitHub Pages**: cada vez que
cambie `firestore.rules`, hay que pegarlo otra vez en la consola de Firebase
(paso 1.4).

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
  `firestore.rules`, y pega las reglas otra vez en la consola de Firebase.
- **Aceptar correos de otro dominio**: cambia `allowedDomain` en `config.js`
  y la función `fromSchool()` en `firestore.rules`. Con `allowedDomain: ""`,
  borra también la condición de dominio en las reglas.
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
