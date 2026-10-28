// Configuración de la plataforma. Es el único archivo que necesitas editar.
// La guía LEEME.md explica de dónde sale cada valor.

export const CONFIG = {
  // Nombre que aparece en la pantalla de ingreso.
  schoolName: "Taller de Python",

  // Pega aquí la configuración de tu proyecto de Firebase
  // (Consola de Firebase → Configuración del proyecto → Tus apps → Web).
  // Mientras apiKey esté vacío, la plataforma funciona en "modo demostración":
  // todo se guarda solo en este navegador.
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },

  // Correos de las cuentas de profesor, en minúsculas.
  // Deben coincidir con la lista que está en firestore.rules.
  teacherEmails: ["profesor@colegio.edu.co"],

  // Si lo llenas (ej. "colegio.edu.co"), solo se pueden crear cuentas con ese dominio.
  allowedDomain: "",

  // Escala de notas.
  grade: { min: 1, max: 5, pass: 3, step: 0.1 },

  // De dónde se descarga Python para el navegador (Pyodide).
  pyodideUrl: "https://cdn.jsdelivr.net/npm/pyodide@0.26.4/",

  // Librerías que no vienen con Pyodide y se instalan desde PyPI la primera vez que se usan.
  micropip: {
    seaborn: ["seaborn"],
    openpyxl: ["openpyxl"], // para que pandas lea y escriba Excel (.xlsx)
  },
};
