/* ============================================================
   OCPlantillas — catálogo de plantillas de levantamiento por giro.
   Cada plantilla solo declara SUS secciones propias; las secciones
   base (Visita, Sitio, Evidencia, Conclusión) las agrega el motor
   (OCForms.conSeccionesBase), no este archivo. Ver la skill
   obracore-form-templates para cómo agregar una plantilla nueva.

   Uso:
     OCPlantillas.get(plantillaId)        -> plantilla específica (cae a
                                              'generico' si el id no existe)
     OCPlantillas.resolverId(tipoProyecto) -> plantillaId (lee
                                              OCStore.TIPOS_PROYECTO; cae a
                                              'generico' si el tipo no está
                                              en el catálogo)
   ============================================================ */
(function (global) {
  'use strict';

  var PLANTILLAS = {
    fotovoltaico: {
      id: 'fotovoltaico',
      version: 1,
      nombre: { es: 'Levantamiento fotovoltaico', en: 'Photovoltaic survey' },
      secciones: [
        {
          id: 'consumo',
          titulo: { es: 'Consumo eléctrico', en: 'Electrical consumption' },
          campos: [
            {
              id: 'tarifaCfe', tipo: 'opcion', etiqueta: { es: 'Tarifa CFE', en: 'CFE rate' },
              opciones: [
                { id: '1', etiqueta: { es: '1 — Doméstica', en: '1 — Residential' } },
                { id: 'pdbt', etiqueta: { es: 'PDBT — Comercial baja tensión', en: 'PDBT — Low-voltage commercial' } },
                { id: 'gdbt', etiqueta: { es: 'GDBT — Gran demanda baja tensión', en: 'GDBT — Low-voltage high demand' } },
                { id: 'gdmth', etiqueta: { es: 'GDMTH — Media tensión horaria', en: 'GDMTH — Medium voltage, time-of-use' } }
              ]
            },
            {
              id: 'consumoMensual', tipo: 'tabla', etiqueta: { es: 'Consumo por periodo (últimos recibos)', en: 'Consumption by period (latest bills)' },
              columnas: [
                { id: 'periodo', etiqueta: { es: 'Periodo', en: 'Period' }, tipo: 'texto' },
                { id: 'kwh', etiqueta: { es: 'Consumo', en: 'Consumption' }, tipo: 'numero', unidad: 'kWh', total: 'suma' }
              ]
            }
          ]
        },
        {
          id: 'instalacionElectrica',
          titulo: { es: 'Instalación eléctrica existente', en: 'Existing electrical installation' },
          campos: [
            {
              id: 'tipoAcometida', tipo: 'opcion', etiqueta: { es: 'Tipo de acometida', en: 'Service type' },
              opciones: [
                { id: 'aerea', etiqueta: { es: 'Aérea', en: 'Overhead' } },
                { id: 'subterranea', etiqueta: { es: 'Subterránea', en: 'Underground' } }
              ]
            },
            { id: 'capacidadContratada', tipo: 'numero', etiqueta: { es: 'Capacidad contratada', en: 'Contracted capacity' }, unidad: 'kW', min: 0 },
            {
              id: 'estadoTablero', tipo: 'opcion', etiqueta: { es: 'Estado del tablero principal', en: 'Main panel condition' },
              opciones: [
                { id: 'bueno', etiqueta: { es: 'Bueno', en: 'Good' } },
                { id: 'regular', etiqueta: { es: 'Regular', en: 'Fair' } },
                { id: 'malo', etiqueta: { es: 'Malo', en: 'Poor' } }
              ]
            },
            { id: 'notasInstalacion', tipo: 'textoLargo', etiqueta: { es: 'Notas', en: 'Notes' } }
          ]
        },
        {
          id: 'superficie',
          titulo: { es: 'Superficie de instalación', en: 'Installation surface' },
          campos: [
            {
              id: 'tipoSuperficie', tipo: 'opcion', etiqueta: { es: 'Tipo de superficie', en: 'Surface type' },
              opciones: [
                { id: 'techo-lamina', etiqueta: { es: 'Techo de lámina', en: 'Metal sheet roof' } },
                { id: 'techo-losa', etiqueta: { es: 'Techo de losa', en: 'Concrete slab roof' } },
                { id: 'terreno', etiqueta: { es: 'Terreno (montaje en piso)', en: 'Ground mount' } },
                { id: 'otro', etiqueta: { es: 'Otro', en: 'Other' } }
              ]
            },
            { id: 'areaDisponible', tipo: 'numero', etiqueta: { es: 'Área disponible', en: 'Available area' }, unidad: 'm²', min: 0 },
            { id: 'azimut', tipo: 'numero', etiqueta: { es: 'Azimut', en: 'Azimuth' }, unidad: '°', min: 0, max: 360 },
            { id: 'inclinacion', tipo: 'numero', etiqueta: { es: 'Inclinación', en: 'Tilt' }, unidad: '°', min: 0, max: 90 },
            {
              id: 'estadoEstructura', tipo: 'opcion', etiqueta: { es: 'Estado de la estructura de soporte', en: 'Support structure condition' },
              opciones: [
                { id: 'bueno', etiqueta: { es: 'Bueno', en: 'Good' } },
                { id: 'regular', etiqueta: { es: 'Regular', en: 'Fair' } },
                { id: 'malo', etiqueta: { es: 'Malo', en: 'Poor' } }
              ]
            }
          ]
        },
        {
          id: 'sombras',
          titulo: { es: 'Sombras', en: 'Shading' },
          campos: [
            { id: 'haySombras', tipo: 'siNo', etiqueta: { es: '¿Hay sombras sobre la superficie?', en: 'Is there shading on the surface?' } },
            { id: 'fuentesSombra', tipo: 'textoLargo', etiqueta: { es: 'Fuentes de sombra', en: 'Shading sources' }, visibleSi: { campo: 'haySombras', igualA: true } },
            { id: 'horasSolPico', tipo: 'numero', etiqueta: { es: 'Horas sol pico estimadas', en: 'Estimated peak sun hours' }, unidad: 'h', min: 0, max: 24 }
          ]
        }
      ]
    },

    electrico: {
      id: 'electrico',
      version: 1,
      nombre: { es: 'Levantamiento eléctrico', en: 'Electrical survey' },
      secciones: [
        {
          id: 'servicioMedicion',
          titulo: { es: 'Servicio y medición', en: 'Service and metering' },
          campos: [
            {
              id: 'tipoServicio', tipo: 'opcion', etiqueta: { es: 'Tipo de servicio', en: 'Service type' },
              opciones: [
                { id: 'monofasico', etiqueta: { es: 'Monofásico', en: 'Single-phase' } },
                { id: 'bifasico', etiqueta: { es: 'Bifásico', en: 'Split-phase' } },
                { id: 'trifasico', etiqueta: { es: 'Trifásico', en: 'Three-phase' } }
              ]
            },
            { id: 'tensionNominal', tipo: 'numero', etiqueta: { es: 'Tensión nominal', en: 'Nominal voltage' }, unidad: 'V', min: 0 },
            { id: 'medidor', tipo: 'texto', etiqueta: { es: 'Medidor', en: 'Meter' } }
          ]
        },
        {
          id: 'tableros',
          titulo: { es: 'Tableros', en: 'Panels' },
          campos: [
            {
              id: 'tableros', tipo: 'tabla', etiqueta: { es: 'Tableros existentes', en: 'Existing panels' },
              columnas: [
                { id: 'ubicacion', etiqueta: { es: 'Ubicación', en: 'Location' }, tipo: 'texto' },
                { id: 'capacidad', etiqueta: { es: 'Capacidad', en: 'Capacity' }, tipo: 'numero', unidad: 'A' },
                {
                  id: 'estado', etiqueta: { es: 'Estado', en: 'Condition' }, tipo: 'opcion',
                  opciones: [
                    { id: 'bueno', etiqueta: { es: 'Bueno', en: 'Good' } },
                    { id: 'regular', etiqueta: { es: 'Regular', en: 'Fair' } },
                    { id: 'malo', etiqueta: { es: 'Malo', en: 'Poor' } }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: 'cargas',
          titulo: { es: 'Cargas', en: 'Loads' },
          campos: [
            {
              id: 'cargas', tipo: 'tabla', etiqueta: { es: 'Cargas identificadas', en: 'Identified loads' },
              columnas: [
                { id: 'equipo', etiqueta: { es: 'Equipo', en: 'Equipment' }, tipo: 'texto' },
                { id: 'potencia', etiqueta: { es: 'Potencia', en: 'Power' }, tipo: 'numero', unidad: 'W', total: 'suma' },
                { id: 'horasUso', etiqueta: { es: 'Horas de uso/día', en: 'Hours of use/day' }, tipo: 'numero', unidad: 'h' }
              ]
            }
          ]
        },
        {
          id: 'canalizaciones',
          titulo: { es: 'Canalizaciones', en: 'Conduits' },
          campos: [
            {
              id: 'tipoCanalizacion', tipo: 'opcion', etiqueta: { es: 'Tipo de canalización', en: 'Conduit type' },
              opciones: [
                { id: 'tuberia-metalica', etiqueta: { es: 'Tubería metálica', en: 'Metal conduit' } },
                { id: 'tuberia-pvc', etiqueta: { es: 'Tubería PVC', en: 'PVC conduit' } },
                { id: 'charola', etiqueta: { es: 'Charola', en: 'Cable tray' } },
                { id: 'expuesta', etiqueta: { es: 'Expuesta/sin canalizar', en: 'Exposed/unconduited' } }
              ]
            },
            {
              id: 'estadoCanalizacion', tipo: 'opcion', etiqueta: { es: 'Estado', en: 'Condition' },
              opciones: [
                { id: 'bueno', etiqueta: { es: 'Bueno', en: 'Good' } },
                { id: 'regular', etiqueta: { es: 'Regular', en: 'Fair' } },
                { id: 'malo', etiqueta: { es: 'Malo', en: 'Poor' } }
              ]
            },
            { id: 'notas', tipo: 'textoLargo', etiqueta: { es: 'Notas', en: 'Notes' } }
          ]
        },
        {
          id: 'tierraFisica',
          titulo: { es: 'Tierra física', en: 'Grounding' },
          campos: [
            { id: 'hayTierraFisica', tipo: 'siNo', etiqueta: { es: '¿Existe sistema de tierra física?', en: 'Is there a grounding system?' } },
            { id: 'valorResistencia', tipo: 'numero', etiqueta: { es: 'Valor de resistencia medido', en: 'Measured resistance' }, unidad: 'Ω', min: 0, visibleSi: { campo: 'hayTierraFisica', igualA: true } }
          ]
        }
      ]
    },

    'obra-civil': {
      id: 'obra-civil',
      version: 1,
      nombre: { es: 'Levantamiento de obra civil', en: 'Civil works survey' },
      secciones: [
        {
          id: 'terrenoAccesos',
          titulo: { es: 'Terreno y accesos', en: 'Site and access' },
          campos: [
            {
              id: 'tipoAcceso', tipo: 'opcion', etiqueta: { es: 'Tipo de acceso', en: 'Access type' },
              opciones: [
                { id: 'pavimentado', etiqueta: { es: 'Pavimentado', en: 'Paved' } },
                { id: 'terraceria', etiqueta: { es: 'Terracería', en: 'Unpaved' } },
                { id: 'restringido', etiqueta: { es: 'Restringido', en: 'Restricted' } }
              ]
            },
            {
              id: 'condicionTerreno', tipo: 'opcion', etiqueta: { es: 'Condición del terreno', en: 'Ground condition' },
              opciones: [
                { id: 'plano', etiqueta: { es: 'Plano', en: 'Flat' } },
                { id: 'inclinado', etiqueta: { es: 'Inclinado', en: 'Sloped' } },
                { id: 'irregular', etiqueta: { es: 'Irregular', en: 'Irregular' } }
              ]
            },
            { id: 'restriccionesAcceso', tipo: 'textoLargo', etiqueta: { es: 'Restricciones de acceso', en: 'Access restrictions' } }
          ]
        },
        {
          id: 'medidasNiveles',
          titulo: { es: 'Medidas y niveles', en: 'Measurements and levels' },
          campos: [
            {
              id: 'medidasNiveles', tipo: 'tabla', etiqueta: { es: 'Puntos medidos', en: 'Measured points' },
              columnas: [
                { id: 'punto', etiqueta: { es: 'Punto', en: 'Point' }, tipo: 'texto' },
                { id: 'medida', etiqueta: { es: 'Medida', en: 'Measurement' }, tipo: 'numero', unidad: 'm' },
                { id: 'nivel', etiqueta: { es: 'Nivel', en: 'Level' }, tipo: 'numero', unidad: 'm' }
              ]
            }
          ]
        },
        {
          id: 'tipoSuelo',
          titulo: { es: 'Tipo de suelo', en: 'Soil type' },
          campos: [
            {
              id: 'tipoSuelo', tipo: 'opcion', etiqueta: { es: 'Tipo de suelo', en: 'Soil type' },
              opciones: [
                { id: 'arenoso', etiqueta: { es: 'Arenoso', en: 'Sandy' } },
                { id: 'arcilloso', etiqueta: { es: 'Arcilloso', en: 'Clay' } },
                { id: 'rocoso', etiqueta: { es: 'Rocoso', en: 'Rocky' } },
                { id: 'mixto', etiqueta: { es: 'Mixto', en: 'Mixed' } }
              ]
            },
            { id: 'capacidadCarga', tipo: 'numero', etiqueta: { es: 'Capacidad de carga estimada', en: 'Estimated bearing capacity' }, unidad: 'kg/cm²', min: 0 }
          ]
        },
        {
          id: 'estructuraExistente',
          titulo: { es: 'Estructura existente', en: 'Existing structure' },
          campos: [
            { id: 'hayEstructura', tipo: 'siNo', etiqueta: { es: '¿Hay una estructura existente en el sitio?', en: 'Is there an existing structure on site?' } },
            { id: 'descripcionEstructura', tipo: 'textoLargo', etiqueta: { es: 'Descripción', en: 'Description' }, visibleSi: { campo: 'hayEstructura', igualA: true } }
          ]
        },
        {
          id: 'serviciosDisponibles',
          titulo: { es: 'Servicios disponibles', en: 'Available utilities' },
          campos: [
            {
              id: 'servicios', tipo: 'opcionMultiple', etiqueta: { es: 'Servicios en sitio', en: 'On-site utilities' },
              opciones: [
                { id: 'agua', etiqueta: { es: 'Agua', en: 'Water' } },
                { id: 'drenaje', etiqueta: { es: 'Drenaje', en: 'Sewage' } },
                { id: 'luz', etiqueta: { es: 'Luz', en: 'Electricity' } }
              ]
            }
          ]
        }
      ]
    },

    mantenimiento: {
      id: 'mantenimiento',
      version: 1,
      nombre: { es: 'Levantamiento de mantenimiento', en: 'Maintenance survey' },
      secciones: [
        {
          id: 'equipoRevisar',
          titulo: { es: 'Equipo a revisar', en: 'Equipment to inspect' },
          campos: [
            {
              id: 'equipos', tipo: 'tabla', etiqueta: { es: 'Equipos', en: 'Equipment' },
              columnas: [
                { id: 'equipo', etiqueta: { es: 'Equipo', en: 'Equipment' }, tipo: 'texto' },
                { id: 'marca', etiqueta: { es: 'Marca', en: 'Brand' }, tipo: 'texto' },
                { id: 'modelo', etiqueta: { es: 'Modelo', en: 'Model' }, tipo: 'texto' },
                { id: 'antiguedad', etiqueta: { es: 'Antigüedad', en: 'Age' }, tipo: 'numero', unidad: 'años' }
              ]
            }
          ]
        },
        {
          id: 'checklistInspeccion',
          titulo: { es: 'Checklist de inspección', en: 'Inspection checklist' },
          campos: [
            {
              id: 'inspeccion', tipo: 'checklist', etiqueta: { es: 'Puntos de inspección', en: 'Inspection points' },
              items: [
                { id: 'limpieza-general', etiqueta: { es: 'Limpieza general', en: 'General cleanliness' } },
                { id: 'conexiones-electricas', etiqueta: { es: 'Conexiones eléctricas', en: 'Electrical connections' } },
                { id: 'estructura-fisica', etiqueta: { es: 'Estructura física', en: 'Physical structure' } },
                { id: 'rendimiento', etiqueta: { es: 'Rendimiento', en: 'Performance' } }
              ]
            }
          ]
        },
        {
          id: 'fallasEncontradas',
          titulo: { es: 'Fallas encontradas', en: 'Faults found' },
          campos: [
            { id: 'fallas', tipo: 'textoLargo', etiqueta: { es: 'Descripción de fallas', en: 'Fault description' } }
          ]
        }
      ]
    },

    generico: {
      id: 'generico',
      version: 1,
      nombre: { es: 'Levantamiento general', en: 'General survey' },
      secciones: [
        {
          id: 'medicionesLibres',
          titulo: { es: 'Mediciones', en: 'Measurements' },
          campos: [
            {
              id: 'mediciones', tipo: 'tabla', etiqueta: { es: 'Mediciones', en: 'Measurements' },
              columnas: [
                { id: 'concepto', etiqueta: { es: 'Concepto', en: 'Item' }, tipo: 'texto' },
                { id: 'valor', etiqueta: { es: 'Valor', en: 'Value' }, tipo: 'numero' },
                { id: 'unidad', etiqueta: { es: 'Unidad', en: 'Unit' }, tipo: 'texto' }
              ]
            }
          ]
        },
        {
          id: 'checklistLibre',
          titulo: { es: 'Checklist', en: 'Checklist' },
          campos: [
            {
              id: 'puntos', tipo: 'checklist', etiqueta: { es: 'Puntos de revisión', en: 'Review points' },
              items: [
                { id: 'punto-1', etiqueta: { es: 'Punto de revisión 1', en: 'Review point 1' } },
                { id: 'punto-2', etiqueta: { es: 'Punto de revisión 2', en: 'Review point 2' } }
              ]
            }
          ]
        }
      ]
    }
  };

  function get(plantillaId) {
    return PLANTILLAS[plantillaId] || PLANTILLAS.generico;
  }

  function resolverId(tipoProyecto) {
    var catalogo = (global.OCStore && global.OCStore.TIPOS_PROYECTO) || [];
    var def = null;
    catalogo.forEach(function (t) {
      if (t.id === tipoProyecto) { def = t; }
    });
    return (def && def.plantillaLevantamiento) || 'generico';
  }

  global.OCPlantillas = {
    get: get,
    resolverId: resolverId
  };
})(window);
