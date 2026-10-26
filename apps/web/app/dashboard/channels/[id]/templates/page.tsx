import TemplatesPanel from '../../../../../components/workspace/TemplatesPanel';
export default function Page({ params }: { params: { id: string } }) {
  return (
    <main>
      <TemplatesPanel params={params} />
    </main>
  );
}
