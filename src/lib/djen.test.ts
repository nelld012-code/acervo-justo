// @ts-ignore vitest roda via bunx
import { describe, expect, it, vi } from "vitest";
import { deduplicar, hashComunicacao, mapearComunicacao, planoConfirmacao, processarSync, rascunhoPrazo } from "./djen";

const item = { id: 123, numeroprocessocommascara: "0001-11.2026.8.13.0000", siglaTribunal: "TJMG", data_disponibilizacao: "2026-11-10", texto: "Intime-se." };
const payload = (items: unknown[], total = items.length) => ({ items, total, dataInicio: "2026-11-09", dataFim: "2026-11-12" });
const ok = () => vi.fn(async () => ({ inseridos: 1, rascunhos: 1 }));

describe("djen", () => {
  it("mesmo id gera o mesmo hash", async () => {
    expect(await hashComunicacao(item)).toBe(await hashComunicacao({ ...item, texto: "outro" }));
  });
  it("mesma comunicação duas vezes não duplica", async () => {
    expect((await deduplicar([item, item])).length).toBe(1);
  });
  it("segredo errado ou ausente retorna 401 e não grava", async () => {
    const ingest = ok();
    expect((await processarSync({ secret: "abc", header: "xyz", body: payload([item]), dryRun: false, ingest })).status).toBe(401);
    expect((await processarSync({ secret: undefined, header: "", body: payload([item]), dryRun: false, ingest })).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("payload inválido retorna 400", async () => {
    const ingest = ok();
    expect((await processarSync({ secret: "abc", header: "abc", body: { items: "x" }, dryRun: false, ingest })).status).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("paginação incompleta falha sem gravar", async () => {
    const ingest = ok();
    expect((await processarSync({ secret: "abc", header: "abc", body: payload([item], 27), dryRun: false, ingest })).status).toBe(422);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("dryRun não grava", async () => {
    const ingest = ok();
    const r = await processarSync({ secret: "abc", header: "abc", body: payload([item, item]), dryRun: true, ingest });
    expect(r.body).toMatchObject({ dryRun: true, unicos: 1, bancoAlterado: false });
    expect(ingest).not.toHaveBeenCalled();
  });
  it("envia lote deduplicado ao banco", async () => {
    const ingest = ok();
    await processarSync({ secret: "abc", header: "abc", body: payload([item, item]), dryRun: false, ingest });
    expect(ingest.mock.calls[0][0].length).toBe(1);
  });
  it("rascunho sem vencimento, sem lembretes e sem parte/advogado inventados", async () => {
    const r = rascunhoPrazo(await mapearComunicacao(item));
    expect(r.data_limite).toBeNull();
    expect(r.lembrete_ativo).toBe(false);
    expect(r.repetir_alerta_diariamente).toBe(false);
    expect(r.parte).toBe("");
    expect(r.advogado).toBeNull();
    expect(r.revisao_pendente).toBe(true);
    expect(r.dedupe_key).toBe(`djen:${r.djen_hash}`);
  });
  it("confirmação reutiliza o rascunho e exige data", () => {
    expect(planoConfirmacao({ prazo_id: "p1" }, "2026-12-01")).toEqual({ acao: "atualizar", prazo_id: "p1" });
    expect(() => planoConfirmacao({ prazo_id: null }, "2026-12-01")).toThrow();
    expect(() => planoConfirmacao({ prazo_id: "p1" }, null)).toThrow();
  });
});
