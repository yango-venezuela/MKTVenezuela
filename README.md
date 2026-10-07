# Measurement Venezuela

Dashboard de lectura para Caracas, basado en la referencia de OSY del 7 de
octubre de 2026. Conserva los siete KPIs, filtros mensual/semanal, grafica
diaria/acumulada, panel de cierre y fichas de investigacion.

El titulo se centra en el encabezado. El comentario lateral sigue la vista:
`Month overview` compara el mes a fecha, mientras `Week focus` compara la semana
seleccionada. En Month, los comentarios semanales aparecen debajo del focus map
solo para semanas con reales, indicando las fechas efectivamente observadas.
La tarjeta lateral evalua primero Trips y GMV y separa las alertas de adquisicion;
un mes en positivo no se pinta en rojo por el resultado de una semana.

## GitHub Pages: version elegida

La version estatica se publica desde la rama `gh-pages`, con un enlace estable.
Su login es exclusivamente visual: **los agregados y targets publicados son
publicos y se pueden descargar sin iniciar sesion**. La publicacion de estos
datos fue autorizada por la responsable del dashboard el 7 de octubre de 2026.
No publicar datos personales ni credenciales de Google.

```sh
npm ci
npm run setup:pages
ALLOW_PUBLIC_DATA=yes npm run build:pages
npm run preview:pages
```

`setup:pages` genera una clave aleatoria exclusiva de Pages, distinta de la del
servidor, en `../measurement-pages-access.txt`. Su verificador se conserva en
`../measurement-pages-gate.json`, tambien fuera del repositorio. No publica la
clave en texto: el navegador recibe el verificador, que permite probar claves
offline y NO constituye control de acceso a los datos estaticos.
El archivo privado de verificadores admite tambien `{ "users": [...] }` para
varios accesos visuales. Cada usuario mantiene su propio verificador y sesion;
agregar uno no invalida el acceso de los demas. Nunca incluir claves en texto
en `gate-config.json` ni en el repositorio.
Para exportaciones posteriores se reutiliza ese mismo verificador:

```sh
ALLOW_PUBLIC_DATA=yes npm run build:pages
```

La exportacion usa `data/snapshot.json` o `SNAPSHOT_FILE`, genera `dist-pages/`
y nunca copia `.env`, cuentas de servicio ni el servidor. Publique exclusivamente
el contenido de esa carpeta en `gh-pages`. En Settings > Pages seleccione esa
rama y la carpeta raiz. Las bibliotecas y sus licencias se incluyen en el sitio.

Actualizar la pagina solo vuelve a leer la ultima publicacion: no consulta el
Sheet directamente. Para actualizar los reales hay que renovar el snapshot y
republicar en la misma rama; el enlace no cambia. La lectura automatica del Sheet
todavia requiere configurar su conexion por separado.

La version con servidor se conserva como alternativa, pero no es necesaria para
abrir el dashboard publicado en Pages.

## Alternativa Con Servidor

Requiere Node.js 22.13 o superior.

```sh
npm ci
npm run setup:access
npm start
```

`setup:access` genera una clave aleatoria, guarda su hash scrypt en `.env` y
escribe las credenciales en un archivo fuera del repositorio. No sobrescribe
credenciales existentes. El acceso local es `http://localhost:4173`.

## Datos

La interfaz solicita los datos a `/api/dashboard` despues de autenticar la
sesion. La clave, la conexion de Google y las lecturas guardadas permanecen
en el servidor. Esta alternativa no publica reales ni metas; la version de
Pages, descrita arriba, si publica los agregados autorizados en `gh-pages`.

Variables de entorno de produccion:

- `APP_USERNAME`: usuario de acceso al dashboard.
- `APP_PASSWORD_HASH`: hash generado por `setup:access`, no clave en texto.
- `SESSION_SECRET`: secreto aleatorio generado por `setup:access`.
- `PUBLIC_BASE_URL`: URL HTTPS del despliegue, para validar el origen del login.
- `NODE_ENV`: `production` en el servidor publicado; habilita cookies HTTPS.
- `SHEET_ID`: identificador del Sheet aprobado.
- `DAILY_TRACKER_TAB`: nombre de la pestana, inicialmente `4. Daily Tracker`.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: credenciales de una cuenta de servicio con
  permiso de lectura sobre el archivo y Google Sheets API habilitada.
- `ACTIVE_USERS_TAB`: tabla opcional de conteos deduplicados por dia y semana.

Active Users y Trips per Active User se evaluan exclusivamente por semana
completa, de lunes a domingo. Los planes de activos y frecuencia se toman una vez
de las columnas E y F de `4. Daily Tracker`, alineados con el encabezado Date
(actualmente L, tras insertar la nueva columna F). Los siete
valores repetidos no se suman. Si cambian dentro de una semana, la lectura falla
para evitar escoger arbitrariamente un plan.

La frecuencia plan procede de F, igual que el plan de activos procede de E.
Los planes nunca se derivan del reparto diario de viajes ni
se prorratea el plan de activos. En Month, Equity muestra la ultima semana cerrada
con reales del mes y lo indica como `Latest closed`; en Week sigue la seleccion.
Si todavia no hay cierres disponibles, muestra la semana actual. Una semana en
curso muestra el plan completo y
`Pending close`, sin evaluar un semaforo contra una fraccion de semana.

Los reales cerrados proceden de los registros Caracas / Total de `6. DB Weekly`:
usuarios unicos de la columna N y viajes de AJ. La frecuencia real es viajes
de esa misma semana / usuarios unicos. No se suman DAU ni se promedian ratios.
La semana que cruza septiembre y octubre conserva sus siete dias para Equity,
aunque los indicadores mensuales de negocio solo incluyan octubre.
La lectura semanal oficial sustituye en Equity los conteos del export historico
de OSY; no se mezclan sus dos definiciones de usuarios. Los exports historicos
opcionales se conservan como datos de referencia, no como valores del dashboard.

Los planes diarios se conservan tal como llegan del tracker. Las proyecciones
mensuales utilizan su presupuesto mensual aprobado. Una diferencia entre la
suma de planes diarios y la meta mensual se muestra, no se corrige en silencio.
New users utiliza la columna `Act in Yango`; el resumen `Act wo BipBip` mide
una poblacion diferente y no se intercambia automaticamente.

### Performance

Cuatro tarjetas (Spend, CPI, Paid Share y Paid CAC) siguen la vista mensual o
semanal. El grafico diario alterna Spend y Paid CAC y mantiene las separaciones
de semanas. La lectura localiza Date y Budget por encabezado; actualmente usa
`4. Daily Tracker!L1:AE37` y `AK3:AR8`, sin depender de la antigua posicion K.

Spend suma los costos reales y compara con el plan diario al mismo corte. El
pace es real/plan a fecha, no porcentaje de presupuesto consumido. La proyeccion
mensual conserva el presupuesto de Spend del tracker. La banda de pace es +/-5%:
sobregasto rojo, subejecucion amarilla y dentro de banda verde.

CPI es gasto total/installs totales. Paid Share y Paid CAC usan los mismos
usuarios nuevos `Act in Yango`; los usuarios atribuidos de cada dia se derivan
como Paid Share diario por nuevos, igual que `7. DB Daily!U452:U457`.
El share acumulado es atribuidos/nuevos, y CAC es gasto/atribuidos. No se promedian
ratios diarios. Esto corrige la mezcla de poblaciones del resumen mensual
actual del tracker, que pondera Paid Share con `Act wo BipBip` pero calcula CAC
con `Act in Yango`, y puede producir pequenas diferencias respecto a ese resumen.

El CPI plan procede de la celda AA2 del tracker; Paid Share y Paid CAC quedan sin
target hasta confirmacion. Se configuran por mes en `performanceTargets`.
Un `paidCacBdg` diario tiene prioridad sobre el target mensual en el grafico.
Los costos menores al target son favorables; Paid Share conserva una comparacion
neutral porque mas adquisicion pagada no implica mejor performance.
El corte de performance es independiente del de viajes. Ceros se conservan,
denominadores nulos o sin usuarios e informacion incompleta no generan ratios.
La publicacion de los agregados de performance y del verificador de una clave
nueva exclusiva para Pages fue autorizada expresamente el 7 de octubre de 2026.
El login sigue siendo visual y los datos publicados se pueden descargar sin clave.

Sin conexion de Google, el servidor puede mostrar una lectura privada en
`data/snapshot.json`. Esa lectura queda identificada como guardada y conserva
su fecha de corte. No se incluye en GitHub. La conexion en este chat no se
transfiere al servidor: las variables de produccion deben configurarse aparte.

## Despliegue Del Servidor

El dashboard requiere usuario/clave, independientemente de la visibilidad del
repositorio. Railway puede
leer el repositorio, ejecutar `npm run build` y luego `npm start`. Su archivo de
configuracion incluye comprobacion de salud en `/healthz`. Configure las
variables antes de publicar y conserve el mismo servicio y dominio al actualizar.

GitHub Pages no ejecuta este servidor de autenticacion ni la lectura privada del
Sheet. Su version estatica separada utiliza los agregados aprobados y un login
visual, como se explica al inicio de este documento.

Las tipografias corporativas no se redistribuyen en este repositorio publico.
La interfaz utiliza Arial como alternativa hasta contar con permiso de licencia.

## Validacion

```sh
npm test
npm run build
```

Las pruebas cubren login, sesiones, acceso a datos, origen de solicitudes,
deduplicacion agregada, ventanas temporales, frecuencia y estados sin datos.
