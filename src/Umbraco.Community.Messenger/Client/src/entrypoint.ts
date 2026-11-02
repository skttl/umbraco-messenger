import type { UmbEntryPointOnInit } from '@umbraco-cms/backoffice/extension-api';
import type {} from '@umbraco-cms/backoffice/extension-types';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { client } from './api/client.gen';
import { localizations } from './locales';
export const onInit:UmbEntryPointOnInit = async(host,registry)=>{
  await new Promise<void>(resolve=>host.consumeContext(UMB_AUTH_CONTEXT,auth=>{if(auth){const config=auth.getOpenApiConfiguration();client.setConfig({baseUrl:config.base,credentials:config.credentials,auth:config.token});resolve();}}));
  const manifests:UmbExtensionManifest[] = [
    ...Object.entries(localizations).map(([culture,translation])=>({type:'localization' as const,alias:`Messenger.Localization.${culture}`,name:`Messenger ${culture}`,meta:{culture},js:async()=>({default:translation})})),
    {type:'modal',alias:'Messenger.Sidebar',name:'Messenger sidebar',element:()=>import('./messenger-sidebar.element')},
    {type:'globalContext',alias:'Messenger.Context',name:'Messenger context',api:()=>import('./messenger.context')},
    {type:'headerApp',alias:'Messenger.HeaderApp',name:'Messenger',weight:100,element:()=>import('./messenger-header.element')},
  ];
  registry.registerMany(manifests);
};
