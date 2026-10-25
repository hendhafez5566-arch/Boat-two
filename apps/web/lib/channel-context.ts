export function selectedChannel(search:string):string {
  const value=new URLSearchParams(search).get('channelId')??'';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:'';
}
/** An empty binding means all channels in the existing runtime. */
export function matchesFlowChannel(bindings:string[]|undefined,channelId:string):boolean {
  return !channelId||!bindings?.length||bindings.includes(channelId);
}
export function channelHref(path:string,channelId:string):string {
  const [pathname,search='']=path.split('?');const query=new URLSearchParams(search);
  if(channelId)query.set('channelId',channelId);else query.delete('channelId');
  return pathname+(query.size?'?'+query.toString():'');
}
