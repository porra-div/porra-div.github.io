# Porra Mundial 2026 · Web automática

Web local para una porra del Mundial 2026. Lee los Excel de participantes, consulta una API abierta de resultados y recalcula la clasificación cada 5 minutos.

## Qué incluye

- Servidor Node/Express.
- Frontend HTML/CSS/JS sin build.
- Importador de Excels tipo `Excel Mundial 2026` usando la hoja `Pool`.
- Reglas de puntos configuradas según las capturas compartidas.
- Refresco automático cada 5 minutos en backend y frontend.
- Caché local de la API para no dejar la web vacía si falla la conexión.
- Panel con clasificación, detalles del líder, partidos, grupos, clasificados, campeón más apostado y marcadores exactos.

## Cómo arrancarlo

```bash
npm install
npm start
```

Abre:

```text
http://localhost:3000
```

## Publicarlo en GitHub Pages

El repo incluye un workflow en `.github/workflows/pages.yml`. Al hacer push a `main` o `master`, GitHub Actions:

1. Instala dependencias.
2. Lee los Excel de `data/predictions/`.
3. Genera `public/static-data.json` y `public/static-engine.js`.
4. Publica la carpeta `public/` en GitHub Pages.

En GitHub, ve a:

```text
Settings > Pages > Build and deployment > Source > GitHub Actions
```

Después haz push al repo. La URL quedará normalmente como:

```text
https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/
```

En GitHub Pages no hay servidor Node ejecutándose. Los Excel se convierten a JSON durante el despliegue, y cuando alguien entra en la web el navegador consulta la API pública para recalcular la clasificación con los últimos resultados. Si la API falla, usa los datos guardados en `static-data.json`.

Para actualizar participantes, añade o cambia Excel en `data/predictions/`, haz commit y push. Para probar el build estático en local:

```bash
npm run build:pages
cd public
python3 -m http.server 4173
```

Abre:

```text
http://localhost:4173
```

## Dónde poner los Excel

Mete todos los ficheros `.xlsx`, `.xlsm` o `.xls` de los participantes en:

```text
data/predictions/
```

Cada Excel debe tener hoja `Pool`. El nombre del participante se lee de `Pool!C5`; si sigue poniendo `Nombre`, se usa el nombre del fichero.

## API de resultados

Por defecto usa:

```text
https://worldcup26.ir/get/games
https://worldcup26.ir/get/groups
https://worldcup26.ir/get/teams
```

Puedes cambiarla con una variable de entorno:

```bash
WORLD_CUP_API_BASE=https://worldcup26.ir npm start
```

La API se consulta cada 5 minutos. Si falla, se usa:

```text
data/cache/current-api.json
```

## Reglas de puntos implementadas

- Fase de grupos: signo 1X2 = 1, resultado exacto = 2.
- Dieciseisavos, octavos, cuartos, semifinales y final: resultado exacto = 2.
- 3º/4º puesto: 0 por signo, diferencia y exacto.
- Posiciones de grupo: 1 punto por posición exacta.
- Clasificado a dieciseisavos, octavos, cuartos y semifinales: 1 punto por equipo.
- Finalista: 1 punto.
- Campeón: 4 puntos.
- Subcampeón: 1 punto.
- 3º puesto: 0 puntos.
- Bota de Oro: 2 puntos.
- Balón de Oro: 2 puntos.
- Bota/Balón de Plata y Bronce: 0 puntos.

El resultado exacto sustituye al signo, no se suma encima. Ejemplo: en grupos, acertar 2-1 da 2 puntos, no 3.

## Premios individuales manuales

La mayoría de APIs abiertas no garantizan Bota de Oro/Balón de Oro al final. Para cerrarlo, edita:

```text
data/manual/awards.json
```

Ejemplo:

```json
{
  "goldenBoot": ["Kylian Mbappé"],
  "goldenBall": ["Lamine Yamal"]
}
```

También puedes actualizarlo por HTTP:

```bash
curl -X POST http://localhost:3000/api/manual-awards \
  -H "Content-Type: application/json" \
  -d '{"goldenBoot":["Kylian Mbappé"],"goldenBall":["Lamine Yamal"]}'
```

## Endpoints internos

- `GET /api/dashboard`: datos ya puntuados para la web.
- `POST /api/refresh`: fuerza recálculo.
- `GET /api/participants`: participantes importados.
- `GET /api/raw`: estado completo para depurar.

## Notas importantes

- La API configurada no es oficial de FIFA. La web está preparada para cambiar el adaptador si prefieres usar una API premium/oficial.
- En eliminatorias, si la predicción incluye equipos reales distintos del partido real, no se dan puntos por marcador aunque el número coincida.
- Si un Excel no tiene valores recalculados guardados en la hoja `Pool`, ábrelo una vez en Excel/LibreOffice, guarda y vuelve a ponerlo en `data/predictions`.
