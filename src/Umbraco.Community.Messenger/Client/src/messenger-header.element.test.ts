// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { LitElement } from 'lit';
const mocked=vi.hoisted(()=>({context:{} as any,manager:{open:vi.fn()},listener:undefined as undefined|((data:any)=>void),data:{} as any}));
vi.mock('@umbraco-cms/backoffice/modal',()=>({UMB_MODAL_MANAGER_CONTEXT:'manager',UmbModalToken:class{constructor(public alias:string,public config:unknown){}}}));
vi.mock('@umbraco-cms/backoffice/lit-element',()=>({UmbLitElement:class extends LitElement{
 localize={term:(key:string)=>key};
 consumeContext(token:unknown,callback:(value:unknown)=>void){callback(token==='manager'?mocked.manager:mocked.context);}
 observe(_source:unknown,callback:(data:unknown)=>void){mocked.listener=callback;callback(mocked.data);}
}}));
vi.mock('./messenger.context',()=>({MESSENGER_CONTEXT:{}}));
import { MessengerHeaderElement,MESSENGER_SIDEBAR } from './messenger-header.element';
let element:MessengerHeaderElement,finish:()=>void;
beforeEach(async()=>{
 mocked.data={authorized:true,open:false,unreadCount:3};mocked.context={state:{},setOpen:vi.fn()};
 const promise=new Promise<void>(resolve=>{finish=resolve;});
 mocked.manager.open.mockReset().mockReturnValue({onSubmit:()=>promise,reject:vi.fn(finish)});
 element=new MessengerHeaderElement();document.body.append(element);await element.updateComplete;
});
afterEach(()=>{element.remove();vi.restoreAllMocks();});
it('opens only one native small sidebar and stops viewing after it closes',async()=>{
 const button=element.shadowRoot!.querySelector<HTMLElement>('#launcher')!;
 button.click();button.click();
 expect(mocked.manager.open).toHaveBeenCalledExactlyOnceWith(element,MESSENGER_SIDEBAR);
 expect(MESSENGER_SIDEBAR).toMatchObject({config:{modal:{type:'sidebar',size:'small'}}});
 expect(mocked.context.setOpen).toHaveBeenLastCalledWith(true);
 finish();await Promise.resolve();await Promise.resolve();expect(mocked.context.setOpen).toHaveBeenLastCalledWith(false);
});
it('closes the native sidebar when authorization is lost',()=>{
 element.shadowRoot!.querySelector<HTMLElement>('#launcher')!.click();
 mocked.listener?.({authorized:false});expect(mocked.manager.open.mock.results[0].value.reject).toHaveBeenCalledOnce();
});