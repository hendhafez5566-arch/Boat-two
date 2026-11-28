import type Stripe from 'stripe';
export function matchesCatalogPrice(price:Stripe.Price,expected:{amountCents:number;currency:string;interval:string}):boolean{
 return price.active===true&&price.type==='recurring'&&price.billing_scheme==='per_unit'&&price.unit_amount===expected.amountCents&&price.currency===expected.currency&&price.recurring?.interval===expected.interval&&price.recurring.interval_count===1&&price.recurring.usage_type==='licensed';
}
