import TemplatesPanel from '../../../../../components/workspace/TemplatesPanel';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const route = await params;
  return (
    <main>
      <TemplatesPanel params={route} />
    </main>
  );
}
