/* ============================================================
   OCPdf — arma el PDF de una cotización con jsPDF + jspdf-autotable
   (lib/jspdf.umd.min.js v4.2.1, lib/jspdf.plugin.autotable.min.js
   v5.0.8 — cargarlos ANTES que este archivo).

   El PDF es claro y apto para imprimir (fondo blanco); el tema
   oscuro de la app NO se copia aquí. El cian y el dorado solo se
   usan como acento (línea de encabezado y folio), a modo de guiño
   a la marca.

   Se genera en el idioma activo al momento de llamar (usa
   OC_I18N.t() directamente, así que basta con que i18n.js ya haya
   cargado su diccionario — siempre es el caso en la práctica: se
   llama desde clics del usuario o desde el arranque de la semilla,
   nunca en el primer instante de carga de la página).

   Uso:
     OCPdf.generarPdfCotizacion(cotizacion, solicitud, config, folioSustituido)
       -> Blob (PDF)
     OCPdf.generarPdfLevantamiento(levantamiento, proyecto, config)
       -> Promise<Blob> (asíncrona: trae cada foto de OCPdfStore antes de
          armar el PDF; recorre levantamiento.plantillaSnapshot.secciones
          genéricamente, sin conocer ninguna plantilla en particular)
     OCPdf.numeroALetrasEs(1234.56) -> "MIL DOSCIENTOS TREINTA Y CUATRO PESOS 56/100 M.N."
     OCPdf.asegurarPdfsSemilla() -> Promise<void>  (genera los PDFs que falten de la semilla)
     OCPdf.asegurarLevantamientosSemilla() -> Promise<void> (ídem, para los levantamientos)
   ============================================================ */
(function (global) {
  'use strict';

  var COLOR_CYAN = [123, 245, 255];
  var COLOR_GOLD = [230, 192, 101];
  var COLOR_TEXT = [30, 33, 40];
  var COLOR_MUTED = [110, 118, 128];
  var COLOR_BORDER = [225, 227, 231];

  /* ============================================================
     NÚMERO A LETRAS (español) — para el total en letra del PDF.
     Cubre 0 a 999,999,999.99; suficiente para cualquier cotización
     realista. Los centavos se muestran como dígitos (XX/100), que es
     la convención usual en documentos mexicanos, no en letra.
     ============================================================ */
  var UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  var DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  var CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function menoresDeCien(n) {
    if (n < 20) {
      return UNIDADES[n];
    }
    var d = Math.floor(n / 10);
    var u = n % 10;
    if (d === 2 && u > 0) {
      return 'veinti' + UNIDADES[u];
    }
    if (u === 0) {
      return DECENAS[d];
    }
    return DECENAS[d] + ' y ' + UNIDADES[u];
  }

  function menoresDeMil(n) {
    if (n < 100) {
      return menoresDeCien(n);
    }
    if (n === 100) {
      return 'cien';
    }
    var c = Math.floor(n / 100);
    var resto = n % 100;
    var texto = CENTENAS[c];
    if (resto > 0) {
      texto += ' ' + menoresDeCien(resto);
    }
    return texto;
  }

  function seccionMiles(n) {
    // n entre 1 y 999
    if (n === 1) {
      return 'mil';
    }
    return menoresDeMil(n) + ' mil';
  }

  function numeroALetrasEs(numero) {
    var n = Math.floor(Math.abs(numero));
    if (n === 0) {
      return 'cero';
    }
    var partes = [];

    var millones = Math.floor(n / 1000000);
    var resto1 = n % 1000000;
    if (millones > 0) {
      partes.push(millones === 1 ? 'un millón' : menoresDeMil(millones) + ' millones');
    }

    var miles = Math.floor(resto1 / 1000);
    var resto2 = resto1 % 1000;
    if (miles > 0) {
      partes.push(seccionMiles(miles));
    }

    if (resto2 > 0) {
      partes.push(menoresDeMil(resto2));
    }

    return partes.join(' ').trim();
  }

  function totalEnLetra(valor, moneda) {
    var entero = Math.floor(valor + 1e-9);
    var centavos = Math.round((valor - entero) * 100);
    if (centavos >= 100) { // por si el redondeo empuja a 100
      entero += 1;
      centavos -= 100;
    }
    var nombreMoneda = moneda === 'USD' ? 'DÓLARES' : 'PESOS';
    var sufijo = moneda === 'USD' ? 'USD' : 'M.N.';
    var cents = centavos < 10 ? '0' + centavos : '' + centavos;
    return (numeroALetrasEs(entero) + ' ' + nombreMoneda + ' ' + cents + '/100 ' + sufijo).toUpperCase();
  }

  function formatoMoneda(valor, moneda) {
    var simbolo = moneda === 'USD' ? 'US$' : '$';
    var texto = (valor || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return simbolo + ' ' + texto;
  }

  /* ============================================================
     ARMADO DEL PDF
     ============================================================ */
  function t(key) {
    return (global.OC_I18N && global.OC_I18N.t(key)) || key;
  }

  function lang() {
    return (global.OC_I18N && global.OC_I18N.getLang()) || 'es';
  }

  function agregarPiePagina(doc) {
    var totalPaginas = doc.internal.getNumberOfPages();
    for (var i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      var w = doc.internal.pageSize.getWidth();
      var h = doc.internal.pageSize.getHeight();
      var texto = t('pdf.pagina') + ' ' + i + ' ' + t('pdf.paginaDe') + ' ' + totalPaginas;
      doc.text(texto, w - 15, h - 8, { align: 'right' });
    }
  }

  // Nota: la cotización ya trae su propia copia de cliente/proyecto
  // (se congela al crearla, ver store.js), así que el PDF no necesita
  // la solicitud original — solo cot + config + el folio que sustituye.
  function generarPdfCotizacion(cot, config, folioSustituido) {
    var jsPDFCtor = global.jspdf && global.jspdf.jsPDF;
    if (!jsPDFCtor) {
      throw new Error('jsPDF no está cargado; agrega lib/jspdf.umd.min.js antes de pdf.js.');
    }
    var doc = new jsPDFCtor({ unit: 'mm', format: 'letter' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 15;
    var y = margin;

    // ---- Encabezado: empresa + acento de color + folio ----
    doc.setFillColor(COLOR_CYAN[0], COLOR_CYAN[1], COLOR_CYAN[2]);
    doc.rect(0, 0, pageW, 3, 'F');

    doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(config.nombre || 'ObraCore', margin, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    var infoEmpresa = [
      config.direccion,
      [config.telefono, config.email].filter(Boolean).join('  ·  '),
      config.rfc ? 'RFC: ' + config.rfc : ''
    ].filter(Boolean);
    var yEmpresa = y + 13;
    infoEmpresa.forEach(function (linea) {
      doc.text(linea, margin, yEmpresa);
      yEmpresa += 4.2;
    });

    // Folio + fechas, alineado a la derecha
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(COLOR_GOLD[0] - 40, COLOR_GOLD[1] - 40, COLOR_GOLD[2] - 80);
    doc.text(cot.folio, pageW - margin, y + 8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    var fechaEmisionTxt = cot.fechaEmision || cot.fecha;
    doc.text(t('pdf.vigenciaHasta') + ': ' + sumarDias(fechaEmisionTxt, cot.vigenciaDias), pageW - margin, y + 13, { align: 'right' });
    doc.text(t('cotizacion.campo.fecha') + ': ' + fechaEmisionTxt, pageW - margin, y + 17, { align: 'right' });

    if (cot.version > 1 && folioSustituido) {
      doc.setTextColor(200, 90, 60);
      doc.text(t('pdf.sustituyeA') + ' ' + folioSustituido, pageW - margin, y + 21, { align: 'right' });
    }

    y = Math.max(yEmpresa, y + 24) + 4;
    doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    // ---- Cliente / Proyecto, dos columnas ----
    var colW = (pageW - margin * 2 - 8) / 2;
    var yFilaInicio = y;
    var yCliente = bloqueDatos(doc, margin, yFilaInicio, colW, t('cotizacion.seccion.cliente'), [
      [t('cotizacion.campo.nombreCliente'), cot.cliente.nombre],
      [t('cotizacion.campo.contacto'), cot.cliente.contacto],
      [t('cotizacion.campo.telefono'), cot.cliente.telefono],
      [t('cotizacion.campo.email'), cot.cliente.email],
      [t('cotizacion.campo.rfc'), cot.cliente.rfc],
      [t('cotizacion.campo.direccion'), cot.cliente.direccion]
    ]);
    var yProyecto = bloqueDatos(doc, margin + colW + 8, yFilaInicio, colW, t('cotizacion.seccion.proyecto'), [
      [t('cotizacion.campo.nombreProyecto'), cot.proyecto.nombre],
      [t('cotizacion.campo.ubicacion'), cot.proyecto.ubicacion],
      [t('cotizacion.campo.tipoProyecto'), cot.proyecto.tipo],
      [t('cotizacion.campo.moneda'), cot.moneda]
    ]);
    y = Math.max(yCliente, yProyecto) + 4;

    // ---- Tabla de partidas ----
    var filas = (cot.partidas || []).map(function (p) {
      var importeLinea = (p.cantidad || 0) * (p.precioUnitario || 0);
      var importeConDesc = importeLinea * (1 - (p.descuentoPct || 0) / 100);
      return [
        String(p.cantidad),
        p.unidad || '',
        p.descripcion || '',
        formatoMoneda(p.precioUnitario, cot.moneda),
        (p.descuentoPct || 0) + '%',
        formatoMoneda(importeConDesc, cot.moneda)
      ];
    });

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [[
        t('cotizacion.campo.cantidad'), t('cotizacion.campo.unidad'), t('cotizacion.campo.descripcion'),
        t('cotizacion.campo.precioUnitario'), t('cotizacion.campo.descuentoPct'), t('cotizacion.campo.importe')
      ]],
      body: filas,
      styles: { fontSize: 9, textColor: COLOR_TEXT, lineColor: COLOR_BORDER, lineWidth: 0.1 },
      headStyles: { fillColor: [30, 33, 40], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'right', cellWidth: 15 },
        1: { cellWidth: 20 },
        3: { halign: 'right', cellWidth: 26 },
        4: { halign: 'right', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 28 }
      },
      theme: 'grid'
    });

    y = doc.lastAutoTable.finalY + 6;

    // ---- Totales, alineados a la derecha ----
    var totales = cot.totales || { subtotal: 0, descuento: 0, iva: 0, total: 0 };
    var totalesFilas = [
      [t('cotizacion.campo.subtotal'), formatoMoneda(totales.subtotal, cot.moneda)],
      [t('cotizacion.campo.descuento'), formatoMoneda(totales.descuento, cot.moneda)],
      [t('cotizacion.campo.iva') + ' (' + cot.ivaPct + '%)', formatoMoneda(totales.iva, cot.moneda)],
      [t('cotizacion.campo.total'), formatoMoneda(totales.total, cot.moneda)]
    ];
    var totalesW = 70;
    var totalesX = pageW - margin - totalesW;
    totalesFilas.forEach(function (fila, i) {
      var esTotal = i === totalesFilas.length - 1;
      doc.setFont('helvetica', esTotal ? 'bold' : 'normal');
      doc.setFontSize(esTotal ? 11 : 9.5);
      doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
      doc.text(fila[0], totalesX, y);
      doc.text(fila[1], pageW - margin, y, { align: 'right' });
      y += esTotal ? 7 : 5.5;
    });

    if (lang() === 'es') {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      var letraTexto = doc.splitTextToSize(totalEnLetra(totales.total, cot.moneda), pageW - margin * 2);
      doc.text(letraTexto, margin, y);
      y += letraTexto.length * 4 + 4;
    } else {
      y += 4;
    }

    // ---- Condiciones ----
    var cond = cot.condiciones || {};
    var condFilas = [
      [t('cotizacion.campo.formaPago'), cond.formaPago],
      [t('cotizacion.campo.tiempoEntrega'), cond.tiempoEntrega],
      [t('cotizacion.campo.garantia'), cond.garantia],
      [t('cotizacion.campo.notas'), cond.notas],
      [t('cotizacion.campo.exclusiones'), cond.exclusiones]
    ].filter(function (f) { return f[1]; });

    if (condFilas.length) {
      if (y > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage();
        y = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
      doc.text(t('cotizacion.seccion.condiciones'), margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      condFilas.forEach(function (f) {
        if (y > doc.internal.pageSize.getHeight() - 25) {
          doc.addPage();
          y = margin;
        }
        doc.setFont('helvetica', 'bold');
        doc.text(f[0] + ':', margin, y);
        doc.setFont('helvetica', 'normal');
        var texto = doc.splitTextToSize(String(f[1]), pageW - margin * 2 - 32);
        doc.text(texto, margin + 32, y);
        y += Math.max(5, texto.length * 4.2);
      });
    }

    // ---- Elaboró ----
    if (cot.elaboro) {
      y += 6;
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = margin;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(t('cotizacion.campo.elaboro') + ': ' + cot.elaboro, margin, y);
    }

    agregarPiePagina(doc);

    return doc.output('blob');
  }

  function bloqueDatos(doc, x, y, w, titulo, filas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
    doc.text(titulo, x, y);
    var yy = y + 5;
    doc.setFontSize(9);
    filas.forEach(function (f) {
      if (!f[1]) {
        return;
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(f[0] + ':', x, yy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
      var texto = doc.splitTextToSize(String(f[1]), w - 22);
      doc.text(texto, x + 22, yy);
      yy += Math.max(4.6, texto.length * 4.2);
    });
    return yy;
  }

  function sumarDias(fechaISO, dias) {
    if (!fechaISO) {
      return '';
    }
    var partes = fechaISO.split('-').map(Number);
    var d = new Date(partes[0], partes[1] - 1, partes[2]);
    d.setDate(d.getDate() + (dias || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ============================================================
     PDF "REPORTE DE LEVANTAMIENTO" — a diferencia de
     generarPdfCotizacion, esta función es ASÍNCRONA (-> Promise<Blob>)
     porque necesita traer cada foto de OCPdfStore.getPdf(key) antes de
     poder llamar doc.addImage. Recorre lev.plantillaSnapshot.secciones
     de forma genérica (sin switch por giro): cualquier plantilla nueva
     que declares en plantillas.js se imprime sola, sin tocar este
     archivo.
     ============================================================ */
  function etiquetaCampo(campo, idioma) {
    return (campo.etiqueta && (campo.etiqueta[idioma] || campo.etiqueta.es)) || campo.id;
  }

  function etiquetaOpcion(opciones, id, idioma) {
    var encontrada = null;
    (opciones || []).forEach(function (op) { if (op.id === id) { encontrada = op; } });
    return encontrada ? (encontrada.etiqueta[idioma] || encontrada.etiqueta.es) : id;
  }

  function valorLegible(campo, valor, idioma) {
    if (valor === null || valor === undefined || valor === '') {
      return '';
    }
    switch (campo.tipo) {
      case 'siNo': return valor ? t('forms.siNo.si') : t('forms.siNo.no');
      case 'opcion': return etiquetaOpcion(campo.opciones, valor, idioma);
      case 'opcionMultiple': return (valor || []).map(function (id) { return etiquetaOpcion(campo.opciones, id, idioma); }).join(', ');
      case 'coordenadas': return (valor.lat !== null && valor.lat !== undefined && valor.lng !== null && valor.lng !== undefined) ? (valor.lat + ', ' + valor.lng) : '';
      case 'numero': return valor + (campo.unidad ? ' ' + campo.unidad : '');
      default: return String(valor);
    }
  }

  function blobADataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function generarPdfLevantamiento(lev, proyecto, config) {
    var jsPDFCtor = global.jspdf && global.jspdf.jsPDF;
    if (!jsPDFCtor) {
      return Promise.reject(new Error('jsPDF no está cargado; agrega lib/jspdf.umd.min.js antes de pdf.js.'));
    }
    var idioma = lang();
    var plantilla = lev.plantillaSnapshot || { secciones: [] };
    var datos = lev.datos || {};

    var fotosAMostrar = [];
    plantilla.secciones.forEach(function (seccion) {
      (seccion.campos || []).forEach(function (campo) {
        if (campo.tipo === 'fotos') {
          ((datos[seccion.id] || {})[campo.id] || []).forEach(function (foto) { fotosAMostrar.push(foto); });
        }
      });
    });
    fotosAMostrar = fotosAMostrar.slice(0, 6);

    var cargarFotos = (fotosAMostrar.length && global.OCPdfStore)
      ? Promise.all(fotosAMostrar.map(function (foto) {
        return global.OCPdfStore.getPdf(foto.key).then(function (blob) {
          return blob ? blobADataUrl(blob) : null;
        }).catch(function () { return null; });
      }))
      : Promise.resolve([]);

    return cargarFotos.then(function (dataUrls) {
      var doc = new jsPDFCtor({ unit: 'mm', format: 'letter' });
      var pageW = doc.internal.pageSize.getWidth();
      var pageH = doc.internal.pageSize.getHeight();
      var margin = 15;
      var y = margin;

      function saltoSiHaceFalta(minimo) {
        if (y > pageH - minimo) {
          doc.addPage();
          y = margin;
        }
      }

      // ---- Encabezado ----
      doc.setFillColor(COLOR_GOLD[0], COLOR_GOLD[1], COLOR_GOLD[2]);
      doc.rect(0, 0, pageW, 3, 'F');
      doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(config.nombre || 'ObraCore', margin, y + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(proyecto ? (proyecto.nombre || '') : '', margin, y + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(COLOR_CYAN[0] - 60, COLOR_CYAN[1] - 40, COLOR_CYAN[2] - 10);
      doc.text(lev.id, pageW - margin, y + 8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(plantilla.nombre ? (plantilla.nombre[idioma] || plantilla.nombre.es) : '', pageW - margin, y + 14, { align: 'right' });

      y += 20;
      doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
      doc.line(margin, y, pageW - margin, y);
      y += 7;

      // ---- Secciones genéricas ----
      plantilla.secciones.forEach(function (seccion) {
        saltoSiHaceFalta(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
        doc.text(seccion.titulo ? (seccion.titulo[idioma] || seccion.titulo.es) : seccion.id, margin, y);
        y += 6;

        (seccion.campos || []).forEach(function (campo) {
          var valor = (datos[seccion.id] || {})[campo.id];

          if (campo.tipo === 'tabla') {
            var filas = valor || [];
            if (!filas.length) { return; }
            saltoSiHaceFalta(40);
            var hayTotales = campo.columnas.some(function (c) { return c.total; });
            doc.autoTable({
              startY: y,
              margin: { left: margin, right: margin },
              head: [campo.columnas.map(function (c) { return etiquetaCampo(c, idioma) + (c.unidad ? ' (' + c.unidad + ')' : ''); })],
              body: filas.map(function (f) {
                return campo.columnas.map(function (c) {
                  if (c.tipo === 'opcion') { return etiquetaOpcion(c.opciones, f[c.id], idioma); }
                  return (f[c.id] === null || f[c.id] === undefined) ? '' : String(f[c.id]);
                });
              }),
              foot: hayTotales ? [campo.columnas.map(function (c) {
                if (!c.total) { return ''; }
                var valores = filas.map(function (f) { return Number(f[c.id]) || 0; });
                var suma = valores.reduce(function (a, b) { return a + b; }, 0);
                var out = (c.total === 'promedio' && valores.length) ? (suma / valores.length) : suma;
                return (Math.round(out * 100) / 100) + (c.unidad ? ' ' + c.unidad : '');
              })] : undefined,
              styles: { fontSize: 8.5, textColor: COLOR_TEXT, lineColor: COLOR_BORDER, lineWidth: 0.1 },
              headStyles: { fillColor: [30, 33, 40], textColor: 255, fontStyle: 'bold' },
              footStyles: { fillColor: [245, 245, 245], textColor: COLOR_TEXT, fontStyle: 'bold' },
              theme: 'grid'
            });
            y = doc.lastAutoTable.finalY + 5;
            return;
          }

          if (campo.tipo === 'checklist') {
            var items = valor || [];
            if (!items.length) { return; }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            items.forEach(function (it, idx) {
              saltoSiHaceFalta(16);
              var def = campo.items[idx] || {};
              var glifo = it.estado === 'ok' ? '[OK]' : (it.estado === 'no-ok' ? '[X]' : '[N/A]');
              doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
              var linea = glifo + ' ' + etiquetaCampo(def, idioma) + (it.nota ? ' — ' + it.nota : '');
              var texto = doc.splitTextToSize(linea, pageW - margin * 2);
              doc.text(texto, margin, y);
              y += texto.length * 4.4;
            });
            y += 2;
            return;
          }

          if (campo.tipo === 'fotos') {
            return; // se dibujan juntas al final
          }

          var textoValor = valorLegible(campo, valor, idioma);
          if (!textoValor) { return; }
          saltoSiHaceFalta(14);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
          doc.text(etiquetaCampo(campo, idioma) + ':', margin, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
          var texto2 = doc.splitTextToSize(textoValor, pageW - margin * 2 - 45);
          doc.text(texto2, margin + 45, y);
          y += Math.max(5, texto2.length * 4.4);
        });
        y += 3;
      });

      // ---- Fotos (hasta 6, grid de 3 columnas) ----
      var dataUrlsValidas = dataUrls.filter(Boolean);
      if (dataUrlsValidas.length) {
        saltoSiHaceFalta(60);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
        doc.text(t('levantamiento.pdf.fotos'), margin, y);
        y += 6;
        var cols = 3;
        var gap = 4;
        var imgW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
        var imgH = imgW * 0.75;
        dataUrlsValidas.forEach(function (durl, i) {
          var col = i % cols;
          if (col === 0 && i > 0) { y += imgH + gap; }
          saltoSiHaceFalta(imgH + 10);
          var x = margin + col * (imgW + gap);
          try { doc.addImage(durl, 'JPEG', x, y, imgW, imgH); } catch (e) { /* formato no soportado: se omite esa foto */ }
        });
        y += imgH + 6;
      }

      agregarPiePagina(doc);
      return doc.output('blob');
    });
  }

  /* ============================================================
     SEMILLA DE PDFS — la semilla de datos (store.js) crea las
     cotizaciones ya "emitidas" pero sin blob de PDF real (store.js
     no depende de jsPDF). Esta función, llamada una sola vez desde
     OC_MAIN.html, genera y guarda el PDF de cada cotización de la
     semilla que todavía no tenga uno en IndexedDB.
     ============================================================ */
  function asegurarPdfsSemilla() {
    if (!global.OCStore || !global.OCPdfStore) {
      return Promise.resolve();
    }
    var flagKey = global.OCStore.SEED_PDFS_FLAG_KEY;
    try {
      if (localStorage.getItem(flagKey) === '1') {
        return Promise.resolve();
      }
    } catch (e) { /* sin localStorage: se regenera cada vez, no pasa nada grave */ }

    var config = global.OCStore.getConfig();
    var hoy = new Date();
    var pendientes = [];

    for (var y = hoy.getFullYear() - 1; y <= hoy.getFullYear() + 1; y++) {
      for (var mes = 0; mes < 12; mes++) {
        // getCotizacionesPorFecha necesita una fecha exacta; en vez de
        // adivinar fechas, recorremos las solicitudes del mes (ya
        // expuestas) y de ahí las cotizaciones por solicitud.
        var porFecha = global.OCStore.getSolicitudesDelMes(y, mes);
        Object.keys(porFecha).forEach(function (fecha) {
          porFecha[fecha].forEach(function (sol) {
            global.OCStore.getCotizacionesPorSolicitud(sol.id).forEach(function (cot) {
              if (cot.estado !== 'borrador' && cot.pdfKey) {
                pendientes.push(cot);
              }
            });
          });
        });
      }
    }

    return Promise.all(pendientes.map(function (cot) {
      return global.OCPdfStore.getPdf(cot.pdfKey).then(function (existente) {
        if (existente) {
          return null;
        }
        var folioSustituido = null;
        if (cot.basadaEn) {
          var anterior = global.OCStore.getCotizacion(cot.basadaEn);
          if (anterior) {
            folioSustituido = anterior.folio;
          }
        }
        var blob = generarPdfCotizacion(cot, config, folioSustituido);
        return global.OCPdfStore.guardarPdf(cot.pdfKey, blob);
      });
    })).then(function () {
      try { localStorage.setItem(flagKey, '1'); } catch (e) { /* memoria */ }
    }).catch(function (e) {
      console.error('[ObraCore] No se pudieron generar los PDFs de la semilla:', e);
    });
  }

  // Foto de relleno (canvas liso con una etiqueta) para los
  // levantamientos de la semilla, que no tienen archivos reales que
  // comprimir. Mismo tamaño/calidad que una foto real comprimida.
  function fotoRellenoSemilla(texto, color) {
    return new Promise(function (resolve) {
      var canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      var cx = canvas.getContext('2d');
      cx.fillStyle = color || '#1e2430';
      cx.fillRect(0, 0, canvas.width, canvas.height);
      cx.fillStyle = '#7bf5ff';
      cx.font = '22px sans-serif';
      cx.fillText(texto || 'ObraCore', 24, 44);
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.85);
    });
  }

  // Igual que asegurarPdfsSemilla, pero para los levantamientos de la
  // semilla: genera las fotos de relleno que les faltan y su PDF.
  function asegurarLevantamientosSemilla() {
    if (!global.OCStore || !global.OCPdfStore) {
      return Promise.resolve();
    }
    var flagKey = global.OCStore.SEED_LEVANTAMIENTOS_FLAG_KEY;
    try {
      if (localStorage.getItem(flagKey) === '1') {
        return Promise.resolve();
      }
    } catch (e) { /* sin localStorage: se regenera cada vez, no pasa nada grave */ }

    var config = global.OCStore.getConfig();
    var pendientes = [];
    global.OCStore.getProyectos().forEach(function (p) {
      var lev = global.OCStore.getLevantamientoPorProyecto(p.id);
      if (lev && lev.estado === 'completada' && !lev.pdfKey) {
        pendientes.push(lev);
      }
    });

    return Promise.all(pendientes.map(function (lev) {
      var fotos = [];
      (lev.plantillaSnapshot.secciones || []).forEach(function (seccion) {
        (seccion.campos || []).forEach(function (campo) {
          if (campo.tipo === 'fotos') {
            ((lev.datos[seccion.id] || {})[campo.id] || []).forEach(function (foto) { fotos.push(foto); });
          }
        });
      });
      return Promise.all(fotos.map(function (foto, i) {
        return fotoRellenoSemilla(lev.id + ' · foto ' + (i + 1), i % 2 ? '#1e2430' : '#262f3d')
          .then(function (blob) { return global.OCPdfStore.guardarPdf(foto.key, blob); });
      })).then(function () {
        var proyecto = global.OCStore.getProyecto(lev.proyectoId);
        return generarPdfLevantamiento(lev, proyecto, config);
      }).then(function (blob) {
        var pdfKey = 'PDF-' + lev.id;
        return global.OCPdfStore.guardarPdf(pdfKey, blob).then(function () {
          global.OCStore.actualizarLevantamiento(lev.id, { pdfKey: pdfKey });
        });
      });
    })).then(function () {
      try { localStorage.setItem(flagKey, '1'); } catch (e) { /* memoria */ }
    }).catch(function (e) {
      console.error('[ObraCore] No se pudieron generar los levantamientos de la semilla:', e);
    });
  }

  global.OCPdf = {
    generarPdfCotizacion: generarPdfCotizacion,
    generarPdfLevantamiento: generarPdfLevantamiento,
    numeroALetrasEs: numeroALetrasEs,
    totalEnLetra: totalEnLetra,
    formatoMoneda: formatoMoneda,
    sumarDias: sumarDias,
    asegurarPdfsSemilla: asegurarPdfsSemilla,
    asegurarLevantamientosSemilla: asegurarLevantamientosSemilla
  };
})(window);
