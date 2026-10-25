import {createHash} from 'node:crypto';
export function providerRequest(provider:string,config:Record<string,unknown>,credential:string,payload:Record<string,unknown>){
 const headers:Record<string,string>={'Content-Type':'application/json'};let method='POST',url=String(config.url??''),body:unknown=payload;
 if(provider==='mailchimp'){const server=credential.split('-').pop();if(!/^us\d+$/.test(server??''))throw new Error('Mailchimp API key must include its server suffix');if(!config.listId)throw new Error('List ID required');url=`https://${server}.api.mailchimp.com/3.0/lists/${encodeURIComponent(String(config.listId))}/members/${createHash('md5').update(String(payload.email).toLowerCase()).digest('hex')}`;method='PUT';headers.Authorization='Basic '+Buffer.from('boat:'+credential).toString('base64');body={email_address:payload.email,status:'subscribed',merge_fields:{FNAME:payload.name??''}};}
 else if(provider==='brevo'){url='https://api.brevo.com/v3/contacts';headers['api-key']=credential;const list=Number(config.listId);if(!Number.isInteger(list)||list<1)throw new Error('Positive Brevo list ID required');body={email:payload.email,attributes:{FIRSTNAME:payload.name??''},listIds:[list],updateEnabled:true};}
 else if(provider==='activecampaign'){url=url.replace(/\/$/,'')+'/api/3/contact/sync';headers['Api-Token']=credential;body={contact:{email:payload.email,firstName:payload.name??''}};}
 else if(provider==='mautic'){url=url.replace(/\/$/,'')+'/api/contacts/new';headers.Authorization='Basic '+Buffer.from(credential).toString('base64');body={email:payload.email,firstname:payload.name??''};}
 else if(provider==='salla'){url='https://api.salla.dev/admin/v2/products';method='GET';body=undefined;headers.Authorization='Bearer '+credential;}
 else headers.Authorization='Bearer '+credential;
 if(!url.startsWith('https://'))throw new Error('HTTPS provider endpoint required');
 return{method,url,headers,body:body===undefined?undefined:JSON.stringify(body),timeoutMs:15000};
}
