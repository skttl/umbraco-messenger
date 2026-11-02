import { defineConfig } from 'vite';
export default defineConfig({base:'/App_Plugins/Messenger/',build:{lib:{entry:'src/entrypoint.ts',formats:['es'],fileName:'messenger'},outDir:'../wwwroot/App_Plugins/Messenger',emptyOutDir:true,rollupOptions:{external:[/^@umbraco-cms\//],output:{chunkFileNames:'[name]-[hash].js'}}}});
