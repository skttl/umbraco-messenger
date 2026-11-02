import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { html,css,customElement,state,nothing } from '@umbraco-cms/backoffice/external/lit';
import { UMB_MODAL_MANAGER_CONTEXT, UmbModalToken, type UmbModalContext, type UmbModalManagerContext } from '@umbraco-cms/backoffice/modal';
import { MESSENGER_CONTEXT, type MessengerContext, type MessengerSnapshot } from './messenger.context';
import { en } from './locales';

export const MESSENGER_SIDEBAR = new UmbModalToken('Messenger.Sidebar',{modal:{type:'sidebar',size:'small',title:'#messenger_title'}});

@customElement('messenger-header-app')
export class MessengerHeaderElement extends UmbLitElement {
  #context?:MessengerContext;
  #manager?:UmbModalManagerContext;
  #modal?:UmbModalContext;
  @state() private _data?:MessengerSnapshot;
  constructor(){
    super();
    this.consumeContext(UMB_MODAL_MANAGER_CONTEXT,manager=>{this.#manager=manager;});
    this.consumeContext(MESSENGER_CONTEXT,context=>{
      this.#context=context;
      this.observe(context?.state,data=>{this._data=data;if(data&&!data.authorized)this.#modal?.reject();},'messenger-state');
    });
  }
  #t(key:keyof typeof en.messenger){return this.localize.term(`messenger_${key}`);}
  async #open(){
    if(!this.#manager||this.#modal||!this._data?.authorized)return;
    const modal=this.#manager.open(this,MESSENGER_SIDEBAR);this.#modal=modal;this.#context?.setOpen(true);
    try{await modal.onSubmit();}catch{/* Closing the sidebar rejects its result. */}
    finally{this.#modal=undefined;this.#context?.setOpen(false);}
  }
  override disconnectedCallback(){this.#modal?.reject();super.disconnectedCallback();}
  override render(){
    const count=this._data?.unreadCount??0;
    return html`<uui-button id="launcher" compact look="primary" label=${`${this.#t('open')}${count?`, ${count} ${this.#t('unread')}`:''}`} aria-haspopup="dialog" aria-expanded=${this._data?.open?'true':'false'} @click=${this.#open}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 15H7l-4 4V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6a4 4 0 0 1-4 4Z"/><path d="M8 18h9l4 3V10a2 2 0 0 0-2-2"/></svg>
      ${count?html`<span class="badge" aria-hidden="true">${count>99?'99+':count}</span>`:nothing}
    </uui-button>`;
  }
  static override styles=css`:host{display:block;font:inherit;color:inherit}#launcher{position:relative;--uui-button-background-color:transparent;--uui-button-background-color-hover:var(--uui-color-emphasis)}svg{display:block}.badge{position:absolute;top:1px;right:-3px;min-width:14px;height:16px;padding:0 3px;border-radius:10px;background:#F4A340;color:#1B264F;font-size:10px;font-weight:700;line-height:16px}`;
}
export default MessengerHeaderElement;