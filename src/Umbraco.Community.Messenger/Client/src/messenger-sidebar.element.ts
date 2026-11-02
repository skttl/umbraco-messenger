import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { html,css,customElement,state,property,nothing,repeat } from '@umbraco-cms/backoffice/external/lit';
import { MESSENGER_CONTEXT, type MessengerContext, type MessengerSnapshot } from './messenger.context';
import type { MessageResponse } from './api/types.gen';
import { en } from './locales';
import '@umbraco-cms/backoffice/components';
import { UMB_MODAL_MANAGER_CONTEXT, type UmbModalManagerContext, type UmbModalContext, type UmbModalExtensionElement } from '@umbraco-cms/backoffice/modal';

@customElement('messenger-sidebar')
export class MessengerSidebarElement extends UmbLitElement implements UmbModalExtensionElement {
  @property({attribute:false}) modalContext?:UmbModalContext;
  #context?:MessengerContext;
  @state() private _data?:MessengerSnapshot;
  @state() private _search='';
  @state() private _filter:'active'|'unread'|'former'='active';
  @state() private _flow:'new'|'invite'|'leave'|undefined;
  #manager?:UmbModalManagerContext;
  #flowModal?:UmbModalContext;
  #listeners?:AbortController;
  #observer?:IntersectionObserver;
  #observed='';
  #lastThread?:string;
  #lastMessage?:string;
  constructor(){super();this.consumeContext(UMB_MODAL_MANAGER_CONTEXT,manager=>{this.#manager=manager;});this.consumeContext(MESSENGER_CONTEXT,context=>{this.#context=context;this.observe(context?.state,data=>{const loggedOut=data&&!data.authorized&&this._data?.authorized;this._data=data;if(loggedOut){this.#flowModal?.reject();this.#close();this._search="";this._filter="active";}},'messenger-state');});}
  #t(key:keyof typeof en.messenger){return this.localize.term(`messenger_${key}`);}
  override connectedCallback(){
    super.connectedCallback();this.#listeners=new AbortController();const signal=this.#listeners.signal;
    window.addEventListener('focus',this.#readVisible,{signal});
    document.addEventListener('visibilitychange',this.#readVisible,{signal});
  }
  override disconnectedCallback(){this.#flowModal?.reject();this.#context?.setOpen(false);this.#listeners?.abort();this.#observer?.disconnect();super.disconnectedCallback();}
  #close(){this.modalContext?.reject();}
  async #openFlow(flow:'new'|'invite'|'leave'){
    if(!this.#manager||this._data?.busy||this.#flowModal)return;
    this._flow=flow;this.#context?.clearError();this.#context?.stopTyping();
    const modal=this.#manager.open(this,'Messenger.Flow',{data:{flow},modal:{type:flow==='leave'?'dialog':'sidebar',size:'small',title:`#messenger_${flow==='leave'?'leaveTitle':flow==='invite'?'add':'new'}`}});this.#flowModal=modal;
    try{await modal.onSubmit();}catch{/* Cancellation leaves the conversation unchanged. */}
    finally{this.#flowModal=undefined;this._flow=undefined;this.#readVisible();}
  }
  #date(value:string){return new Date(value).toLocaleString(this.localize.lang()||undefined,{dateStyle:'short',timeStyle:'short'});}
  #error(){const error=this._data?.error;return error?html`<div class="error" role="alert"><span>${this.#t(error as keyof typeof en.messenger)}</span><uui-button look="secondary" label=${this.#t('retry')} @click=${()=>{this.#context?.clearError();void this.#context?.refresh();if(this._data?.selected)void this.#context?.loadDetail();}}>${this.#t('retry')}</uui-button></div>`:nothing;}
  override render(){
    const data=this._data;
    return html`<umb-body-layout headline=${data?.selected?'':this.#t('title')} main-no-padding header-no-padding>${data?.selected?html`<div slot="header" class="conversation-header"><uui-button compact label=${this.#t('back')} @click=${()=>this.#context?.select()} data-mark="action:back"><umb-icon name="icon-arrow-left"></umb-icon></uui-button><h3 title=${data.detail?.subject??''}>${data.detail?.subject??this.#t('loading')}</h3></div>`:nothing}
      <div class="panel-content">
        ${data?.live!=='connected'?html`<div class="live" role="status">${this.#t(data?.live==='connecting'?'connecting':data?.live==='reconnecting'?'reconnecting':'liveOffline')}</div>`:nothing}
        ${!this._flow?this.#error():nothing}
        ${data?.selected?this.#thread():this.#list()}
      </div>
      <uui-button slot="actions" look="secondary" label=${this.#t('close')} @click=${this.#close}>${this.#t('close')}</uui-button>
    </umb-body-layout>`;
  }
  #list(){
    const data=this._data;const items=(data?.conversations??[]).filter(x=>(this._filter==='former'?!x.isActive:x.isActive&&(this._filter!=='unread'||x.unreadCount>0))&&x.subject.toLocaleLowerCase().includes(this._search.toLocaleLowerCase()));
    return html`<section class="list-tools"><div class="list-toolbar"><uui-button look="primary" color="positive" label=${this.#t('new')} @click=${()=>this.#openFlow('new')}><umb-icon name="icon-add"></umb-icon>${this.#t('new')}</uui-button><uui-input type="search" label=${this.#t('search')} placeholder=${this.#t('search')} .value=${this._search} @input=${(e:Event)=>{this._search=(e.target as HTMLInputElement).value;}}></uui-input></div><nav class="filters" aria-label=${this.#t('title')}>${(['active','unread','former'] as const).map(filter=>html`<button type="button" class=${filter===this._filter?'selected':''} aria-pressed=${filter===this._filter} @click=${()=>{this._filter=filter;}}>${this.#t(filter==='unread'?'unreadFilter':filter)}</button>`)}</nav></section>
      <section class="conversation-list" aria-busy=${data?.loading?'true':'false'}>
        ${data?.loading&&!data.conversations.length?html`<p class="empty"><uui-loader></uui-loader> ${this.#t('loading')}</p>`:nothing}
        ${!data?.loading&&!items.length?html`<div class="empty"><strong>${this.#t('empty')}</strong><p>${this.#t('emptyHint')}</p></div>`:nothing}
        ${repeat(items,x=>x.id,x=>html`<button type="button" class="conversation ${x.unreadCount?'unread':''}" @click=${()=>this.#context?.select(x.id)} aria-label=${`${this.#t('loadThread')}: ${x.subject}${x.unreadCount?`, ${x.unreadCount} ${this.#t('unreadMessages')}`:''}`}>
          <span class="row"><strong>${x.subject}</strong>${x.unreadCount?html`<span class="count">${x.unreadCount}</span>`:nothing}</span>
          <span class="preview">${x.lastMessage?.body??''}</span>
          <span class="row meta"><span>${x.muted?html`<umb-icon name="icon-bell-off" title=${this.#t('muted')}></umb-icon>`:nothing}${x.participants.filter(p=>p.isActive).map(p=>p.name||this.#t('formerUser')).join(', ')}</span><time>${x.lastMessage?this.#date(x.lastMessage.createdUtc):''}</time></span>
        </button>`)}
      </section>`;
  }
  #thread(){
    const data=this._data!,detail=data.detail;
    return html`<div class="thread-head">
      ${detail?html`${detail.isActive?html`<div class="participants" aria-label=${this.#t('participants')}>${detail.participants.filter(p=>p.isActive).map(p=>html`<span><i class=${data.online[p.id]?'online':''} title=${this.#t(data.online[p.id]?'online':'offline')}></i>${p.name||this.#t('formerUser')}</span>`)}</div>`:html`<p class="former-note">${this.#t('left')}</p>`}`:nothing}
      </div>
      <section class="messages" aria-label=${this.#t('message')} aria-busy=${data.detailLoading?'true':'false'} @scroll=${this.#readVisible}>
        ${data.detailLoading?html`<p class="empty"><uui-loader></uui-loader> ${this.#t('loading')}</p>`:nothing}
        ${data.nextBefore!==null?html`<uui-button look="secondary" label=${this.#t('earlier')} ?disabled=${data.busy} @click=${()=>this.#context?.older()}>${this.#t('earlier')}</uui-button>`:nothing}
        ${repeat(data.messages,x=>x.id,message=>this.#message(message))}
      </section>
      ${detail?.isActive?html`<div class="typing" role="status">${Object.keys(data.typing).map(id=>detail.participants.find(p=>p.id===id)?.name).filter(Boolean).join(', ')}${Object.keys(data.typing).length?` ${this.#t('typing')}`:''}</div><form class="composer" @submit=${(e:Event)=>{e.preventDefault();void this.#context?.send();}}><uui-textarea label=${this.#t('reply')} placeholder=${this.#t('reply')} maxlength="100000" .value=${data.drafts[detail.id]??''} @input=${(e:Event)=>{const body=(e.target as HTMLTextAreaElement).value;this.#context?.setDraft(detail.id,body);this.#context?.typing(body);}}></uui-textarea><div class="composer-foot"><div class="thread-actions"><uui-button compact label=${this.#t('add')} @click=${()=>this.#openFlow('invite')}><umb-icon name="icon-add"></umb-icon>${this.#t('add')}</uui-button><uui-button compact label=${this.#t(detail.muted?'unmute':'mute')} ?disabled=${data.busy} @click=${()=>this.#context?.mute()}><umb-icon name=${detail.muted?'icon-bell':'icon-bell-off'}></umb-icon>${this.#t(detail.muted?'unmute':'mute')}</uui-button><uui-button compact label=${this.#t('leave')} @click=${()=>this.#openFlow('leave')}><umb-icon name="icon-out"></umb-icon>${this.#t('leave')}</uui-button></div><uui-button type="submit" look="primary" color="positive" label=${this.#t('send')} ?disabled=${data.busy||!data.drafts[detail.id]?.trim()||(data.drafts[detail.id]?.length??0)>100000}>${this.#t('send')}</uui-button></div></form>`:nothing}`;
  }
  #message(message:MessageResponse){return html`<article class="message" data-sequence=${message.sequence}><div class="row"><strong>${message.senderName||this.#t('formerUser')}</strong><time datetime=${message.createdUtc}>${this.#date(message.createdUtc)}</time></div><p>${message.body}</p></article>`;}
  #readVisible=()=>{
    if(this._flow||!this._data?.open)return;
    const root=this.shadowRoot?.querySelector<HTMLElement>('.messages');if(!root)return;
    const bounds=root.getBoundingClientRect();let sequence=0;
    root.querySelectorAll<HTMLElement>('[data-sequence]').forEach(el=>{const rect=el.getBoundingClientRect();if(rect.bottom>bounds.top&&rect.top<bounds.bottom)sequence=Math.max(sequence,Number(el.dataset.sequence));});
    if(sequence)void this.#context?.markDisplayed(sequence);
  };
  protected override updated(){
    const data=this._data;if(!data?.open)return;
    const root=this.shadowRoot?.querySelector<HTMLElement>('.messages');if(!root)return;
    const last=data.messages.at(-1)?.id;
    const threadChanged=this.#lastThread!==data.selected;
    if(last&&(threadChanged||(!this.#lastMessage&&data.messages.length)||root.scrollHeight-root.scrollTop-root.clientHeight<100)){if(last!==this.#lastMessage)root.scrollTop=root.scrollHeight;}
    this.#lastThread=data.selected;this.#lastMessage=last;
    const key=`${data.selected}:${data.messages.map(x=>x.id).join(',')}`;
    if(key!==this.#observed){this.#observed=key;this.#observer?.disconnect();this.#observer=new IntersectionObserver(this.#readVisible,{root,threshold:0.1});root.querySelectorAll('[data-sequence]').forEach(el=>this.#observer?.observe(el));}
    this.#readVisible();
  }
  static override styles=css`
    :host{display:block;height:100%;font:inherit;color:var(--uui-color-text)}.panel-content{height:100%;min-height:0;display:flex;flex-direction:column}uui-button{font:inherit}dialog{font:inherit;color:var(--uui-color-text);background:var(--uui-color-surface);border:1px solid var(--uui-color-border);box-shadow:var(--uui-shadow-depth-5);padding:0}h2{font-size:18px;margin:0}h3{font-size:20px;line-height:1.3;margin:12px 0;overflow-wrap:anywhere}.live{padding:8px 16px;background:var(--uui-color-surface-alt);font-size:12px}.list-tools{padding:16px 16px 0;display:grid;gap:14px}.list-toolbar{display:flex;align-items:center;gap:12px}.list-toolbar>uui-button{flex-shrink:0}.list-toolbar>uui-input{flex:1;min-width:0}.conversation-header{display:flex;align-items:center;gap:8px;min-width:0;width:100%;padding:0 16px;box-sizing:border-box}.conversation-header h3{font-size:16px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:0}uui-input,uui-textarea{width:100%}.filters{display:flex;gap:18px;border-bottom:1px solid var(--uui-color-border)}.filters button{appearance:none;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--uui-color-text-alt);padding:8px 0;cursor:pointer;font:inherit}.filters button.selected{border-color:var(--uui-color-selected);color:var(--uui-color-text);font-weight:700}.conversation-list{overflow:auto;flex:1}.conversation{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--uui-color-border);background:var(--uui-color-surface);color:var(--uui-color-text);padding:18px 20px;cursor:pointer;font:inherit}.conversation:hover,.conversation:focus-visible{background:var(--uui-color-surface-emphasis)}.conversation.unread{box-shadow:inset 3px 0 var(--uui-color-selected)}.row{display:flex;gap:12px;align-items:baseline;justify-content:space-between}.row strong{overflow-wrap:anywhere}.count{border-radius:12px;background:var(--uui-color-selected);color:var(--uui-color-selected-contrast);font-size:11px;font-weight:700;padding:2px 6px}.preview{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:7px 0;color:var(--uui-color-text-alt)}.meta,time{font-size:11px;color:var(--uui-color-text-alt)}.meta>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta time{flex-shrink:0}umb-icon{vertical-align:middle}.empty{padding:32px 24px;color:var(--uui-color-text-alt);text-align:center}.empty p{max-width:28ch;margin:10px auto}.thread-head{padding:8px 16px 12px;border-bottom:1px solid var(--uui-color-border)}.thread-head>uui-button{margin-left:-10px}.participants{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--uui-color-text-alt)}.participants i{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:var(--uui-color-border)}.participants i.online{background:var(--uui-color-positive)}.thread-actions{display:flex;flex-wrap:wrap;gap:2px;margin:0;font-size:11px}.messages{min-height:0;overflow:auto;overscroll-behavior:contain;flex:1;padding:18px;background:var(--uui-color-surface-alt)}.message{padding:14px;background:var(--uui-color-surface);border:1px solid var(--uui-color-border);border-radius:var(--uui-border-radius);margin-bottom:12px;overflow-wrap:anywhere}.message strong{font-size:12px}.message p{white-space:pre-wrap;line-height:1.55;margin:8px 0 0}.message time{white-space:nowrap}.typing{font-size:11px;color:var(--uui-color-text-alt);padding:2px 18px;min-height:18px}.composer{padding:0 16px 14px}.composer uui-textarea{min-height:75px}.composer-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px}.composer-foot small{color:var(--uui-color-text-alt)}.former-note,.hint{font-size:12px;color:var(--uui-color-text-alt);line-height:1.5}.error{padding:12px 16px;display:flex;gap:8px;align-items:center;justify-content:space-between;background:var(--uui-color-danger);color:var(--uui-color-danger-contrast);font-size:12px}.error uui-button{flex-shrink:0}button:focus-visible,input:focus-visible{outline:2px solid var(--uui-color-focus);outline-offset:2px}
    @media(max-width:500px){.thread-actions{font-size:10px}.message .row{flex-wrap:wrap;gap:3px}}`;
}
export default MessengerSidebarElement;
