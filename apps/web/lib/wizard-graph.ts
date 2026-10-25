import type { Graph, GNode } from './flow-types';
export type WizardChoice = {title: string; reply: string; action?: 'message' | 'card' | 'route' | 'question' | 'handoff'; url?: string; imageUrl?: string; saveAs?: string; targetId?: string};
export function buildWizardGraph(source: Graph, welcome: string, choices: WizardChoice[]): Graph {
  const graph: Graph = JSON.parse(JSON.stringify(source));
  const prefix = '__boat_wizard_';
  const old = graph.nodes.find(node => node.id === prefix + 'welcome');
  const next = old?.edges?.fallback ?? old?.edges?.next ?? graph.startNodeId;
  graph.nodes = graph.nodes.filter(node => !node.id.startsWith(prefix));
  const buttons = choices.filter(choice => choice.title.trim());
  const edges: Record<string,string> = buttons.length ? {fallback:next} : {next};
  buttons.forEach((choice,index) => {
    const id = prefix+'reply_'+index, action = choice.action || 'message';
    if (action === 'route') {
      const target = choice.targetId || next;
      if (!graph.nodes.some(node => node.id === target)) throw new Error('المسار المحدد غير موجود؛ اختر خطوة موجودة في القالب.');
      edges['option:'+id] = target; return;
    }
    edges['option:'+id] = id;
    let node: GNode = {id,type:'message',position:{x:80+index*650,y:400},data:{text:choice.reply},edges:{next}};
    if (action === 'card') node={...node,type:'cta_url',data:{text:choice.reply,buttonText:choice.title,url:choice.url || '',imageUrl:choice.imageUrl || ''}};
    if (action === 'question') node={...node,type:'question',data:{text:choice.reply,answerType:'text',saveAs:choice.saveAs || 'answer_'+(index+1),retries:2},edges:{ok:next,fail:next}};
    if (action === 'handoff') node={...node,type:'handoff',data:{message:choice.reply},edges:{}};
    graph.nodes.push(node);
  });
  graph.nodes.unshift({id:prefix+'welcome',type:'message',position:{x:200,y:0},data:{text:welcome,...(buttons.length?{buttons:buttons.map((choice,index)=>({id:prefix+'reply_'+index,title:choice.title}))}:{})},edges});
  graph.startNodeId=prefix+'welcome';return graph;
}
