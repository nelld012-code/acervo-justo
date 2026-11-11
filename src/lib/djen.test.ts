// @ts-ignore vitest roda via bunx
import { describe, expect, it } from "vitest";
import { deduplicar, hashComunicacao, mapearComunicacao } from "./djen";

const item = { id: 123, numeroprocessocommascara: "0001-11.2026.8.13.0000", siglaTribunal: "TJMG", data_disponibilizacao: "2026-11-10", texto: "Intime-se." };

describe("djen", () => {
  it("mesmo id gera o mesmo hash", async () => {
    expect(await hashComunicacao(item)).toBe(await hashComunicacao({ ...item, texto: "outro" }));
  });
  it("mesma consulta duas vezes não duplica", async () => {
    expect((await deduplicar([item, item])).length).toBe(1);
  });
  it("mapeia campos e nunca define data limite", async () => {
    const r = await mapearComunicacao(item);
    expect(r.sigla_tribunal).toBe("TJMG");
    expect(r.data_disponibilizacao).toBe("2026-11-10");
    expect("data_limite" in r).toBe(false);
  });
});
