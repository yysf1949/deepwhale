/**
 * sql.js-fts5 minimal type shim (D-30.3.2).
 *
 * 拍板: 上游 sql.js-fts5 不带 .d.ts, 跟 sql.js 1:1 API. 复用 @types/sql.js
 *   的 shape (InitSqlJsStatic / SqlJsStatic / Database), 改 import 名.
 *   0 改业务实现, 0 业务 API 影响.
 */
declare module 'sql.js-fts5' {
  import type initSqlJs from 'sql.js';
  export = initSqlJs;
}
