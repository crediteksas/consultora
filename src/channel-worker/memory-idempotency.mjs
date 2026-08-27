export class MemoryMessageIdempotency{
  #processed=new Set();
  has(messageId){return this.#processed.has(messageId);}
  remember(messageId){if(messageId)this.#processed.add(messageId);}
  get size(){return this.#processed.size;}
}
