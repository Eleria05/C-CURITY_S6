# C-CURITY · CAM-CONTROL — S6 Prototipo Funcional

Lógica de negocio de la plataforma **CAM-CONTROL**, que digitaliza la operación del negocio familiar
C-CURITY (instalación y mantenimiento de videovigilancia). Está escrita en **JavaScript (Node.js)**
**sin interfaz de usuario**, tal como pide el taller de prototipado funcional.

| | |
|---|---|
| **Materia** | Construcción de Software · 4CV42 · 2027-1 |
| **Entrega** | S6 Prototipo Funcional |
| **Equipo 8** | Rios Solorio Samanta · Hernandez Eleria Juan Jose · Alanis Valle Alonso Emanuel · Nuñez Solis Luis Angel |

## ¿Qué hace?

Implementa el proceso completo de una **orden de trabajo**, del pedido del cliente al reporte final:

```
Cliente solicita → Admin agenda y asigna técnico → Técnico inicia y llena el checklist
      → Se finaliza (solo con checklist al 100%) → Reporte + semáforo → Siguiente preventivo
```

Corresponde a la capa de **Lógica de negocio** de la arquitectura monolítica en capas definida en S3.
Los datos se guardan en arreglos en memoria (se pierden al cerrar el programa); en una fase posterior
esa capa se conecta a PostgreSQL.

## Cómo ejecutarlo

**Requisito:** [Node.js](https://nodejs.org) 18 o superior. No hay dependencias ni `npm install`.

Desde la carpeta del proyecto:

```bash
node main.js        # demo: recorre el proceso completo en consola
node pruebas.js     # 13 pruebas automáticas (deben salir 0 con fallo)
```

También funcionan `npm run demo` y `npm test`.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `ccurity.js` | **Lógica del sistema**: reglas de negocio y proceso de las órdenes |
| `main.js` | Demo en consola. Muestra el flujo y las acciones que el sistema **rechaza** por una regla |
| `pruebas.js` | Pruebas automáticas de cada regla de negocio |
| `package.json` | Datos del proyecto y atajos (`npm run demo`, `npm test`) |

## Reglas de negocio implementadas (diagnóstico S1)

| Regla | Dónde está (`ccurity.js`) | Prueba que la valida |
|---|---|---|
| Falla crítica: atención máxima en 24 horas hábiles | `sumarHorasHabiles`, `crearOrden`, `agendar` | horarios y 24 horas hábiles · falla crítica dentro del plazo |
| Visitas solo L-V 9:00-18:00 y sábado 9:00-14:00 | `esHabil`, `agendar` | agenda: solo en horario hábil |
| Hasta 10 km solo tarifa base; más de 10 km, cargo de traslado | `cotizar` | cobertura |
| Sin el 100 % del checklist y observaciones no se finaliza | `finalizar` | no se finaliza sin checklist completo |
| Estados: Pendiente → En Proceso → Finalizada (no se saltan ni regresan) | `iniciar`, `finalizar` | estados |
| Garantía del fabricante: el RMA es una nueva orden correctiva | `rma` | RMA y siguiente preventivo |
| Tres perfiles con permisos distintos | `PERMISOS`, `permitir`, `puedeVer` | permisos por perfil · portal |
| Semáforo del cliente: Operativo / Requiere Atención / Fuera de Servicio | `semaforo` | semáforo |
| El administrador programa el siguiente preventivo | `programarPreventivo` | RMA y siguiente preventivo |
| No se duplican órdenes abiertas ni se empalman las visitas de un técnico | `crearOrden`, `ocupado` | no se duplican · agenda |

> **Nota sobre el checklist:** una casilla marcada `FALLA` cuenta como revisada, pero obliga al técnico a
> documentar la incidencia y la solución aplicada. El estado del equipo afectado se actualiza al finalizar.

### Permisos por perfil

| Perfil | Puede |
|---|---|
| **Administrador** | Crear, agendar y asignar órdenes · tramitar RMA · programar preventivos · ver todo |
| **Técnico** | Ver sus órdenes · iniciar · llenar el checklist · finalizar · descargar reportes de sus órdenes |
| **Cliente** | Solicitar servicio para su negocio · ver sus órdenes · descargar sus reportes |

## Ejemplo de salida (`node main.js`)

```
[RECHAZADO] Agendar en domingo -> Fuera de horario: L-V 9:00-18:00 y sabado 9:00-14:00
[RECHAZADO] Finalizar con 5 de 6 casillas -> No se puede finalizar. Falta: almacenamiento, observaciones
[OK]        Finalizar con checklist al 100%
```

## Supuestos

El diagnóstico no define estos valores, así que se asumieron y **deben confirmarse con el propietario**.
Están al inicio de `ccurity.js`:

- Tarifa base de visita: **$450 MXN** · cargo por km adicional: **$12 MXN**
- Duración de una visita: **2 horas** (para detectar empalmes en la agenda del técnico)
- Siguiente preventivo: **3 meses** después del servicio
- Semáforo: DVR/NVR o disco fuera de servicio, o la mitad de los equipos caídos → *Fuera de Servicio*

## Alcance y siguientes pasos

Esta entrega cubre únicamente la lógica de negocio. Queda para las siguientes fases:

- [ ] Base de datos PostgreSQL (reemplazar los arreglos en memoria)
- [ ] API con Express e inicio de sesión con JWT y contraseñas cifradas
- [ ] Reporte en PDF (Puppeteer); por ahora el reporte sale como texto
- [ ] Interfaz de usuario según los mockups de Figma
