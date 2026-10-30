import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type Cliente, formatBRL } from "@/lib/documents";
import { openPrintDocument } from "@/lib/print-doc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = { client: Cliente | null; onClose: () => void; onSaved: () => void };
type Form = { nome:string; nacionalidade:string; estado_civil:string; profissao:string; rg:string; cpf_cnpj:string; endereco:string; bairro:string; cidade:string; uf:string; cep:string; objeto_servico:string; representado_nome:string; honorarios_total:string; entrada_valor:string; entrada_data:string; parcelas_quantidade:string; parcela_valor:string; primeiro_vencimento:string; cidade_assinatura:string; data_assinatura:string; testemunha_1:string; testemunha_2:string };

const hoje = () => format(new Date(), "yyyy-MM-dd");
const initial = (c: Cliente): Form => ({
  nome:c.nome, nacionalidade:c.nacionalidade ?? "brasileiro", estado_civil:c.estado_civil ?? "",
  profissao:c.profissao ?? "", rg:c.rg ?? "", cpf_cnpj:c.cpf_cnpj ?? "", endereco:c.endereco ?? "",
  bairro:c.bairro ?? "", cidade:c.cidade ?? "", uf:c.uf ?? "MG", cep:c.cep ?? "",
  objeto_servico:c.tipo_acao ?? "", representado_nome:c.nome, honorarios_total:"0",
  entrada_valor:"0", entrada_data:hoje(), parcelas_quantidade:"0", parcela_valor:"0",
  primeiro_vencimento:format(new Date(new Date().getFullYear(),new Date().getMonth()+1,1),"yyyy-MM-dd"),
  cidade_assinatura:"Belo Horizonte", data_assinatura:hoje(), testemunha_1:"", testemunha_2:""
});
const brDate = (s:string) => s ? format(new Date(s+"T12:00:00"),"dd/MM/yyyy") : "";
const esc = (s:unknown) => String(s ?? "").replace(/[&<>"']/g,c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] ?? c));
function monthlyDates(first:string,count:number) {
  if (!first || count<=0) return [];
  const p=first.split("-").map(Number);
  return Array.from({length:count},(_,i)=>{
    const m=new Date(p[0],p[1]-1+i,1,12);
    const last=new Date(m.getFullYear(),m.getMonth()+1,0,12).getDate();
    return format(new Date(m.getFullYear(),m.getMonth(),Math.min(p[2],last),12),"yyyy-MM-dd");
  });
}
function contractHtml(f:Form, dates:string[]) {
  const entrada=Number(f.entrada_valor||0), total=Number(f.honorarios_total||0), parcela=Number(f.parcela_valor||0);
  const pagamento = "Em remuneração pelos serviços profissionais ora contratados serão devidos honorários advocatícios no importe de "+formatBRL(total)+". "+
    (entrada>0 ? "Sendo uma entrada no valor de "+formatBRL(entrada)+", paga na data de "+brDate(f.entrada_data)+". " : "Não haverá pagamento de entrada. ")+
    (dates.length ? "Serão devidas mais "+dates.length+" parcelas no valor de "+formatBRL(parcela)+", com os seguintes vencimentos: "+dates.map(brDate).join(", ")+". " : "Não haverá parcelas adicionais.");
  const p = [];
  p.push("<p>Pelo presente instrumento particular, que entre si fazem, de um lado como cliente/contratante, "+esc(f.nome)+", "+esc(f.nacionalidade)+", "+esc(f.estado_civil)+", "+esc(f.profissao)+", portador da CI nº "+esc(f.rg)+", inscrito no CPF de n.º "+esc(f.cpf_cnpj)+", com endereço a "+esc(f.endereco)+", Bairro "+esc(f.bairro)+" - "+esc(f.cidade)+"/"+esc(f.uf)+", CEP "+esc(f.cep)+", e de outro lado, como prestador de serviço/contratado JOAQUIM DIMAS GONÇALVES, brasileiro, separado judicialmente, advogado, inscrito na OAB/MG sob o n.º 37.610, com escritório na Avenida Amazonas, 115 / 1.717 – Centro – CEP. 30.180-902 - Belo Horizonte (MG), ajusta entre si, com fulcro no artigo 22 da Lei nº 8.906/94, mediante as seguintes cláusulas e condições:</p>");
  p.push("<p><b>Cláusula Primeira -</b> O Contratado compromete-se, em cumprimento ao mandato recebido, para propor "+esc(f.objeto_servico)+" em nome de "+esc(f.representado_nome)+".</p>");
  p.push("<p><b>Cláusula Segunda -</b> O Contratante, que reconhece já haver recebido a orientação preventiva, comportamental e jurídica para a consecução dos serviços, fornecerá ao Contratado os documentos e meios necessários à comprovação processual do seu pretendido direito, bem como pagará as despesas judiciais que decorrerem da causa.</p>");
  p.push("<p><b>Cláusula Terceira -</b> "+esc(pagamento)+"</p>");
  p.push("<p>O atraso no pagamento importará na cobrança de multa de 5% (cinco) por cento ao mês, mais R$0,25 (vinte e cinco centavos) ao dia. As despesas com deslocamento, xerox e protocolo postal são por conta do contratante.</p>");
  p.push("<p>Caso haja desistência dos serviços advocatícios após a contratação, fica acordado que os valores pagos como entradas não serão devolvidas, uma vez que os mesmos ficarão pelo atendimento realizado e custas operacionais (análise do processo, ida ao fórum, dentro outros).</p>");
  p.push("<p><b>Cláusula Quarta –</b> Outras medidas judiciais necessárias, incidentais ou não, diretas ou indiretas, decorrentes da causa ora contratada, devem ter novos honorários estimados com a anuência do Contratante.</p>");
  p.push("<p><b>Cláusula Quinta -</b> Considerar-se-ão vencidos e imediatamente exigíveis os honorários ora contratados, no caso de o Contratante vir a revogar ou cassar o mandato outorgado ao Contratado ou a exigir o substabelecimento sem reservas, sem que este tenha, para isso, dado causa.</p>");
  p.push("<p><b>Cláusula Sexta -</b> Os honorários de condenação (sucumbência), se houver, pertencerão ao Advogado, sem exclusão dos que ora são contratados, de conformidade com os artigos 23 da Lei nº 8.906/94 e 35, parágrafo 1º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil.</p>");
  p.push("<p><b>Cláusula Sétima –</b> O Advogado Contratado fica autorizado a deduzir, dos valores recebidos para o Contratante, a importância referente a honorários e despesas, mediante prestação de contas, conforme preceitua o artigo 35, §2º, do Código de Ética e Disciplina da Ordem dos Advogados do Brasil.</p>");
  p.push("<p><b>Cláusula Oitava -</b> O Contratante pagará ainda as custas e despesas judiciais, despesas de viagens, de extração de fotocópias, de autenticações de documentos, de expedição de certidões, de interurbanos e quaisquer outras que decorrerem dos serviços ora contratados, mediante apresentação de demonstrativos analíticos pelo advogado Contatado.</p>");
  p.push("<p><b>Cláusula Nona -</b> A atuação profissional do Advogado Contratado ficará restrita ao Juízo da causa, em Primeira Instância. A indicação de advogados para acompanhamento de recursos nos Tribunais Superiores, bem como para acompanhamento de eventuais cartas precatórias será do Contratante, caso este prefira os serviços de outros profissionais da sua confiança pessoal.</p>");
  p.push("<p><b>Cláusula Décima -</b> Elegem as partes o foro da Comarca de Belo Horizonte (MG) para dirimir controvérsias que possam surgir do presente contrato, podendo o Advogado optar pelo foro de residência do Contratante.</p>");
  p.push("<p>E por estarem assim justos e contratados, assinam o presente em 02 (duas) vias de igual forma e teor, na presença de duas testemunhas, para que possa produzir todos os seus efeitos de direito.</p>");
  p.push("<p class='center'>"+esc(f.cidade_assinatura)+", "+brDate(f.data_assinatura)+".</p><div class='sign'>Contratante:<br>"+esc(f.nome)+"<br>______________________________________________<br><br>Contratado:<br>JOAQUIM DIMAS GONÇALVES<br>______________________________________________<br><br>Testemunhas:<br>"+esc(f.testemunha_1)+" ______________________________<br>"+esc(f.testemunha_2)+" ______________________________</div>");
  return "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>Contrato - "+esc(f.nome)+"</title><style>@page{size:A4;margin:38mm 22mm 22mm}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#222}.header{position:fixed;top:-29mm;left:-22mm;right:-22mm;box-sizing:border-box;text-align:center;background:#0F1729;padding:7mm 10mm 5mm;font-family:Arial,sans-serif;font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact}.header div:first-child{font-size:10pt;color:#C7CFE6}.header div:nth-child(2){font-size:16pt;letter-spacing:1px;color:#FFFFFF}.header div:last-child{font-size:11pt;color:#B8C7FF}.content p{text-align:justify;text-indent:1.1cm;margin:0 0 15px}.center{text-align:center!important;margin-top:25px!important}.sign{margin-top:30px;line-height:1.45;page-break-inside:avoid}</style></head><body><header class='header'><div>Sistema de Gestão Judicial</div><div>J DIMAS GONÇALVES</div><div>CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS</div></header><main class='content'>"+p.join("")+"</main></body></html>";
}

export function ClientContractModal({ client, onClose, onSaved }: Props) {
  const [form,setForm]=useState<Form|null>(null);
  const [saving,setSaving]=useState(false);
  const [dates,setDates]=useState<string[]>([]);
  useEffect(()=>{ if(client) setForm(initial(client)); else setForm(null); },[client?.id]);
  const count=Math.max(0,Math.min(120,Number(form?.parcelas_quantidade||0)));
  useEffect(()=>{ setDates(monthlyDates(form?.primeiro_vencimento||"",count)); },[form?.primeiro_vencimento,count]);
  if (!client || !form) return null;
  const set=(key:keyof Form,value:string)=>setForm(old=>old?({...old,[key]:value}):old);
  const total=Number(form.honorarios_total||0), entry=Number(form.entrada_valor||0), installment=Number(form.parcela_valor||0);
  const sum=Math.round((entry+installment*count)*100)/100;
  const mismatch=Math.abs(sum-total)>0.01;
  const inputs:Array<[keyof Form,string,string]>=[
    ["nome","Nome completo","text"],["nacionalidade","Nacionalidade","text"],["estado_civil","Estado civil","text"],
    ["profissao","Profissão","text"],["rg","RG / CI","text"],["cpf_cnpj","CPF / CNPJ","text"],
    ["endereco","Endereço completo (rua e número)","text"],["bairro","Bairro","text"],["cidade","Cidade","text"],
    ["uf","UF","text"],["cep","CEP","text"],["representado_nome","Pessoa em cujo nome será proposta a ação","text"],
    ["honorarios_total","Honorários totais (R$)","number"],["entrada_valor","Entrada (R$)","number"],
    ["entrada_data","Data da entrada","date"],["parcelas_quantidade","Quantidade de parcelas","number"],
    ["parcela_valor","Valor de cada parcela (R$)","number"],["primeiro_vencimento","Primeiro vencimento","date"],
    ["cidade_assinatura","Cidade da assinatura","text"],["data_assinatura","Data da assinatura","date"],
    ["testemunha_1","Testemunha 1 (opcional)","text"],["testemunha_2","Testemunha 2 (opcional)","text"]
  ];
  async function save() {
    if(!form.nome.trim()||!form.nacionalidade.trim()||!form.estado_civil.trim()||!form.profissao.trim()||!form.rg.trim()||!form.cpf_cnpj.trim()||!form.endereco.trim()||!form.bairro.trim()||!form.cidade.trim()||!form.uf.trim()||!form.cep.trim()||!form.objeto_servico.trim()||!form.representado_nome.trim()) return toast.error("Preencha todos os dados obrigatórios do contratante e do serviço.");
    if(entry>0&&!form.entrada_data) return toast.error("Informe a data da entrada.");
    if(count>0&&(dates.length!==count||dates.some(d=>!d)||!form.parcela_valor||installment<=0)) return toast.error("Informe o valor e os vencimentos de todas as parcelas.");
    if(mismatch) return toast.error("A entrada somada às parcelas deve ser igual aos honorários totais.");
    setSaving(true);
    try{
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user) throw new Error("Sessão expirada. Entre novamente.");
      const clientUpdate={nome:form.nome.trim(),nacionalidade:form.nacionalidade.trim(),estado_civil:form.estado_civil.trim(),profissao:form.profissao.trim(),rg:form.rg.trim(),cpf_cnpj:form.cpf_cnpj.trim(),endereco:form.endereco.trim(),bairro:form.bairro.trim(),cidade:form.cidade.trim(),uf:form.uf.trim().toUpperCase(),cep:form.cep.trim()};
      const {error:clientError}=await (supabase as any).from("clients").update(clientUpdate).eq("id",client.id);
      if(clientError) throw clientError;
      const html=contractHtml(form,dates);
      const snapshot={contratante:clientUpdate,contrato:{objeto_servico:form.objeto_servico,representado_nome:form.representado_nome,honorarios_total:total,entrada_valor:entry,entrada_data:form.entrada_data||null,parcelas_quantidade:count,parcela_valor:installment,parcelas_vencimentos:dates,cidade_assinatura:form.cidade_assinatura,data_assinatura:form.data_assinatura,testemunha_1:form.testemunha_1,testemunha_2:form.testemunha_2},contratado:"JOAQUIM DIMAS GONÇALVES - OAB/MG 37.610"};
      const {error:saveError}=await (supabase as any).from("client_contracts").insert({client_id:client.id,objeto_servico:form.objeto_servico,representado_nome:form.representado_nome,honorarios_total:total,entrada_valor:entry,entrada_data:entry>0?form.entrada_data:null,parcelas_quantidade:count,parcela_valor:installment,parcelas_vencimentos:dates,cidade_assinatura:form.cidade_assinatura,data_assinatura:form.data_assinatura,testemunha_1:form.testemunha_1||null,testemunha_2:form.testemunha_2||null,contrato_html:html,dados_snapshot:snapshot,created_by:userData.user.id});
      if(saveError) throw saveError;
      onSaved();
      const opened = openPrintDocument(html);
      if (!opened) toast.error("Contrato salvo, mas não foi possível abrir a impressão. Reabra pela ficha do cliente.");
      else toast.success("Contrato salvo e preparado para impressão.");
      onClose();
    }catch(error){toast.error("Não foi possível gerar o contrato.",{description:error instanceof Error?error.message:"Erro inesperado."});}
    finally{setSaving(false);}
  }
  return <Dialog open={!!client} onOpenChange={open=>!open&&onClose()}><DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5"/>Gerar contrato — {client.nome}</DialogTitle></DialogHeader><div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Dados do contratante</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{inputs.slice(0,11).map(([key,label,type])=><div className="space-y-1" key={key}><Label>{label}</Label><Input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Serviço jurídico</CardTitle></CardHeader><CardContent className="grid gap-3"><div className="space-y-1"><Label>Objeto / serviço contratado</Label><Textarea rows={2} value={form.objeto_servico} onChange={e=>set("objeto_servico",e.target.value)} /></div><div className="space-y-1"><Label>Pessoa representada</Label><Input value={form.representado_nome} onChange={e=>set("representado_nome",e.target.value)} /></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Honorários e pagamento</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{inputs.slice(12,18).map(([key,label,type])=><div className="space-y-1" key={key}><Label>{label}</Label><Input type={type} min={type==="number"?"0":undefined} step={type==="number"?"0.01":undefined} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>)}<div className="sm:col-span-2 rounded-md border p-3 text-sm"><p>Vencimentos calculados automaticamente:</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{dates.map((d,i)=><div key={i} className="space-y-1"><Label>{i+1}ª parcela</Label><Input type="date" value={d} onChange={e=>setDates(old=>old.map((item,index)=>index===i?e.target.value:item))} /></div>)}</div>{!dates.length&&<p className="mt-1 text-muted-foreground">Sem parcelas adicionais.</p>}<p className="mt-2 font-medium">Entrada + parcelas: {formatBRL(sum)} / Total: {formatBRL(total)}</p>{mismatch&&<p className="mt-1 text-destructive">A soma ainda não corresponde aos honorários totais.</p>}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Assinatura e testemunhas</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{inputs.slice(18).map(([key,label,type])=><div className="space-y-1" key={key}><Label>{label}</Label><Input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>)}</CardContent></Card><p className="text-xs text-muted-foreground">Os dados pessoais serão atualizados no cadastro deste cliente. As condições e o texto do contrato ficarão guardados como um registro independente, sem alterar contratos anteriores.</p></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving||mismatch}>{saving?"Salvando...":"Gerar e salvar contrato"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function ClientContractsHistory({ clientId }: { clientId: string }) {
  const {data:contracts=[],isLoading}=useQuery({queryKey:["client-contracts",clientId],queryFn:async()=>{
    const {data,error}=await (supabase as any).from("client_contracts").select("id,objeto_servico,honorarios_total,data_assinatura,contrato_html,created_at").eq("client_id",clientId).order("created_at",{ascending:false});
    if(error) throw error;
    return (data??[]) as SavedContract[];
  }});
  return <section><h3 className="mb-2 text-sm font-semibold">Contratos</h3><div className="space-y-2">{isLoading?<p className="text-sm text-muted-foreground">Carregando contratos...</p>:contracts.length===0?<p className="text-sm text-muted-foreground">Nenhum contrato gerado para este cliente.</p>:contracts.map(c=><div key={c.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{c.objeto_servico}</p><p className="text-xs text-muted-foreground">{brDate(c.data_assinatura)} · {formatBRL(Number(c.honorarios_total))}</p></div><Button size="sm" variant="outline" onClick={()=>openPrintDocument(c.contrato_html)}><Printer className="mr-2 h-4 w-4"/>Reimprimir</Button></div>)}</div></section>;
}
