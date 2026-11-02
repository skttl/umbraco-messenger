// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { LitElement } from 'lit';
const mocked=vi.hoisted(()=>({context:{} as any,manager:{open:vi.fn()},listener:undefined as undefined|((data:any)=>void),data:{} as any}));
vi.mock('@umbraco-cms/backoffice/modal',()=>({UMB_MODAL_MANAGER_CONTEXT:'manager'}));
vi.mock('@umbraco-cms/backoffice/lit-element',()=>({UmbLitElement:class extends LitElement {
 localize={term:(key:string)=>key,lang:()=> 'en'};
 consumeContext(token:unknown,callback:(context:unknown)=>void){callback(token==='manager'?mocked.manager:mocked.context);}
 observe(_source:unknown,callback:(data:unknown)=>void){mocked.listener=callback;callback(mocked.data);}
}}));
vi.mock('./messenger.context',()=>({MESSENGER_CONTEXT:{}}));
vi.mock('@umbraco-cms/backoffice/components',()=>({}));
import { MessengerSidebarElement } from './messenger-sidebar.element';
let element:MessengerSidebarElement,finish:()=>void;
const update=async()=>{await element.updateComplete;await Promise.resolve();await element.updateComplete;};
const publish=(change:Record<string,unknown>)=>{mocked.data={...mocked.data,...change};mocked.listener?.(mocked.data);};
const button=(label:string)=>element.shadowRoot!.querySelector<HTMLElement>(`uui-button[label="messenger_${label}"]`)!;
const select=async()=>{publish({selected:'thread',detail:{id:'thread',subject:'My conversation',isActive:true,muted:false,participants:[{id:'anna',name:'Anna',isActive:true}]}});await update();};
beforeEach(async()=>{
 vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});
 mocked.data={authorized:true,open:true,conversations:[],unreadCount:0,messages:[],nextBefore:null,drafts:{},directory:{users:[],groups:[]},loading:false,detailLoading:false,busy:false,live:'connected',online:{},typing:{}};
 mocked.context={state:{},setOpen:vi.fn(),stopTyping:vi.fn(),clearError:vi.fn(),select:vi.fn(),markDisplayed:vi.fn(),mute:vi.fn()};
 const done=new Promise<void>(resolve=>{finish=resolve;});mocked.manager.open.mockReset().mockReturnValue({onSubmit:()=>done,reject:vi.fn(finish)});
 element=new MessengerSidebarElement();element.modalContext={reject:vi.fn()} as any;document.body.append(element);await update();
});
afterEach(()=>{element.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('Messenger sidebar',()=>{
 it('uses the standard body layout and closes through the Umbraco modal context',()=>{
   expect(element.shadowRoot!.querySelector('umb-body-layout')?.getAttribute('headline')).toBe('messenger_title');
   expect(element.shadowRoot!.querySelector('#panel')).toBeNull();expect(button('close').getAttribute('slot')).toBe('actions');
   button('close').click();expect(element.modalContext?.reject).toHaveBeenCalledOnce();
 });
 it('clears viewing state when the native sidebar is removed',()=>{element.remove();expect(mocked.context.setOpen).toHaveBeenLastCalledWith(false);});
 it('localizes a former participant whose account name is unavailable',async()=>{
   publish({conversations:[{id:'thread',subject:'History',isActive:true,unreadCount:0,participants:[{id:'former',name:'',isActive:true}]}]});await update();
   expect(element.shadowRoot!.querySelector('.conversation .meta')?.textContent).toContain('messenger_formerUser');
 });
 it('groups search and new conversation in one toolbar',()=>{
   const toolbar=element.shadowRoot!.querySelector('.list-toolbar')!;
   expect(toolbar.querySelector('uui-button')).toBe(button('new'));expect(toolbar.querySelector('uui-input')?.getAttribute('label')).toBe('messenger_search');
 });
 it('puts subject and back in the header and conversation actions beside the composer without a counter',async()=>{
   await select();const header=element.shadowRoot!.querySelector('[slot="header"]')!;
   expect(header.querySelector('h3')?.textContent).toBe('My conversation');expect(header.contains(button('back'))).toBe(true);
   button('back').click();expect(mocked.context.select).toHaveBeenCalledExactlyOnceWith();
   const composer=element.shadowRoot!.querySelector('.composer')!;
   for(const action of ['add','mute','leave'])expect(composer.contains(button(action))).toBe(true);
   expect(element.shadowRoot!.querySelector('.thread-head .thread-actions')).toBeNull();expect(composer.querySelector('small')).toBeNull();
   expect(composer.querySelector('uui-textarea')?.getAttribute('maxlength')).toBe('100000');
 });
 it.each([['new','new','sidebar'],['add','invite','sidebar'],['leave','leave','dialog']])('opens %s through the native modal manager',async(action,flow,type)=>{
   if(action!=='new')await select();button(action).click();button(action).click();await update();
   expect(mocked.manager.open).toHaveBeenCalledExactlyOnceWith(element,'Messenger.Flow',expect.objectContaining({data:{flow},modal:expect.objectContaining({type,size:'small'})}));
   expect(mocked.context.stopTyping).toHaveBeenCalledOnce();
 });
 it('does not mark messages displayed while a nested panel is open and resumes after close',async()=>{
   await select();publish({messages:[{id:'message',sequence:2,senderName:'Anna',body:'Unread',createdUtc:'2026-11-02T10:00:00Z'}]});await update();
   const root=element.shadowRoot!.querySelector('.messages')!,message=root.querySelector('article')!;
   vi.spyOn(root,'getBoundingClientRect').mockReturnValue({top:0,bottom:100} as DOMRect);vi.spyOn(message,'getBoundingClientRect').mockReturnValue({top:10,bottom:50} as DOMRect);
   button('add').click();window.dispatchEvent(new Event('focus'));expect(mocked.context.markDisplayed).not.toHaveBeenCalled();
   finish();await update();expect(mocked.context.markDisplayed).toHaveBeenCalledWith(2);
   expect(mocked.context.setOpen).not.toHaveBeenCalled();
 });
});
