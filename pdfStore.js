/* ============================================================
   OCPdfStore — guarda y recupera los PDFs de las cotizaciones.

   La copia principal vive en IndexedDB (base "obracore", object
   store "pdfs", clave = pdfKey, valor = Blob) — es la que "Ver PDF"
   siempre usa. Guardar también en una carpeta del disco (File System
   Access API) es un extra opcional: si el usuario no la eligió, o el
   navegador no soporta la API, simplemente se descarga el archivo.

   Todo el acceso a IndexedDB/File System Access va en try/catch (via
   promesas .catch): si algo falla, la función resuelve a un valor
   "vacío" (null/false) en vez de tronar, para no romper la UI.

   Uso:
     OCPdfStore.guardarPdf(key, blob)          -> Promise<boolean>
     OCPdfStore.getPdf(key)                    -> Promise<Blob|null>
     OCPdfStore.abrirPdf(key)                  -> Promise<boolean>  (abre en pestaña nueva)
     OCPdfStore.soportaCarpetaLocal()          -> boolean
     OCPdfStore.elegirCarpeta()                -> Promise<FileSystemDirectoryHandle|null>
     OCPdfStore.getHandleGuardado()            -> Promise<FileSystemDirectoryHandle|null>
     OCPdfStore.guardarEnDiscoODescargar(blob, nombreArchivo) -> Promise<'carpeta'|'descargado'>
     OCPdfStore.descargar(blob, nombreArchivo) -> void
   ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'obracore';
  var DB_VERSION = 1;
  var STORE_PDFS = 'pdfs';
  var STORE_HANDLES = 'handles';
  var DIR_HANDLE_KEY = 'carpetaCotizaciones';

  var dbPromise = null;

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE_PDFS)) {
            db.createObjectStore(STORE_PDFS);
          }
          if (!db.objectStoreNames.contains(STORE_HANDLES)) {
            db.createObjectStore(STORE_HANDLES);
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) {
        reject(e);
      }
    });
    return dbPromise;
  }

  function guardarPdf(key, blob) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_PDFS, 'readwrite');
        tx.objectStore(STORE_PDFS).put(blob, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function (e) {
      console.error('[ObraCore] No se pudo guardar el PDF en IndexedDB:', e);
      return false;
    });
  }

  function getPdf(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_PDFS, 'readonly');
        var req = tx.objectStore(STORE_PDFS).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function (e) {
      console.error('[ObraCore] No se pudo leer el PDF de IndexedDB:', e);
      return null;
    });
  }

  function abrirPdf(key) {
    // window.open() debe llamarse SÍNCRONAMENTE dentro del gesto del
    // usuario (el clic). Si se espera a que resuelva getPdf() (una
    // lectura async de IndexedDB) y se llama window.open() dentro del
    // .then(), el navegador ya no lo asocia con el gesto y abre una
    // pestaña en blanco (o la bloquea). Por eso se abre la ventana ya,
    // en blanco, y se navega después, cuando el blob esté listo.
    var ventana = window.open('', '_blank');
    return getPdf(key).then(function (blob) {
      if (!blob) {
        if (ventana) { ventana.close(); }
        return false;
      }
      if (!ventana) {
        // El navegador bloqueó incluso la ventana en blanco; no hay
        // dónde navegar (raro, pero posible con bloqueadores estrictos).
        return false;
      }
      var url = URL.createObjectURL(blob);
      ventana.location.href = url;
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      return true;
    });
  }

  /* ---- Carpeta local (File System Access API) — opcional ---- */

  function soportaCarpetaLocal() {
    return 'showDirectoryPicker' in window;
  }

  function guardarHandle(handle) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_HANDLES, 'readwrite');
        tx.objectStore(STORE_HANDLES).put(handle, DIR_HANDLE_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }

  function getHandleGuardado() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_HANDLES, 'readonly');
        var req = tx.objectStore(STORE_HANDLES).get(DIR_HANDLE_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  // Debe llamarse desde un manejador de clic real (requisito del
  // navegador para mostrar el selector de carpetas).
  function elegirCarpeta() {
    if (!soportaCarpetaLocal()) {
      return Promise.resolve(null);
    }
    return window.showDirectoryPicker({ id: 'obracore-cotizaciones', mode: 'readwrite' })
      .then(function (handle) {
        return guardarHandle(handle).then(function () { return handle; });
      })
      .catch(function (e) {
        // El usuario cerró/canceló el selector; no es un error real.
        console.warn('[ObraCore] No se eligió carpeta de cotizaciones:', e);
        return null;
      });
  }

  function verificarPermiso(handle) {
    return handle.queryPermission({ mode: 'readwrite' }).then(function (estado) {
      if (estado === 'granted') {
        return true;
      }
      // requestPermission también necesita venir de un gesto del
      // usuario; aquí se llama porque abrirPdf/emitir corren dentro
      // del clic en "Emitir cotización".
      return handle.requestPermission({ mode: 'readwrite' }).then(function (r) {
        return r === 'granted';
      });
    }).catch(function () { return false; });
  }

  function nombreArchivoSeguro(nombre) {
    return ('' + nombre).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim();
  }

  function descargar(blob, nombreArchivo) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoSeguro(nombreArchivo);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // Intenta escribir en la carpeta elegida; si no hay carpeta, no hay
  // soporte, o falla el permiso/la escritura, descarga en su lugar.
  function guardarEnDiscoODescargar(blob, nombreArchivo) {
    if (!soportaCarpetaLocal()) {
      descargar(blob, nombreArchivo);
      return Promise.resolve('descargado');
    }
    return getHandleGuardado().then(function (handle) {
      if (!handle) {
        descargar(blob, nombreArchivo);
        return 'descargado';
      }
      return verificarPermiso(handle).then(function (ok) {
        if (!ok) {
          descargar(blob, nombreArchivo);
          return 'descargado';
        }
        return handle.getFileHandle(nombreArchivoSeguro(nombreArchivo), { create: true })
          .then(function (fileHandle) { return fileHandle.createWritable(); })
          .then(function (writable) { return writable.write(blob).then(function () { return writable.close(); }); })
          .then(function () { return 'carpeta'; })
          .catch(function (e) {
            console.warn('[ObraCore] Falló guardar en la carpeta elegida, se descarga en su lugar:', e);
            descargar(blob, nombreArchivo);
            return 'descargado';
          });
      });
    });
  }

  global.OCPdfStore = {
    guardarPdf: guardarPdf,
    getPdf: getPdf,
    abrirPdf: abrirPdf,
    soportaCarpetaLocal: soportaCarpetaLocal,
    elegirCarpeta: elegirCarpeta,
    getHandleGuardado: getHandleGuardado,
    guardarEnDiscoODescargar: guardarEnDiscoODescargar,
    descargar: descargar,
    nombreArchivoSeguro: nombreArchivoSeguro
  };
})(window);
