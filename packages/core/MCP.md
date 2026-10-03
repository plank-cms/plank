# Servidor MCP

Plank expone un servidor MCP remoto en `/mcp` para descubrir esquemas, consultar entradas y preparar borradores. Usa Streamable HTTP sin sesiones, con respuestas JSON y el SDK oficial MCP v2.

## Conectar KIZUNA Assistant

1. En el admin, abrí **Settings → API Tokens** y creá un token de tipo **MCP Server**.
2. Copiá el token cuando se muestre: Plank almacena su hash y no permite recuperarlo después.
3. En KIZUNA Assistant, agregá un servidor MCP remoto con URL `https://your-instance.com/mcp` y autenticación Bearer.
4. Configurá el token como secreto del cliente. Plank espera `Authorization: Bearer <token>`.
5. Pedile a Assistant que descubra los tipos y consulte el esquema antes de crear contenido.

El servidor actúa como el usuario que creó el token. Revisa en cada solicitud si el token existe, si el usuario está habilitado y cuál es su rol actual. Los permisos también se comprueban al ejecutar cada herramienta. Los tokens MCP existentes adquieren estas capacidades según los permisos de sus creadores.

No se requiere OAuth. Los tokens `read-only` y `full-access` no sirven para `/mcp`; los tokens `mcp-server` no sirven para `/api`.

## Herramientas

Las herramientas disponibles dependen de los permisos del usuario:

| Herramienta               | Argumentos                 | Permiso              |
| ------------------------- | -------------------------- | -------------------- |
| `list_content_types`      | Ninguno                    | `content-types:read` |
| `get_content_type_schema` | `slug`                     | `content-types:read` |
| `get_locales`             | Ninguno                    | Usuario autenticado  |
| `list_entries`            | `slug`, filtros opcionales | `entries:read`       |
| `get_entry`               | `slug`, `id`               | `entries:read`       |
| `create_entry`            | `slug`, `data`             | `entries:write`      |
| `update_entry`            | `slug`, `id`, `data`       | `entries:write`      |

`list_entries` acepta `page`, `limit`, `search`, `searchFields`, `status`, `sort` y `order`. Usa página 1 y 20 resultados por defecto; el máximo es 100. Si no se indican `searchFields`, la búsqueda usa todos los campos `string`, `uid`, `text` y `richtext`. Los estados admitidos para consultar son `draft`, `published`, `scheduled`, `pending` e `in_review`.

Las consultas devuelven contenido de trabajo, incluidos borradores; no equivalen a la API pública. Las mutaciones mantienen las restricciones de autoría, tipos single y bloqueo editorial de Plank.

Cada resultado incluye el mismo objeto en `structuredContent` y como JSON serializado en `content[0].text`. Las consultas de entradas individuales y las mutaciones devuelven `{ "entry": { ... } }`; la lista devuelve `data`, `total`, `page`, `limit` y `available_statuses`.

## Recursos

Se conservan los recursos existentes:

- `plank://content-types`: lista de tipos y URIs de sus esquemas.
- `plank://locales`: idiomas habilitados e idioma predeterminado.
- `plank://content-types/{slug}/schema`: esquema completo de un tipo.

`resources/list` enumera los recursos accesibles; `resources/templates/list` descubre la plantilla de esquemas. `resources/read` devuelve documentos JSON en `contents[].text`.

## Crear un comunicado

Los nombres de tipos y campos dependen del esquema de cada instancia. Este ejemplo supone un tipo `announcements` con campos `title`, `slug` y `body`:

```json
{
  "name": "create_entry",
  "arguments": {
    "slug": "announcements",
    "data": {
      "title": "Service update",
      "slug": "service-update",
      "body": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Our service has been updated.\"}]}]}"
    }
  }
}
```

La entrada se crea en estado `draft`, atribuida al creador del token. Para un tipo `single`, la creación falla si ya existe una entrada: consultala y usá `update_entry`.

Assistant no puede publicar, programar, eliminar, modificar estados ni administrar media. Revisá y publicá el comunicado desde el admin.

## Editar contenido

```json
{
  "name": "update_entry",
  "arguments": {
    "slug": "announcements",
    "id": "entry-id",
    "data": {
      "title": "Updated service announcement",
      "localized": {
        "es": {
          "title": "Comunicado actualizado"
        }
      }
    }
  }
}
```

- Los campos omitidos se conservan. Se valida el contenido completo resultante, incluidos los campos obligatorios.
- Los arrays se reemplazan completos; no se actualizan elementos por índice.
- `localized` se combina por idioma y campo. `_meta.enabled` es booleano y `_meta.primary` es el idioma primario. Consultá `get_locales` para conocer los idiomas configurados.
- `richtext` es una **cadena que contiene el documento JSON de TipTap**, como la guardada por el editor de Plank. No es un objeto JSON ni Markdown.
- Las relaciones escalares usan IDs de entradas; las relaciones many-to-many usan arrays de IDs. Las relaciones inversas one-to-many son de solo lectura.
- Los campos media usan referencias existentes de Plank; no se realizan búsquedas ni cargas de archivos por MCP.
- Campos desconocidos y metadatos como `status`, `created_by`, `published_at`, `scheduled_for` o `editor_id` se rechazan.

## Protección de contenido público

Editar una entrada publicada conserva su estado y su snapshot `published_data`. Prepara cambios para publicar después desde el admin. Los metadatos de edición, como `updated_at`, siguen el comportamiento habitual de Plank.

El MCP rechaza operaciones que no pueden mantener aislado el contenido público:

- Ediciones de entradas programadas.
- Ediciones de entradas publicadas sin un snapshot utilizable.
- Cambios localizados cuando la versión publicada depende de los valores actuales por fallback.
- Cambios de relaciones en entradas publicadas.
- Ediciones de entradas referenciadas por contenido publicado, incluidas relaciones many-to-many inversas.
- Asociaciones many-to-many con entradas publicadas.

Realizá esas operaciones desde el admin. Estas restricciones solo aplican al MCP y no cambian la resolución de relaciones de la API pública.

Las escrituras se ejecutan en una transacción. Para impedir que una publicación concurrente invalide las comprobaciones, se bloquean brevemente las tablas de contenido durante la operación. Ante un rechazo o error de persistencia, la transacción se revierte. Los eventos `entry.created`, `entry.updated` y la sincronización de preview se disparan después de confirmar la transacción; no se generan eventos de publicación.

## Transporte y errores

Usá un cliente compatible con Streamable HTTP. El SDK negocia la versión del protocolo durante `initialize`; no hay un ID de sesión que almacenar. `GET /mcp` y `DELETE /mcp` responden 405 porque no se ofrecen streams SSE ni sesiones persistentes.

Para requests manuales, enviá `Content-Type: application/json`, `Accept: application/json, text/event-stream` y el encabezado Bearer. Los clientes sin `Origin` están permitidos; los que envían un origen deben cumplir la validación de Plank. No se incluye transporte HTTP+SSE heredado.

Errores de autenticación usan HTTP 401; tokens de tipo incorrecto y orígenes no permitidos usan HTTP 403. Los mensajes MCP y argumentos malformados se manejan mediante el SDK. Los errores de operaciones válidas incluyen `isError: true` y este formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Entry validation failed",
    "details": ["Field \"title\" is required"]
  }
}
```

Los códigos de operación incluyen `FORBIDDEN`, `NOT_FOUND`, `INVALID_ARGUMENT`, `INVALID_FIELD`, `INVALID_LOCALIZATION`, `VALIDATION_ERROR`, `INVALID_REFERENCE`, `CONFLICT`, `SINGLE_EXISTS`, `SCHEDULED_ENTRY`, `UNSAFE_SNAPSHOT`, `UNSAFE_LOCALIZATION`, `PUBLIC_REFERENCE`, `PUBLIC_RELATION` e `INTERNAL_ERROR`. No se exponen detalles internos de SQL.

Si una llamada pierde su respuesta, consultá las entradas antes de repetir una creación: no se ofrece deduplicación automática.

## Verificación

Desde la raíz del repositorio:

```bash
pnpm --filter @plank-cms/core test
pnpm exec tsc -p packages/core/tsconfig.test.json
pnpm --filter @plank-cms/core lint
pnpm --filter @plank-cms/schema lint
```

Las pruebas usan el cliente MCP oficial y una conexión HTTP local, con persistencia simulada. No modifican una base de datos real ni publican contenido. El tsconfig de pruebas apunta al código fuente de los paquetes internos para verificar cambios sin producir builds.

La aceptación en KIZUNA consiste en conectar el servidor, descubrir el esquema, crear un comunicado en borrador, editarlo y verificarlo en el admin. Requiere acceso al entorno real de Assistant y a una instancia de Plank.
