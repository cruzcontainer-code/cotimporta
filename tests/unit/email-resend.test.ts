import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resendProvider } from "@/server/email";

type Seen = { method?: string; url?: string; auth?: string; body: unknown };

const seen: Seen[] = [];
let status = 200;
const server = createServer(async (req: IncomingMessage, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  seen.push({
    method: req.method,
    url: req.url,
    auth: req.headers.authorization,
    body: JSON.parse(raw),
  });
  res.writeHead(status, { "content-type": "application/json" });
  res.end(status === 200 ? '{"id":"email_1"}' : '{"message":"Invalid from"}');
});
let baseUrl = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const message = {
  to: "cliente@cotimporta.test",
  subject: "Verifica tu email",
  text: "Hola",
  html: "<p>Hola</p>",
};

describe("driver de correo resend", () => {
  it("hace POST /emails con Bearer y el cuerpo que pide Resend", async () => {
    status = 200;
    const provider = resendProvider({
      apiKey: "re_test",
      from: "Cotimporta <no-reply@x.test>",
      baseUrl,
    });
    await provider.send(message);
    expect(seen.at(-1)).toEqual({
      method: "POST",
      url: "/emails",
      auth: "Bearer re_test",
      body: {
        from: "Cotimporta <no-reply@x.test>",
        to: ["cliente@cotimporta.test"],
        subject: "Verifica tu email",
        text: "Hola",
        html: "<p>Hola</p>",
      },
    });
  });

  it("si Resend responde error, lanza con el código", async () => {
    status = 422;
    const provider = resendProvider({ apiKey: "re_test", from: "a@x.test", baseUrl });
    await expect(provider.send(message)).rejects.toThrow(/Resend respondió 422/);
  });
});
