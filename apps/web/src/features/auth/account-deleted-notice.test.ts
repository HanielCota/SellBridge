import { describe, expect, test } from "vitest";
import {
  ACCOUNT_DELETED_LOGIN_PATH,
  ACCOUNT_DELETED_MESSAGE,
  accountDeletedNotice,
} from "./account-deleted-notice";

describe("accountDeletedNotice", () => {
  test("says the account was deleted when the sign-in is reached from the deletion", () => {
    expect(accountDeletedNotice({ contaExcluida: true })).toBe(ACCOUNT_DELETED_MESSAGE);
  });

  test("says nothing on an ordinary visit to the sign-in", () => {
    expect(accountDeletedNotice({})).toBeNull();
  });

  test("sends the deletion to the sign-in with the flag the notice reads", () => {
    const url = new URL(ACCOUNT_DELETED_LOGIN_PATH, "http://localhost");

    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("contaExcluida")).toBe("true");
  });
});
