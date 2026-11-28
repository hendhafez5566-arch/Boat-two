import Console from './PlatformConsole';
import { API } from '../../lib/api';
import type { BillingPlan } from '../../lib/billing-display';
export const dynamic='force-dynamic';
export default async function Platform(){
 const designReview=process.env.RAILWAY_ENVIRONMENT_NAME==='preview'&&process.env.PLATFORM_DESIGN_REVIEW_OPEN==='true';
 let designPlans:BillingPlan[]|null=null;
 if(designReview)try{
  const res=await fetch(API+'/plans',{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(res.ok){const data=await res.json();if(Array.isArray(data))designPlans=data;}
 }catch{/* No real customer or operator data is loaded. */}
 return <Console designReview={designReview} designPlans={designPlans}/>;
}
