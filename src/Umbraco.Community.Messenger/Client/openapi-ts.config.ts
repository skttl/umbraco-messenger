import { defineConfig } from '@hey-api/openapi-ts';
export default defineConfig({input:'http://localhost:5189/umbraco/openapi/messenger.json',output:'src/api',plugins:['@hey-api/typescript','@hey-api/sdk',{name:'@hey-api/client-fetch',exportFromIndex:true}]});
