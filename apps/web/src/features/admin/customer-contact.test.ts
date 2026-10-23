import { describe, expect, it } from "vitest";
import { customerContactForStaff } from "@/features/admin/customer-contact";

const ADDRESS = {
  cep: "01310100",
  street: "Avenida Paulista",
  number: "1578",
  complement: "",
  neighborhood: "Bela Vista",
  city: "São Paulo",
  state: "SP",
} as const;

const HOLDER = {
  fullName: "Ana Souza Lima",
  cpf: "52998224725",
  phone: "11987654321",
  company: { cnpj: "11222333000181", companyName: "Ana Modas Ltda" },
  address: ADDRESS,
};

describe("customerContactForStaff", () => {
  it("gives the admin the phone and the address", () => {
    expect(customerContactForStaff("admin", HOLDER)).toEqual({
      address: ADDRESS,
      phone: "11987654321",
    });
  });

  it("never gives the phone to supervisors or attendants", () => {
    for (const role of ["supervisor", "agent"] as const) {
      const contact = customerContactForStaff(role, HOLDER);
      expect(contact).toEqual({ address: ADDRESS, phone: null });
      expect(JSON.stringify(contact)).not.toContain("98765");
    }
  });

  it("never carries the CPF or the company", () => {
    const serialized = JSON.stringify(customerContactForStaff("admin", HOLDER));
    expect(serialized).not.toContain(HOLDER.cpf);
    expect(serialized).not.toContain("11222333000181");
  });

  it("is empty for a customer without saved data", () => {
    expect(customerContactForStaff("admin", null)).toEqual({ address: null, phone: null });
  });
});
