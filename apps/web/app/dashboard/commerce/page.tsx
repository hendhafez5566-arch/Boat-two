import Panel from '../../../components/workspace/CommercePanel';

type Query = Record<string, string | string[] | undefined>;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const conversationId = typeof query.conversation === 'string' ? query.conversation : '';
  const channelId = typeof query.channel === 'string' ? query.channel : '';
  const orderId = typeof query.order === 'string' && uuid.test(query.order) ? query.order : '';
  const status = typeof query.status === 'string' ? query.status : '';
  const orderOrigin = uuid.test(conversationId) && uuid.test(channelId)
    ? { conversationId, channelId }
    : undefined;
  const openOrders = query.tab === 'orders' || Boolean(orderOrigin) || Boolean(orderId);
  return (
    <main>
      <Panel
        key={JSON.stringify([openOrders, orderId, status, orderOrigin])}
        openOrders={openOrders}
        orderId={orderId}
        orderOrigin={orderOrigin}
      />
    </main>
  );
}
