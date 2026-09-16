import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../API/package.json", import.meta.url),
);
const sharp = require("sharp");

test.describe.configure({ mode: "serial" });
const password = "Portal123!";
let admin, reader, photo;
const auth = (session) => ({ Authorization: `Bearer ${session.accessToken}` });

test.beforeAll(async ({ request }) => {
  photo = await sharp({
    create: { width: 160, height: 160, channels: 3, background: "#bbd2ff" },
  })
    .png()
    .toBuffer();
  const sessions = await Promise.all(
    ["primeiro", "segundo"].map(async (name) => {
      const response = await request.post("/auth/register", {
        data: { name, email: `${name}@nexo.test`, password },
      });
      expect(response.status()).toBe(201);
      return response.json();
    }),
  );
  expect(
    sessions.filter((session) => session.user.role === "Admin"),
  ).toHaveLength(1);
  admin = sessions.find((session) => session.user.role === "Admin");
  reader = sessions.find((session) => session.user.role === "Usuario");
});

test("API: permissões, validação, fotos e persistência de produtos", async ({
  request,
}) => {
  expect((await request.get("/medicines")).status()).toBe(401);
  expect(
    (await request.get("/auth/me", { headers: auth(admin) })).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/auth/login", {
        data: { email: admin.user.email, password: "invalida" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/auth/register", {
        data: {
          name: "Duplicado",
          email: admin.user.email.toUpperCase(),
          password,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post("/auth/register", {
        data: {
          name: "Cargo injetado",
          email: "injecao@nexo.test",
          password,
          roles: "Admin",
        },
      })
    ).status(),
  ).toBe(400);
  const product = {
    name: "Vitamina C",
    description: "30 comprimidos",
    price: 29.9,
    stock: 25,
  };
  expect(
    (
      await request.post("/medicines", { headers: auth(reader), data: product })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/medicines/images", {
        headers: auth(reader),
        multipart: {
          file: { name: "foto.png", mimeType: "image/png", buffer: photo },
        },
      })
    ).status(),
  ).toBe(403);
  for (const invalid of [
    { stock: -1 },
    { price: -1 },
    { stock: 1.5 },
    { imageUrls: ["javascript:alert(1)"] },
    { imageUrls: null },
    { name: "  " },
    {
      imageUrls: Array.from(
        { length: 7 },
        (_, i) => `https://example.com/${i}.png`,
      ),
    },
  ]) {
    expect(
      (
        await request.post("/medicines", {
          headers: auth(admin),
          data: { ...product, ...invalid },
        })
      ).status(),
    ).toBe(400);
  }
  const upload = await request.post("/medicines/images", {
    headers: auth(admin),
    multipart: {
      file: { name: "../../foto.png", mimeType: "image/png", buffer: photo },
    },
  });
  expect(upload.status()).toBe(201);
  const { url } = await upload.json();
  expect(url).toMatch(/^\/uploads\/[\da-f-]+\.webp$/);
  const image = await request.get(url);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/webp");
  expect(
    (
      await request.post("/medicines/images", {
        headers: auth(admin),
        multipart: {
          file: {
            name: "falsa.png",
            mimeType: "image/png",
            buffer: Buffer.from("<script>alert(1)</script>"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/medicines/images", {
        headers: auth(admin),
        multipart: {
          file: {
            name: "grande.png",
            mimeType: "image/png",
            buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
          },
        },
      })
    ).status(),
  ).toBe(413);
  const created = await request.post("/medicines", {
    headers: auth(admin),
    data: { ...product, imageUrls: [url, "https://example.com/foto.png"] },
  });
  expect(created.status()).toBe(201);
  const saved = await created.json();
  expect(
    (
      await request.patch(`/medicines/${saved.id}`, {
        headers: auth(reader),
        data: { stock: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.delete(`/medicines/${saved.id}`, { headers: auth(reader) })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`/medicines/${saved.id}`, {
        headers: auth(admin),
        data: { name: null },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.patch(`/medicines/${saved.id}`, {
        headers: auth(admin),
        data: { stock: 8, imageUrls: [] },
      })
    ).status(),
  ).toBe(200);
  const persisted = await (
    await request.get(`/medicines/${saved.id}`, { headers: auth(reader) })
  ).json();
  expect(persisted.stock).toBe(8);
  expect(persisted.imageUrls).toEqual([]);
  expect(
    (
      await request.delete(`/medicines/${saved.id}`, { headers: auth(admin) })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.get(`/medicines/${saved.id}`, { headers: auth(admin) })
    ).status(),
  ).toBe(404);
});

test("Portal: login, cadastro de produto, upload, URL, edição, filtros e exclusão", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.screenshot({
    path: "test-results/nexo-login.png",
    fullPage: true,
  });
  await page.getByLabel("E-mail", { exact: true }).fill(admin.user.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Acessar portal" }).click();
  await expect(
    page.getByRole("heading", { name: "Produtos.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do produto").fill("Sérum facial");
  await dialog.getByLabel("Descrição").fill("Cuidado diário • 30 ml");
  await dialog.getByLabel("Preço de venda").fill("79.90");
  await dialog.getByLabel("Quantidade em estoque").fill("8");
  await dialog
    .locator("input[type=file]")
    .setInputFiles({ name: "serum.png", mimeType: "image/png", buffer: photo });
  await expect(dialog.getByText("Capa", { exact: true })).toBeVisible();
  const uploadedUrl = await dialog
    .locator(".image-preview img")
    .getAttribute("src");
  await dialog.getByRole("button", { name: "Adicionar por URL" }).click();
  await dialog
    .getByRole("textbox", { name: "URL da imagem" })
    .fill(`http://127.0.0.1:3100${uploadedUrl}`);
  await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Cadastrar produto", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sérum facial", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sérum facial", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar produto", exact: true })
    .click();
  await page.getByLabel("Nome do produto").fill("Sérum facial hidratante");
  await page.getByLabel("Quantidade em estoque").fill("20");
  await page.getByRole("button", { name: "Remover foto 2" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Estoque baixo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum produto por aqui" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByRole("textbox", { name: "Buscar produtos" }).fill("serum");
  await expect(
    page.getByRole("button", { name: "Sérum facial hidratante", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Visualização em lista" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar" }).click();
  expect((await download).suggestedFilename()).toContain("nexo-produtos-");
  await page.getByRole("button", { name: "Visualização em grade" }).click();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  for (const [name, stock] of [
    ["Vitamina C 500 mg", 42],
    ["Protetor solar FPS 50", 6],
    ["Sabonete líquido", 0],
  ]) {
    await request.post("/medicines", {
      headers: auth(admin),
      data: {
        name,
        description: "Produto de exemplo para validação",
        price: 39.9,
        stock,
      },
    });
  }
  await page.getByRole("button", { name: "Atualizar catálogo" }).click();
  await expect(
    page.getByRole("button", { name: "Vitamina C 500 mg", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/nexo-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Excluir Sérum facial hidratante",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar" })
    .click();
  await expect(
    page.getByRole("button", { name: "Sérum facial hidratante", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Excluir Sérum facial hidratante",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Excluir produto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sérum facial hidratante", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Vitamina C 500 mg", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sérum facial hidratante", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Portal móvel: cadastro, consulta sem edição e sessão expirada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome completo").fill("Maria Silva");
  await page.getByLabel("E-mail", { exact: true }).fill("maria@nexo.test");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill("naoconfere");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "As senhas precisam ser iguais",
  );
  await page.getByLabel("Confirmar senha").fill(password);
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(
    page.getByRole("heading", { name: "Produtos.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Novo produto", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar produto", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Vitamina C 500 mg", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/nexo-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Ver detalhes", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(
    page.getByRole("button", { name: "API e acesso", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("nexo-token", "invalido"));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Acessar portal" }),
  ).toBeVisible();
});

test("Funções: gestão de usuários, último Admin e alterações imediatas de acesso", async ({
  request,
}) => {
  expect((await request.get("/users", { headers: auth(admin) })).status()).toBe(
    200,
  );
  expect(
    (await request.get("/users", { headers: auth(reader) })).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`/users/${admin.user.sub}`, {
        headers: auth(admin),
        data: { roles: "Usuario" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.delete(`/users/${admin.user.sub}`, { headers: auth(admin) })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.patch(`/users/${reader.user.sub}`, {
        headers: auth(admin),
        data: { roles: null },
      })
    ).status(),
  ).toBe(400);
  const product = {
    name: "Importação bloqueada",
    description: "Teste",
    price: 10,
    stock: 1,
  };
  expect(
    (
      await request.post("/medicines/import", {
        headers: auth(reader),
        data: { products: [product] },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`/users/${reader.user.sub}`, {
        headers: auth(admin),
        data: { roles: "Farmacia" },
      })
    ).status(),
  ).toBe(200);
  // The same token issued with Usuario privileges must now use the updated database role.
  expect(
    (
      await request.post("/medicines", { headers: auth(reader), data: product })
    ).status(),
  ).toBe(201);
  expect(
    (await request.get("/users", { headers: auth(reader) })).status(),
  ).toBe(403);
  expect(
    (await request.get("/prescriptions", { headers: auth(reader) })).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/prescriptions", { headers: auth(reader), data: {} })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`/users/${reader.user.sub}`, {
        headers: auth(admin),
        data: { roles: "Usuario" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/medicines", { headers: auth(reader), data: product })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`/users/${reader.user.sub}`, {
        headers: auth(admin),
        data: { roles: "Farmacia" },
      })
    ).status(),
  ).toBe(200);
});

test("Planilhas: CSV, XLSX, validação e importação sem gravação parcial", async ({
  request,
}) => {
  const preview = (buffer) =>
    request.post("/medicines/import/preview", {
      headers: auth(reader),
      multipart: {
        file: {
          name: "produtos.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(buffer),
        },
      },
    });
  const response = await preview(
    "nome;descricao;preco;estoque;fotos\nProduto CSV;Descrição;12,90;5;\nOutro produto;Descrição;9.90;2;",
  );
  expect(response.status()).toBe(201);
  const valid = await response.json();
  expect(valid.count).toBe(2);
  expect(valid.products[0].price).toBe(12.9);
  expect(
    (
      await preview("nome;descricao;preco;estoque\nInválido;Descrição;10;-2")
    ).status(),
  ).toBe(400);
  expect((await preview("nome;descricao;preco;nome\nA;D;10;1")).status()).toBe(
    400,
  );
  const before = await (
    await request.get("/medicines", { headers: auth(reader) })
  ).json();
  const invalid = await request.post("/medicines/import", {
    headers: auth(reader),
    data: {
      products: [valid.products[0], { ...valid.products[1], stock: -1 }],
    },
  });
  expect(invalid.status()).toBe(400);
  expect(
    (await (await request.get("/medicines", { headers: auth(reader) })).json())
      .length,
  ).toBe(before.length);
  const imported = await request.post("/medicines/import", {
    headers: auth(reader),
    data: { products: valid.products },
  });
  expect(imported.status()).toBe(201);
  expect((await imported.json()).count).toBe(2);
  const { Workbook } = require("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Produtos");
  sheet.addRow(["nome", "descricao", "preco", "estoque"]);
  sheet.addRow(["Produto XLSX", "Descrição XLSX", 19.9, 3]);
  const xlsxPreview = () =>
    workbook.xlsx.writeBuffer().then((buffer) =>
      request.post("/medicines/import/preview", {
        headers: auth(reader),
        multipart: {
          file: {
            name: "produtos.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: Buffer.from(buffer),
          },
        },
      }),
    );
  const xlsx = await xlsxPreview();
  expect(xlsx.status()).toBe(201);
  expect((await xlsx.json()).products[0].stock).toBe(3);
  sheet.getCell("C2").value = { formula: "1+2", result: 3 };
  expect((await xlsxPreview()).status()).toBe(400);
});

test("Admin: cadastrar, editar função e excluir usuário pela interface; sem log", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(admin.user.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Acessar portal" }).click();
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await page.getByRole("button", { name: "Novo usuário" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill("Equipe teste");
  await dialog.getByLabel("E-mail", { exact: true }).fill("equipe@nexo.test");
  await dialog
    .getByRole("combobox", { name: "Função", exact: true })
    .selectOption("Farmacia");
  await dialog.getByLabel("Senha inicial", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Salvar usuário" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Editar usuário Equipe teste" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Função", exact: true })
    .selectOption("Usuario");
  await dialog.getByRole("button", { name: "Salvar usuário" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const session = await (
    await request.post("/auth/login", {
      data: { email: "equipe@nexo.test", password },
    })
  ).json();
  expect(session.user.role).toBe("Usuario");
  await page
    .getByRole("button", { name: "Excluir usuário Equipe teste" })
    .click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(
    page.getByRole("button", { name: "Editar usuário Equipe teste" }),
  ).toHaveCount(0);
  expect(
    (await request.get("/medicines", { headers: auth(session) })).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "API e acesso", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conexão com a API" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Log de atividades" }),
  ).toHaveCount(0);
});

test("Farmácia: importar planilha pela interface, sem acesso à API ou usuários", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(reader.user.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Acessar portal" }).click();
  await expect(
    page.getByRole("button", { name: "Novo produto", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "API e acesso", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Usuários", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({
    name: "catalogo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "nome;descricao;preco;estoque\nProduto importado pela tela;Descrição de teste;49,90;12",
    ),
  });
  await expect(
    dialog.getByText("Produto importado pela tela", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirmar importação (1)" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Produto importado pela tela",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Produto importado pela tela",
      exact: true,
    }),
  ).toBeVisible();
});

test("Controles de desconto e receita persistem e aparecem no catálogo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(reader.user.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Acessar portal" }).click();
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome do produto")
    .fill("Produto com receita e desconto");
  await dialog
    .getByLabel("Descrição")
    .fill("Teste dos controles");
  await dialog.getByLabel("Preço de venda").fill("100");
  await dialog.getByLabel("Desconto (%)").fill("15");
  await dialog.getByLabel("Exige receita médica", { exact: true }).check();
  await expect(dialog.locator("output")).toContainText("85,00");
  await dialog
    .getByRole("button", { name: "Cadastrar produto", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("textbox", { name: "Buscar produtos" })
    .fill("Produto com receita e desconto");
  const card = page.locator(".product-card");
  await expect(card).toContainText("85,00");
  await expect(card).toContainText("Receita médica obrigatória");
  await card
    .getByRole("button", { name: "Editar produto", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Desconto (%)")).toHaveValue("15");
  await expect(
    dialog.getByLabel("Exige receita médica", { exact: true }),
  ).toBeChecked();
  await dialog.getByLabel("Desconto (%)").fill("0");
  await dialog.getByLabel("Exige receita médica", { exact: true }).uncheck();
  await expect(dialog.locator("output")).toContainText("100,00");
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).not.toContainText("Receita médica obrigatória");
  await expect(card.locator("s")).toHaveCount(0);
});
