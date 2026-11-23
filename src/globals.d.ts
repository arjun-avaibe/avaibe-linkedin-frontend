/**
 * Where the screens get their data, set by vite.config.ts at build time:
 * - true  (`npm run dev`, `npm run build:sample`): sample data kept in this browser (src/sample-data), no backend
 * - false (`npm run dev:api`, `npm run build`): the Django API at /api
 * Because it is replaced at build time, production builds leave the sample data out entirely.
 */
declare const __SAMPLE_DATA__: boolean
