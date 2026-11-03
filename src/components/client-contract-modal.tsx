import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Printer, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type Cliente, formatBRL, METODOS_PAGAMENTO } from "@/lib/documents";
import { openPrintDocument } from "@/lib/print-doc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/use-profile";

type Props = { client: Cliente | null; onClose: () => void; onSaved: () => void };
type Form = { nome:string; nacionalidade:string; estado_civil:string; profissao:string; rg:string; cpf_cnpj:string; endereco:string; bairro:string; cidade:string; uf:string; cep:string; objeto_servico:string; representado_nome:string; honorarios_total:string; entrada_valor:string; entrada_data:string; entrada_metodo_pagamento:string; parcelas_quantidade:string; parcela_valor:string; primeiro_vencimento:string; cidade_assinatura:string; data_assinatura:string; testemunha_1:string; testemunha_2:string };

const hoje = () => format(new Date(), "yyyy-MM-dd");
const initial = (c: Cliente): Form => ({
  nome:c.nome, nacionalidade:c.nacionalidade ?? "brasileiro", estado_civil:c.estado_civil ?? "",
  profissao:c.profissao ?? "", rg:c.rg ?? "", cpf_cnpj:c.cpf_cnpj ?? "", endereco:c.endereco ?? "",
  bairro:c.bairro ?? "", cidade:c.cidade ?? "", uf:c.uf ?? "MG", cep:c.cep ?? "",
  objeto_servico:c.tipo_acao ?? "", representado_nome:c.nome, honorarios_total:"0",
  entrada_valor:"0", entrada_data:hoje(), entrada_metodo_pagamento:"", parcelas_quantidade:"0", parcela_valor:"0",
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

function underThousand(n:number): string {
  const units="zero|um|dois|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove".split("|");
  const tens=["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
  const hundreds=["","cento","duzentos","trezentos","quatrocentos","quinhentos","seiscentos","setecentos","oitocentos","novecentos"];
  if(n===0) return "zero";
  if(n===100) return "cem";
  if(n<20) return units[n];
  if(n<100) return tens[Math.floor(n/10)]+(n%10?" e "+units[n%10]:"");
  return hundreds[Math.floor(n/100)]+(n%100?" e "+underThousand(n%100):"");
}
function numberWords(value:number): string {
  let n=Math.floor(Math.abs(value));
  if(n===0) return "zero";
  const parts:string[]=[];
  const billions=Math.floor(n/1_000_000_000); n%=1_000_000_000;
  const millions=Math.floor(n/1_000_000); n%=1_000_000;
  const thousands=Math.floor(n/1_000); n%=1_000;
  if(billions) parts.push((billions===1?"um":underThousand(billions))+(billions===1?" bilhão":" bilhões"));
  if(millions) parts.push((millions===1?"um":underThousand(millions))+(millions===1?" milhão":" milhões"));
  if(thousands) parts.push(thousands===1?"mil":underThousand(thousands)+" mil");
  if(n) parts.push(underThousand(n));
  return parts.join(" e ");
}
function currencyWords(value:number): string {
  const cents=Math.round(Math.abs(value)*100);
  const reais=Math.floor(cents/100);
  const centavos=cents%100;
  let result=numberWords(reais)+(reais===1?" real":" reais");
  if(centavos) result+=" e "+numberWords(centavos)+(centavos===1?" centavo":" centavos");
  return result;
}

// Normaliza tanto contratos novos quanto HTMLs antigos já salvos no histórico.
function prepareContractHtmlForPrint(html: string) {
  if (typeof DOMParser === "undefined") return html;

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const pages = Array.from(parsed.querySelectorAll<HTMLElement>(".contract-page"));

  // Remove cabeçalhos antigos somente do contrato (nunca do recibo).
  Array.from(
    parsed.body.querySelectorAll<HTMLElement>("header, .header, .contract-header"),
  )
    .filter((element) => !element.closest(".receipt-page"))
    .forEach((element) => element.remove());

  // Remove o marcador literal "\\n" que aparecia como conteúdo no topo do PDF.
  Array.from(parsed.body.querySelectorAll<HTMLElement>("p")).forEach((paragraph) => {
    const value = paragraph.textContent?.trim() ?? "";
    if (value === "\\n" || value === "") paragraph.remove();
  });

  const createHeader = () => {
    const header = parsed.createElement("div");
    header.className = "contract-header";
    header.setAttribute("role", "banner");
    header.innerHTML = [
      '<div class="sys">Sistema de Gestão Judicial</div>',
      '<div class="brand">J DIMAS GONÇALVES</div>',
      '<div class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS</div>',
    ].join("");

    header.style.cssText = [
      "display:flex!important",
      "position:static!important",
      "float:none!important",
      "clear:both!important",
      "transform:none!important",
      "visibility:visible!important",
      "opacity:1!important",
      "flex-direction:column!important",
      "align-items:center!important",
      "justify-content:center!important",
      "width:100%!important",
      "min-height:25mm!important",
      "height:auto!important",
      "box-sizing:border-box!important",
      "margin:0 0 7mm!important",
      "padding:4mm 8mm!important",
      "text-align:center!important",
      "background:#0F1729!important",
      "color:#fff!important",
      "-webkit-print-color-adjust:exact!important",
      "print-color-adjust:exact!important",
      "break-inside:avoid!important",
      "page-break-inside:avoid!important",
    ].join(";");

    const system = header.querySelector<HTMLElement>(".sys")!;
    system.style.cssText = "font-size:9pt!important;letter-spacing:1.2px!important;color:#C7CFE6!important;font-weight:400!important";
    const brand = header.querySelector<HTMLElement>(".brand")!;
    brand.style.cssText = "font-size:15pt!important;letter-spacing:1px!important;color:#fff!important;font-weight:700!important;margin:1mm 0!important";
    const title = header.querySelector<HTMLElement>(".doc-title")!;
    title.style.cssText = "font-size:10pt!important;letter-spacing:.4px!important;color:#B8C7FF!important;font-weight:700!important";
    return header;
  };

  if (pages.length > 0) {
    // Em documentos com páginas, o cabeçalho entra antes do primeiro texto
    // de cada seção, no fluxo normal da própria página.
    pages.forEach((page) => page.insertBefore(createHeader(), page.firstChild));
  } else {
    // Compatibilidade com contratos antigos que não tinham .contract-page:
    // o cabeçalho entra diretamente no início do documento, antes do texto.
    const contentHost =
      parsed.querySelector<HTMLElement>("main.content, main, .content") ?? parsed.body;
    contentHost.insertBefore(createHeader(), contentHost.firstChild);
  }

  const printFix = parsed.createElement("style");
  printFix.setAttribute("data-contract-print-fix", "true");
  printFix.textContent = [
    "@media print {",
    "@page { size:A4 portrait; margin:18mm 22mm 18mm !important; }",
    "html,body { margin:0 !important; padding:0 !important; background:#fff !important; }",
    "body { width:auto !important; font-family:Calibri,Arial,sans-serif !important; font-size:13pt !important; line-height:1.5 !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }",
    ".contract-page { display:block !important; position:static !important; float:none !important; width:auto !important; min-height:0 !important; height:auto !important; margin:0 !important; padding:0 !important; break-after:page !important; page-break-after:always !important; }",
    ".contract-page.is-last-contract-page { break-after:auto !important; page-break-after:auto !important; }",
    ".contract-header { display:flex !important; position:static !important; float:none !important; clear:both !important; transform:none !important; visibility:visible !important; opacity:1 !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; width:100% !important; min-height:25mm !important; height:auto !important; margin:0 0 7mm !important; padding:4mm 8mm !important; box-sizing:border-box !important; text-align:center !important; background:#0F1729 !important; color:#fff !important; break-inside:avoid !important; page-break-inside:avoid !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }",
    ".contract-header .sys { font-size:9pt !important; letter-spacing:1.2px !important; color:#C7CFE6 !important; font-weight:400 !important; }",
    ".contract-header .brand { font-size:15pt !important; letter-spacing:1px !important; color:#fff !important; font-weight:700 !important; margin:1mm 0 !important; }",
    ".contract-header .doc-title { font-size:10pt !important; letter-spacing:.4px !important; color:#B8C7FF !important; font-weight:700 !important; }",
    ".contract-page p, main.content p, body > p { font-family:Calibri,Arial,sans-serif !important; font-size:13pt !important; line-height:1.5 !important; text-align:justify !important; margin:0 0 14px !important; }",
    ".contract-page .center, main.content .center { text-align:center !important; }",
    ".contract-page .sign, main.content .sign { line-height:1.5 !important; }",
    ".receipt-page { break-before:page !important; page-break-before:always !important; }",
    "}",
  ].join(" ");
  parsed.head.appendChild(printFix);

  return "<!DOCTYPE html>" + parsed.documentElement.outerHTML;
}

function contractHtml(f:Form, dates:string[], numeroProcesso?: string | null) {
  const entrada=Number(f.entrada_valor||0), total=Number(f.honorarios_total||0), parcela=Number(f.parcela_valor||0);
  const pagamento = "Em remuneração pelos serviços profissionais ora contratados serão devidos honorários advocatícios no importe de "+formatBRL(total)+" ("+currencyWords(total)+"). "+
    (entrada>0 ? "Sendo uma entrada no valor de "+formatBRL(entrada)+" ("+currencyWords(entrada)+"), paga na data de "+brDate(f.entrada_data)+". " : "Não haverá pagamento de entrada. ")+
    (dates.length ? "Serão devidas mais "+dates.length+" parcelas no valor de "+formatBRL(parcela)+" ("+currencyWords(parcela)+"), com os seguintes vencimentos: "+dates.map(brDate).join(", ")+". " : "Não haverá parcelas adicionais.");
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
  const pageOne = p.slice(0, 5).join("");
  const pageTwo = p.slice(5, 10).join("");
  const pageThree = p.slice(10).join("");
  const reciboVia = (via: string) => `
    <article class="receipt-copy">
      <header class="contract-header">
        <div class="sys">Sistema de Gestão Judicial</div>
        <div class="brand">J DIMAS GONÇALVES</div>
        <div class="doc-title">RECIBO DE PAGAMENTO · ${esc(via)}</div>
      </header>
      <div class="receipt-data">
        <div class="receipt-field"><span class="receipt-label">Cliente / Pagador</span><strong>${esc(f.nome)}</strong></div>
        <div class="receipt-field"><span class="receipt-label">CPF</span><strong>${esc(f.cpf_cnpj)}</strong></div>
        <div class="receipt-field"><span class="receipt-label">Processo</span><strong>${esc(numeroProcesso?.trim() || "Sem número de processo")}</strong></div>
        <div class="receipt-field"><span class="receipt-label">Data do recebimento</span><strong>${brDate(f.entrada_data)}</strong></div>
        <div class="receipt-field"><span class="receipt-label">Forma de pagamento</span><strong>${esc(f.entrada_metodo_pagamento)}</strong></div>
        <div class="receipt-field"><span class="receipt-label">Referência</span><strong>Entrada dos honorários contratuais</strong></div>
        <div class="receipt-amount">Valor recebido: ${formatBRL(entrada)} (${currencyWords(entrada)})</div>
      </div>
      <p class="receipt-declaration">Declaramos, para os devidos fins, que recebemos de <strong>${esc(f.nome)}</strong> a importância de <strong>${formatBRL(entrada)} (${currencyWords(entrada)})</strong>, referente à entrada dos honorários previstos no contrato de prestação de serviços advocatícios, paga em ${brDate(f.entrada_data)}.</p>
      <div class="receipt-signatures">
        <div class="receipt-sign"><div class="line"></div><strong>JOAQUIM DIMAS GONÇALVES</strong><small>Recebedor · OAB/MG 37.610</small></div>
        <div class="receipt-sign"><div class="line"></div><strong>${esc(f.nome)}</strong><small>Pagador(a)</small></div>
      </div>
    </article>`;
  const recibo = entrada > 0 ? `
    <section class="receipt-page">
      ${reciboVia("1ª via — Escritório")}
      ${reciboVia("2ª via — Cliente")}
    </section>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contrato - ${esc(f.nome)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff;color:#222}
  body{font-family:Calibri,Arial,sans-serif;font-size:13pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4 portrait;margin:18mm 22mm 18mm}
  .contract-page{width:100%;break-after:page;page-break-after:always}
  .contract-page:last-child{break-after:auto;page-break-after:auto}
  .contract-header{
    position:static;display:flex;flex-direction:column;justify-content:center;align-items:center;
    width:100%;min-height:25mm;box-sizing:border-box;margin:0 0 7mm;padding:4mm 8mm;
    text-align:center;background:#0F1729;color:#fff;
    font-family:Calibri,Arial,sans-serif;font-weight:700;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  .contract-header .sys{font-size:9pt;letter-spacing:1.2px;color:#C7CFE6;font-weight:400}
  .contract-header .brand{font-size:15pt;letter-spacing:1px;color:#fff;margin:1mm 0}
  .contract-header .doc-title{font-size:10pt;letter-spacing:.4px;color:#B8C7FF}
  .content p{font-size:13pt;line-height:1.5;text-align:justify;text-indent:10mm;margin:0 0 14px;orphans:3;widows:3;hyphens:auto}
  .content .center{text-align:center;text-indent:0;margin-top:6mm;margin-bottom:8mm}
  .sign{margin-top:7mm;line-height:1.5;break-inside:avoid;page-break-inside:avoid}
  .receipt-page{break-before:page;page-break-before:always}
  .receipt-copy{border:1px solid #CBD5E1;padding:4mm 5mm;margin:0 0 5mm;break-inside:avoid;page-break-inside:avoid;font-size:10pt;line-height:1.25}
  .receipt-copy .contract-header{min-height:18mm;margin:0 0 4mm;padding:2mm 5mm}
  .receipt-copy .contract-header .brand{font-size:12pt}
  .receipt-copy .contract-header .doc-title{font-size:9pt}
  .receipt-data{display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}
  .receipt-label{display:block;font-size:8pt;color:#475569}
  .receipt-field strong{display:block;font-size:9.5pt}
  .receipt-amount{grid-column:1/-1;border:1px solid #CBD5E1;padding:2mm;font-size:13pt;font-weight:700}
  .receipt-declaration{text-align:justify;margin:3mm 0;font-size:9pt;line-height:1.35}
  .receipt-signatures{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:6mm}
  .receipt-sign .line{border-top:1px solid #334155;margin-bottom:1mm}
  .receipt-sign strong,.receipt-sign small{display:block;text-align:center}
  .receipt-sign strong{font-size:8.5pt}
  .receipt-sign small{font-size:7.5pt;color:#475569}
  @media screen{
    body{width:210mm;margin:0 auto;padding:18mm 22mm 18mm}
    .contract-page{min-height:265mm}
  }
</style></head><body>
<main class="content">
  <section class="contract-page">
    <header class="contract-header">
      <div class="sys">Sistema de Gestão Judicial</div>
      <div class="brand">J DIMAS GONÇALVES</div>
      <div class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS</div>
    </header>
    ${pageOne}
  </section>
  <section class="contract-page">
    <header class="contract-header">
      <div class="sys">Sistema de Gestão Judicial</div>
      <div class="brand">J DIMAS GONÇALVES</div>
      <div class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS</div>
    </header>
    ${pageTwo}
  </section>
  <section class="contract-page">
    <header class="contract-header">
      <div class="sys">Sistema de Gestão Judicial</div>
      <div class="brand">J DIMAS GONÇALVES</div>
      <div class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS</div>
    </header>
    ${pageThree}
  </section>
  ${recibo}
</main>
</body></html>`;
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
    if(!Number.isInteger(Number(form.parcelas_quantidade))||Number(form.parcelas_quantidade)<0||total<0||entry<0||installment<0) return toast.error("Informe valores válidos e uma quantidade inteira de parcelas.");
    if(entry>0&&!form.entrada_data) return toast.error("Informe a data da entrada.");
    if(entry>0&&!form.entrada_metodo_pagamento) return toast.error("Selecione a forma de pagamento da entrada para emitir o recibo.");
    if(count>0&&(dates.length!==count||dates.some(d=>!d)||!form.parcela_valor||installment<=0)) return toast.error("Informe o valor e os vencimentos de todas as parcelas.");
    if(mismatch) return toast.error("A entrada somada às parcelas deve ser igual aos honorários totais.");
    setSaving(true);
    try{
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user) throw new Error("Sessão expirada. Entre novamente.");
      const clientUpdate={nome:form.nome.trim(),nacionalidade:form.nacionalidade.trim(),estado_civil:form.estado_civil.trim(),profissao:form.profissao.trim(),rg:form.rg.trim(),cpf_cnpj:form.cpf_cnpj.trim(),endereco:form.endereco.trim(),bairro:form.bairro.trim(),cidade:form.cidade.trim(),uf:form.uf.trim().toUpperCase(),cep:form.cep.trim()};
      const {error:clientError}=await (supabase as any).from("clients").update(clientUpdate).eq("id",client.id);
      if(clientError) throw clientError;
      const html=contractHtml(form,dates,client.numero_processo ?? null);
      const snapshot={contratante:clientUpdate,contrato:{objeto_servico:form.objeto_servico,representado_nome:form.representado_nome,honorarios_total:total,entrada_valor:entry,entrada_data:form.entrada_data||null,entrada_metodo_pagamento:form.entrada_metodo_pagamento||null,recibo_entrada_incluido:entry>0,parcelas_quantidade:count,parcela_valor:installment,parcelas_vencimentos:dates,cidade_assinatura:form.cidade_assinatura,data_assinatura:form.data_assinatura,testemunha_1:form.testemunha_1,testemunha_2:form.testemunha_2},contratado:"JOAQUIM DIMAS GONÇALVES - OAB/MG 37.610"};
      const {error:saveError}=await (supabase as any).from("client_contracts").insert({client_id:client.id,objeto_servico:form.objeto_servico,representado_nome:form.representado_nome,honorarios_total:total,entrada_valor:entry,entrada_data:entry>0?form.entrada_data:null,parcelas_quantidade:count,parcela_valor:installment,parcelas_vencimentos:dates,cidade_assinatura:form.cidade_assinatura,data_assinatura:form.data_assinatura,testemunha_1:form.testemunha_1||null,testemunha_2:form.testemunha_2||null,contrato_html:html,dados_snapshot:snapshot,created_by:userData.user.id});
      if(saveError) throw saveError;
      onSaved();
      const opened = openPrintDocument(prepareContractHtmlForPrint(html), { pageSize: "A4" });
      if (!opened) toast.error("Contrato salvo, mas não foi possível abrir a impressão. Reabra pela ficha do cliente.");
      else toast.success(entry>0 ? "Contrato e recibo da entrada (2 vias) preparados para impressão." : "Contrato salvo e preparado para impressão.");
      onClose();
    }catch(error){toast.error("Não foi possível gerar o contrato.",{description:error instanceof Error?error.message:"Erro inesperado."});}
    finally{setSaving(false);}
  }
  return <Dialog open={!!client} onOpenChange={open=>!open&&onClose()}><DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5"/>Gerar contrato — {client.nome}</DialogTitle></DialogHeader><div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Dados do contratante</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{inputs.slice(0,11).map(([key,label,type])=><div className="space-y-1" key={key}><Label>{label}</Label><Input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Serviço jurídico</CardTitle></CardHeader><CardContent className="grid gap-3"><div className="space-y-1"><Label>Objeto / serviço contratado</Label><Textarea rows={2} value={form.objeto_servico} onChange={e=>set("objeto_servico",e.target.value)} /></div><div className="space-y-1"><Label>Pessoa representada</Label><Input value={form.representado_nome} onChange={e=>set("representado_nome",e.target.value)} /></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Honorários e pagamento</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{inputs.slice(12,18).map(([key,label,type])=><div className="space-y-1" key={key}><Label>{label}</Label><Input type={type} min={type==="number"?"0":undefined} step={type==="number"?(key==="parcelas_quantidade"?"1":"0.01"):undefined} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>)}
{entry>0&&<div className="space-y-1.5 sm:col-span-2"><Label>Forma de pagamento da entrada *</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.entrada_metodo_pagamento} onChange={e=>set("entrada_metodo_pagamento",e.target.value)}><option value="">Selecione a forma de pagamento</option>{METODOS_PAGAMENTO.map(m=><option key={m} value={m}>{m}</option>)}</select><p className="text-xs text-muted-foreground">Ao gerar o contrato, será incluído automaticamente um recibo da entrada em duas vias, com o valor e a data informados.</p></div>}
<div className="sm:col-span-2 rounded-md border p-3 text-sm"><p>Vencimentos calculados automaticamente:</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{dates.map((d,i)=><div key={i} className="space-y-1"><Label>{i+1}ª parcela</Label><Input type="date" value={d} onChange={e=>setDates(old=>old.map((item,index)=>index===i?e.target.value:item))} /></div>)}</div>{!dates.length&&<p className="mt-1 text-muted-foreground">Sem parcelas adicionais.</p>}<p className="mt-2 font-medium">Entrada + parcelas: {formatBRL(sum)} / Total: {formatBRL(total)}</p>{mismatch&&<p className="mt-1 text-destructive">A soma ainda não corresponde aos honorários totais.</p>}</div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Assinatura e testemunhas</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{inputs.slice(18).map(([key,label,type])=><div className="space-y-1" key={key}><Label>{label}</Label><Input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>)}</CardContent></Card><p className="text-xs text-muted-foreground">Os dados pessoais serão atualizados no cadastro deste cliente. As condições e o texto do contrato ficarão guardados como um registro independente, sem alterar contratos anteriores.</p></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving||mismatch}>{saving?"Salvando...":"Gerar e salvar contrato"}</Button></DialogFooter></DialogContent></Dialog>;
}

type SavedContract = {
  id: string;
  objeto_servico: string;
  honorarios_total: number | string;
  entrada_valor: number | string;
  entrada_data: string | null;
  parcelas_quantidade: number;
  parcela_valor: number | string;
  parcelas_vencimentos: string[] | null;
  contrato_html: string;
  dados_snapshot: {
    contrato?: {
      entrada_metodo_pagamento?: string | null;
      recibo_entrada_incluido?: boolean;
    };
  } | null;
  data_assinatura: string;
  created_at: string;
};

export function ClientContractsHistory({ clientId }: { clientId: string }) {
  const queryClient=useQueryClient();
  const {perms}=useProfile();
  const [contractToDelete,setContractToDelete]=useState<SavedContract|null>(null);
  const [deleting,setDeleting]=useState(false);
  const {data:contracts=[],isLoading}=useQuery({
    queryKey:["client-contracts",clientId],
    queryFn:async()=>{
      const {data,error}=await (supabase as any)
        .from("client_contracts")
        .select("id,objeto_servico,honorarios_total,entrada_valor,entrada_data,parcelas_quantidade,parcela_valor,parcelas_vencimentos,contrato_html,dados_snapshot,data_assinatura,created_at")
        .eq("client_id",clientId)
        .order("created_at",{ascending:false});
      if(error) throw error;
      return (data??[]) as SavedContract[];
    }
  });
  const totalContratado=contracts.reduce((sum,c)=>sum+Number(c.honorarios_total||0),0);
  const totalEntradas=contracts.reduce((sum,c)=>sum+Number(c.entrada_valor||0),0);

  async function confirmDeleteContract(){
    const selected=contractToDelete;
    if(!selected||!perms.isLeadership) return;
    setDeleting(true);
    try{
      const {data,error}=await (supabase as any)
        .from("client_contracts")
        .delete()
        .eq("id",selected.id)
        .eq("client_id",clientId)
        .select("id")
        .maybeSingle();
      if(error) throw error;
      if(!data) throw new Error("O contrato não foi removido. Verifique suas permissões e tente novamente.");
      await queryClient.invalidateQueries({queryKey:["client-contracts",clientId]});
      setContractToDelete(null);
      toast.success("Contrato e recibo associado excluídos.");
    }catch(error){
      toast.error("Não foi possível excluir o contrato.",{description:error instanceof Error?error.message:"Erro inesperado."});
    }finally{
      setDeleting(false);
    }
  }

  return <>
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Contratos e condições financeiras</h3>
      {!isLoading&&contracts.length>0&&<div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Contratos registrados</p><p className="text-lg font-semibold">{contracts.length}</p></div>
        <div><p className="text-xs text-muted-foreground">Honorários contratados</p><p className="text-lg font-semibold font-mono">{formatBRL(totalContratado)}</p></div>
        <div><p className="text-xs text-muted-foreground">Entradas previstas / recebidas conforme contrato</p><p className="text-lg font-semibold font-mono">{formatBRL(totalEntradas)}</p></div>
      </div>}
      <div className="space-y-2">
        {isLoading?<p className="text-sm text-muted-foreground">Carregando contratos...</p>:contracts.length===0?<p className="text-sm text-muted-foreground">Nenhum contrato gerado para este cliente.</p>:contracts.map(c=>{
          const entrada=Number(c.entrada_valor||0);
          const total=Number(c.honorarios_total||0);
          const quantidade=Number(c.parcelas_quantidade||0);
          const valorParcela=Number(c.parcela_valor||0);
          const metodo=c.dados_snapshot?.contrato?.entrada_metodo_pagamento||"—";
          const reciboIncluido=c.dados_snapshot?.contrato?.recibo_entrada_incluido??entrada>0;
          const vencimentos=(c.parcelas_vencimentos??[]).map(brDate).join(", ");
          return <div key={c.id} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-sm font-semibold">{c.objeto_servico}</p><p className="text-xs text-muted-foreground">Assinado em {brDate(c.data_assinatura)} · Honorários totais: {formatBRL(total)}</p></div>
              <div className="flex flex-col gap-2 sm:min-w-48">
                <Button size="sm" variant="outline" onClick={()=>openPrintDocument(prepareContractHtmlForPrint(c.contrato_html), { pageSize: "A4" })}><Printer className="mr-2 h-4 w-4"/>{reciboIncluido?"Reimprimir contrato e recibo":"Reimprimir contrato"}</Button>
                {perms.isLeadership&&<Button size="sm" variant="destructive" onClick={()=>setContractToDelete(c)}><Trash2 className="mr-2 h-4 w-4"/>Borrar contrato</Button>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Entrada</p><p className="font-medium">{formatBRL(entrada)}{c.entrada_data? " · "+brDate(c.entrada_data):""}</p></div>
              <div><p className="text-xs text-muted-foreground">Forma de pagamento</p><p className="font-medium">{entrada>0?metodo:"Sem entrada"}</p></div>
              <div><p className="text-xs text-muted-foreground">Parcelamento</p><p className="font-medium">{quantidade>0?quantidade+" × "+formatBRL(valorParcela):"Sem parcelas"}</p></div>
              <div><p className="text-xs text-muted-foreground">Saldo após a entrada</p><p className="font-medium font-mono">{formatBRL(Math.max(0,total-entrada))}</p></div>
              {quantidade>0&&<div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Vencimentos das parcelas</p><p className="font-medium">{vencimentos||"Não informados"}</p></div>}
              <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Recibo da entrada</p><p className="font-medium">{reciboIncluido?"Incluído e salvo junto ao contrato (duas vias)":"Não aplicável — contrato sem entrada"}</p></div>
            </div>
          </div>;
        })}
      </div>
    </section>
    <Dialog open={!!contractToDelete} onOpenChange={open=>!open&&!deleting&&setContractToDelete(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir contrato?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Esta ação excluirá somente o contrato selecionado e o recibo que está salvo junto a ele. Não excluirá pagamentos ou recibos registrados separadamente no Financeiro. A exclusão não pode ser desfeita.</p>
        {contractToDelete&&<div className="rounded-md border p-3 text-sm"><p className="font-semibold">{contractToDelete.objeto_servico}</p><p>{formatBRL(Number(contractToDelete.honorarios_total||0))} · {brDate(contractToDelete.data_assinatura)}</p></div>}
        <DialogFooter>
          <Button variant="outline" disabled={deleting} onClick={()=>setContractToDelete(null)}>Cancelar</Button>
          <Button variant="destructive" disabled={deleting||!perms.isLeadership} onClick={confirmDeleteContract}>{deleting?"Excluindo...":"Confirmar exclusão"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
