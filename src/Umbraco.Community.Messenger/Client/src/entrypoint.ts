import type { UmbEntryPointOnInit } from '@umbraco-cms/backoffice/extension-api';
import type {} from '@umbraco-cms/backoffice/extension-types';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { client } from './api/client.gen';
import { en,da } from './locales';
export const onInit:UmbEntryPointOnInit = async(host,registry)=>{
  await new Promise<void>(resolve=>host.consumeContext(UMB_AUTH_CONTEXT,auth=>{if(auth){const config=auth.getOpenApiConfiguration();client.setConfig({baseUrl:config.base,credentials:config.credentials,auth:config.token});resolve();}}));
  const manifests:UmbExtensionManifest[] = [
    {type:'localization',alias:'Messenger.Localization.En',name:'Messenger English',meta:{culture:'en'},js:async()=>({default:en})},
    {type:'localization',alias:'Messenger.Localization.Da',name:'Messenger Danish',meta:{culture:'da'},js:async()=>({default:da})},
    {type:'globalContext',alias:'Messenger.Context',name:'Messenger context',api:()=>import('./messenger.context')},
    {type:'headerApp',alias:'Messenger.HeaderApp',name:'Messenger',weight:100,element:()=>import('./messenger-header.element')},
  ];
  registry.registerMany(manifests);
};
