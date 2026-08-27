export class MemoryAuthorizationRepository{
  constructor(){this.requests=[];this.reviews=[];}
  save(request){this.requests.push(Object.freeze({...request}));return request;}
  find(query){return this.requests.find(item=>item.id===query||item.customer_id===query)||null;}
  saveReview(review){this.reviews.push(review);return review;}
}
