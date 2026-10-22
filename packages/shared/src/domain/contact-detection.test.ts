import { describe, expect, it } from "vitest";
import { type ContactKind, findContactDetails } from "./contact-detection.ts";

/** Text a reseller or supplier could type to take the sale off the platform. */
const BLOCKED: ReadonlyArray<readonly [string, ContactKind]> = [
  // Mobile and landline, every way people write them.
  ["Me liga no (11) 98765-4321", "phone"],
  ["Celular 11 98765-4321", "phone"],
  ["11987654321", "phone"],
  ["+55 11 98765 4321", "phone"],
  ["+5511987654321", "phone"],
  ["55 11 98765-4321", "phone"],
  ["98765-4321 é o meu", "phone"],
  ["987654321", "phone"],
  ["Fixo (31) 3333-4444", "phone"],
  ["Fixo 3333-4444", "phone"],
  ["11.98765.4321", "phone"],
  ["(11)98765-4321", "phone"],
  ["0xx11 98765-4321", "phone"],
  ["Liga 11   98765   4321", "phone"],
  // Digits pulled apart.
  ["9 8 7 6 5 4 3 2 1", "phone"],
  ["1 1 9 8 7 6 5 - 4 3 2 1", "phone"],
  ["9-8-7-6-5-4-3-2-1", "phone"],
  ["9.8.7.6.5.4.3.2.1", "phone"],
  // Spelled out, alone or mixed with digits.
  ["nove oito sete seis cinco quatro três dois um", "phone"],
  ["onze nove oito sete seis cinco quatro tres dois um", "phone"],
  ["Meu zap é nove nove nove nove nove um dois tres quatro", "phone"],
  ["11 nove 8765 quatro tres dois um", "phone"],
  ["NOVE OITO SETE SEIS CINCO QUATRO TRÊS DOIS UM", "phone"],
  ["zero onze nove oito sete seis meia cinco quatro três dois", "phone"],
  // E-mail, plain and disguised.
  ["fulano.silva@gmail.com", "email"],
  ["Manda para fulano@loja.com.br", "email"],
  ["fulano arroba gmail ponto com", "email"],
  ["fulano (arroba) gmail (ponto) com", "email"],
  ["fulano [at] gmail [dot] com", "email"],
  ["fulano at gmail dot com", "email"],
  ["fulano @ gmail . com", "email"],
  ["FULANO ARROBA HOTMAIL PONTO COM PONTO BR", "email"],
  // WhatsApp and Telegram links.
  ["wa.me/5511987654321", "link"],
  ["https://wa.me/5511987654321", "link"],
  ["api.whatsapp.com/send?phone=5511987654321", "link"],
  ["chat.whatsapp.com/AbCdEf123", "link"],
  ["t.me/fulano", "link"],
  ["telegram.me/fulano", "link"],
  ["www.minhaloja.com.br", "link"],
  ["minhaloja.com.br", "link"],
  // Social networks: a handle, or the network's name next to a user name.
  ["Me segue @fulano.loja", "social"],
  ["insta: fulano.loja", "social"],
  ["Meu insta é fulanoloja", "social"],
  ["instagram fulano_loja", "social"],
  ["face: fulano.silva", "social"],
  ["facebook.com/fulano", "link"],
  ["tiktok: @fulano", "social"],
  ["Tik Tok fulano_oficial", "social"],
  ["meu telegram é fulano123", "social"],
  // Disguises the review found (function 5, PR 1 review).
  ["zap11987654321", "phone"],
  ["tel11987654321", "phone"],
  ["11987654321a", "phone"],
  ["11 98765-4321 0", "phone"],
  ["1 11 98765-4321", "phone"],
  ["11 98765-4321 11 91234-5678", "phone"],
  ["CEP 11987654321", "phone"],
  ["cep: (11) 98765-4321", "phone"],
  ["R$ 11 98765-4321", "phone"],
  ["11    98765    4321", "phone"],
  ["11  -  98765  -  4321", "phone"],
  ["11_98765_4321", "phone"],
  ["11*98765*4321", "phone"],
  ["11,98765,4321", "phone"],
  ["11–98765–4321", "phone"],
  ["11:98765:4321", "phone"],
  ["1​1​9​8​7​6​5​4​3​2​1", "phone"],
  ["11 9876S-4321", "phone"],
  ["1l987654321", "phone"],
  ["onze 9O765-4321", "phone"],
  ["1nsta: fulano.loja", "social"],
  ["inst4: fulano.loja", "social"],
  ["insta - fulano_loja", "social"],
  ["insta fulanoloja", "social"],
  ["@ fulano.loja", "social"],
  ["whatsapp fulano123", "social"],
  ["zap: fulano", "social"],
  ["Telegram fulano", "social"],
  ["fulano@gmail", "email"],
  ["fulano arroba gmail", "email"],
  ["fulano.silva gmail com", "email"],
  ["fulano@gmail(.)com", "email"],
  ["fulano{at}gmail{dot}com", "email"],
  ["fulano@hotmail,com", "email"],
  ["f u l a n o @ g m a i l . c o m", "email"],
  ["MINHALOJA.COM.BR", "link"],
  ["minhaloja . com . br", "link"],
  ["minhaloja ponto com ponto br", "link"],
  ["minhaloja.xyz", "link"],
  ["linktr.ee/fulano", "link"],
];

/** Everyday text in shipment instructions and occurrences: none of it is a contact. */
const ALLOWED: readonly string[] = [
  "Pedido 2000012345678901",
  "Pedido MLB1234567890 com 2 unidades",
  "Venda #SIM-9F936BC5",
  "Pedido #DEMO-FALTA-01C",
  "CEP 01310-100",
  "CEP 01310100",
  "Entregar no CEP 30130-010, portaria",
  "R$ 1.234,56",
  "Custou R$ 12.345.678,90 no total",
  "Mandar 3 unidades",
  "Quantidade: 12",
  "Rastreio AA123456789BR",
  "Código LB987654321HK",
  "Entregar em 12/09/2026 às 14:30",
  "Coleta entre 08:00 e 18:00",
  "Data 2026-10-22",
  "Embalar com plástico bolha, é frágil",
  "Nota fiscal 123456",
  "Caixa 30 x 20 x 15 cm, 1,5 kg",
  "Prazo de 5 dias úteis",
  "Chegou.Com cuidado",
  "Cliente pediu para entregar no ponto de coleta",
  "Mandar o cinza, não o azul",
  "Use a etiqueta do Mercado Livre",
  "Dois volumes, um com o tapete e outro com o suporte",
  "Fala no chat do pedido, não tenho instagram",
  "Ligue a máquina antes de embalar",
  "Item 3 de 5",
  "Lote 2024-07",
  "Nove unidades",
  // False positives the review found.
  "30130010",
  "Entregar 30130010",
  "Loggi 39876543",
  "nota 33333333",
  "Nota fiscal 987654321",
  "Código 987654321",
  "Pedido nº 987654321",
  "embalar.com cuidado",
  "Produto.com defeito",
  "Pedido do TikTok Shop",
  "Rua 25 de Março, 1234",
  "Rua Doze de Outubro, 4321",
  "Alameda Santos, 2222 - 3333",
];

describe("findContactDetails", () => {
  it.each(BLOCKED)("finds the contact in %j", (text, kind) => {
    expect(findContactDetails(text)).toContain(kind);
  });

  it.each(ALLOWED)("leaves %j alone", (text) => {
    expect(findContactDetails(text)).toEqual([]);
  });

  it("names each kind once, in a fixed order", () => {
    const text = "Liga 11 98765-4321 ou 11 91234-5678, fulano@gmail.com, @fulano e wa.me/55119";
    expect(findContactDetails(text)).toEqual(["phone", "email", "link", "social"]);
  });

  it("sees through full-width digits and a full-width @", () => {
    const fullWidth = String.fromCodePoint(
      ..."11987654321".split("").map((digit) => 0xff10 + Number(digit)),
    );
    expect(findContactDetails(`Me chama no ${fullWidth}`)).toEqual(["phone"]);
    expect(findContactDetails(`fulano${String.fromCodePoint(0xff20)}gmail.com`)).toEqual(["email"]);
  });

  it("answers a long text at once, so a huge note cannot hold the server", () => {
    const started = performance.now();
    for (const text of ["a.".repeat(500), "a-".repeat(500), `insta ${"a".repeat(1000)}`]) {
      findContactDetails(text);
    }
    expect(performance.now() - started).toBeLessThan(150);
  });

  it("reads a long product description to the end, also across the reading windows", () => {
    const filler = "Tecido de algodão macio, lavar à mão. ".repeat(500);
    expect(findContactDetails(`${filler} WhatsApp 11 98765-4321`)).toEqual(["phone"]);
    for (const at of [1990, 2000, 3795, 3800]) {
      const text = `${"a ".repeat(at / 2)}11 98765-4321 ${"b ".repeat(400)}`;
      expect(findContactDetails(text)).toContain("phone");
    }
  });

  it("reads words cut by a reading window as the whole words they are", () => {
    const after = "z ".repeat(300);
    // "face" starts a window at 1800; "Sho" ends one at 2000; the EAN crosses 1800.
    const interfaceAtEdge = `${"x ".repeat(897)}yInterface - modelo sem fio ${after}`;
    const shopAtEdge = `${"x ".repeat(988)}Vendido na Instagram Shop ${after}`;
    const eanAtEdge = `${"x".repeat(1792)} EAN 7891234567895 ${after}`;
    expect(findContactDetails(interfaceAtEdge)).toEqual([]);
    expect(findContactDetails(shopAtEdge)).toEqual([]);
    expect(findContactDetails(eanAtEdge)).toEqual([]);
  });

  it("reads a 20,000-character description quickly", () => {
    const started = performance.now();
    findContactDetails("a.".repeat(10_000));
    findContactDetails("insta ".repeat(3_400));
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("finds nothing in an empty text", () => {
    expect(findContactDetails("")).toEqual([]);
    expect(findContactDetails("   ")).toEqual([]);
  });
});
