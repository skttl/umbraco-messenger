// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { LitElement } from 'lit';
const mocked=vi.hoisted(()=>({context:{} as any,listener:undefined as undefined|((data:any)=>void),data:{} as any}));
vi.mock('@umbraco-cms/backoffice/lit-element',()=>({UmbLitElement:class extends LitElement {
 localize={term:(key:string)=>key};
 consumeContext(_token:unknown,callback:(context:unknown)=>void){callback(mocked.context);}
 observe(_source:unknown,callback:(data:unknown)=>void){mocked.listener=callback;callback(mocked.data);}
}}));
vi.mock('./messenger.context',()=>({MESSENGER_CONTEXT:{}}));
vi.mock('@umbraco-cms/backoffice/components',()=>({}));
import { MessengerFlowElement } from './messenger-flow.element';
let element:MessengerFlowElement,wrapper:HTMLElement;
const update=async()=>{await element.updateComplete;await Promise.resolve();await element.updateComplete;};
const publish=(change:Record<string,unknown>)=>{mocked.data={...mocked.data,...change};mocked.listener?.(mocked.data);};
const button=(label:string)=>element.shadowRoot!.querySelector<HTMLElement>(`uui-button[label="messenger_${label}"]`)!;
const input=(label:string)=>element.shadowRoot!.querySelector<HTMLElement&{value:string}>(`[label="messenger_${label}"]`)!;
const edit=(label:string,value:string)=>{const field=input(label);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));};
const choose=async()=>{const checkbox=element.shadowRoot!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await update();};
beforeEach(async()=>{
 mocked.data={authorized:true,busy:false,directoryLoading:false,directory:{users:[{id:'anna',name:'Anna'}],groups:[]}};
 mocked.context={state:{},directory:vi.fn(),create:vi.fn(),invite:vi.fn(),leave:vi.fn(),clearError:vi.fn()};
 wrapper=document.createElement('uui-modal-sidebar');element=new MessengerFlowElement();element.data={flow:'new'};element.modalContext={submit:vi.fn(),reject:vi.fn()} as any;wrapper.append(element);document.body.append(wrapper);await update();
});
afterEach(()=>{wrapper.remove();vi.restoreAllMocks();});
describe('Messenger action panels',()=>{
 it.each([100000,100001])('validates a new message of %s characters at submission',async(length)=>{
   edit('subject','Subject');edit('message','æ'.repeat(length));await choose();
   expect(button('send').hasAttribute('disabled')).toBe(length>100000);
   mocked.context.create.mockResolvedValue(true);element.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));await update();
   if(length===100000){expect(mocked.context.create).toHaveBeenCalledExactlyOnceWith({subject:'Subject',body:'æ'.repeat(length),userIds:['anna'],groupIds:[]});expect(element.modalContext?.submit).toHaveBeenCalledOnce();}
   else{expect(mocked.context.create).not.toHaveBeenCalled();expect(element.modalContext?.submit).not.toHaveBeenCalled();}
   expect(element.shadowRoot!.querySelector('uui-textarea')?.getAttribute('maxlength')).toBe('100000');
 });
 it('preserves a failed draft and guards Escape, modal close and cancel while saving',async()=>{
   edit('subject','First subject');edit('message','First message');await choose();
   let finish!:(value:boolean)=>void;mocked.context.create.mockImplementation(()=>{publish({busy:true});return new Promise<boolean>(resolve=>{finish=resolve;});});
   button('send').click();await update();
   const escape=new KeyboardEvent('keydown',{key:'Escape',cancelable:true});window.dispatchEvent(escape);expect(escape.defaultPrevented).toBe(true);
   const close=new Event('uui:modal-close',{cancelable:true});wrapper.dispatchEvent(close);expect(close.defaultPrevented).toBe(true);
   button('cancel').click();expect(element.modalContext?.reject).not.toHaveBeenCalled();
   expect(input('subject').value).toBe('First subject');expect(input('message').value).toBe('First message');expect(element.shadowRoot!.textContent).toContain('messenger_saving');
   publish({busy:false,error:'sendError'});finish(false);await update();
   expect(element.modalContext?.submit).not.toHaveBeenCalled();expect(element.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain('messenger_sendError');expect(input('message').value).toBe('First message');
   const idleEscape=new KeyboardEvent('keydown',{key:'Escape',cancelable:true});window.dispatchEvent(idleEscape);expect(idleEscape.defaultPrevented).toBe(false);
   button('cancel').click();expect(element.modalContext?.reject).toHaveBeenCalledOnce();
 });
 it('defaults an invitation to future messages and submits selected history sharing',async()=>{
   element.data={flow:'invite'};await update();await choose();
   const radios=element.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="radio"]');expect(radios[0].checked).toBe(true);expect(radios[1].checked).toBe(false);
   radios[1].dispatchEvent(new Event('change',{bubbles:true}));mocked.context.invite.mockResolvedValue(true);button('invite').click();await update();
   expect(mocked.context.invite).toHaveBeenCalledExactlyOnceWith({userIds:['anna'],groupIds:[],shareHistory:true});expect(element.modalContext?.submit).toHaveBeenCalledOnce();
 });
 it('allows core navigation to close an already resolved panel while saving',async()=>{
   element.modalContext={submit:vi.fn(),reject:vi.fn(),isResolved:()=>true} as any;
   publish({busy:true});await update();
   const close=new Event('uui:modal-close',{cancelable:true});wrapper.dispatchEvent(close);
   expect(close.defaultPrevented).toBe(false);
 });
 it('closes on logout even during a pending save',async()=>{
   publish({busy:true,authorized:false});await update();expect(element.modalContext?.reject).toHaveBeenCalledOnce();
 });
});
