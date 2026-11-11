import { describe, expect, it } from "vitest";
import { isOwnAvatarImage } from "./avatar-key";

const OWNER = "user_1";
const FILE = "0f8fad5b-d9cb-469f-a165-70867728950e.png";

describe("isOwnAvatarImage", () => {
  it("accepts a photo in the account's own folder", () => {
    expect(isOwnAvatarImage(`/api/perfil/foto/${OWNER}/${FILE}`, OWNER)).toBe(true);
  });

  it.each([
    `/api/perfil/foto/${OWNER}/../../../auth/verify-email?token=x`,
    `/api/perfil/foto/${OWNER}/%2e%2e/%2e%2e/auth/sign-out`,
    `/api/perfil/foto/${OWNER}/..\\..\\auth`,
    `/api/perfil/foto/${OWNER}/${FILE}?a=b`,
    `/api/perfil/foto/${OWNER}/${FILE}#x`,
    `/api/perfil/foto/${OWNER}/${FILE}/../../outro/${FILE}`,
    `/api/perfil/foto/user_2/${FILE}`,
    `https://outro-site.example/api/perfil/foto/${OWNER}/${FILE}`,
  ])("refuses %s", (image) => {
    expect(isOwnAvatarImage(image, OWNER)).toBe(false);
  });
});
