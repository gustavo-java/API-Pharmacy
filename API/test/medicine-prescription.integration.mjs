import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

let server, token, userId;
const base = 'http://127.0.0.1:3100';
async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  server = spawn(process.execPath, ['test/portal-server.mjs'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null)
      throw new Error('Isolated API exited before startup');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Isolated API must start');
  const registered = await call('/auth/register', 'POST', {
    name: 'Admin teste',
    email: 'rx-admin@example.test',
    password: 'Testing123!',
  });
  assert.equal(registered.status, 201);
  token = registered.data.accessToken;
  userId = registered.data.user.sub;
});
after(async () => {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await stopped;
  }
});

test('discount CRUD, DTO validation, prescription reference and atomic inventory', async () => {
  const product = {
    name: 'Produto de teste',
    description: 'Teste de integração',
    price: 100,
    stock: 10,
    requiresPrescription: true,
    discountPercentage: 20,
  };
  for (const invalid of [
    { discountPercentage: -1 },
    { discountPercentage: 100.01 },
    { discountPercentage: 1.123 },
    { discountPercentage: null },
    { discountPercentage: '20' },
    { requiresPrescription: 'true' },
    { requiresPrescription: null },
    { finalPrice: 1 },
  ]) {
    assert.equal(
      (await call('/medicines', 'POST', { ...product, ...invalid })).status,
      400,
    );
  }
  const created = await call('/medicines', 'POST', product);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(created.data.price, 100);
  assert.equal(created.data.finalPrice, 80);
  assert.equal(created.data.discountAmount, 20);
  assert.equal(created.data.requiresPrescription, true);
  assert.equal(
    (await call(`/medicines/${id}`, 'PATCH', { price: 200 })).data.finalPrice,
    160,
  );
  assert.equal(
    (await call(`/medicines/${id}`, 'PATCH', { discountPercentage: 12.5 })).data
      .finalPrice,
    175,
  );
  assert.equal(
    (await call(`/medicines/${id}`, 'PATCH', { discountPercentage: 0 })).data
      .finalPrice,
    200,
  );
  assert.equal(
    (await call(`/medicines/${id}`, 'PATCH', { discountPercentage: 100 })).data
      .finalPrice,
    0,
  );
  assert.equal(
    (await call(`/medicines/${id}`, 'PATCH', { discountPercentage: 20 })).data
      .finalPrice,
    160,
  );
  const input = { userId, medicineId: id, quantity: 3 };
  const missing = await call('/prescriptions', 'POST', input);
  assert.equal(missing.status, 400);
  assert.equal(missing.data.error, 'PRESCRIPTION_REQUIRED');
  assert.equal((await call(`/medicines/${id}`)).data.stock, 10);
  assert.equal(
    (
      await call('/prescriptions', 'POST', {
        ...input,
        prescriptionReference: '   ',
      })
    ).status,
    400,
  );
  const issued = await call('/prescriptions', 'POST', {
    ...input,
    prescriptionReference: 'RX-TEST-001',
  });
  assert.equal(issued.status, 201);
  assert.equal(issued.data.medicine.finalPrice, 160);
  assert.equal(issued.data.prescriptionReference, 'RX-TEST-001');
  const rx = issued.data.id;
  assert.equal((await call(`/medicines/${id}`)).data.stock, 7);
  assert.equal(
    (await call(`/prescriptions/${rx}`, 'PATCH', { quantity: 30 })).status,
    400,
  );
  assert.equal((await call(`/medicines/${id}`)).data.stock, 7);
  assert.equal((await call(`/prescriptions/${rx}`)).data.quantity, 3);
  assert.equal(
    (await call(`/prescriptions/${rx}`, 'PATCH', { quantity: 4 })).status,
    200,
  );
  assert.equal((await call(`/medicines/${id}`)).data.stock, 6);
  assert.equal(
    (await call(`/prescriptions/${rx}`, 'PATCH', { quantity: 2 })).status,
    200,
  );
  assert.equal((await call(`/medicines/${id}`)).data.stock, 8);
  const second = (await call('/medicines', 'POST', product)).data;
  assert.equal(
    (await call(`/prescriptions/${rx}`, 'PATCH', { medicineId: second.id }))
      .status,
    400,
  );
  assert.equal((await call(`/medicines/${second.id}`)).data.stock, 10);
  assert.equal(
    (
      await call(`/prescriptions/${rx}`, 'PATCH', {
        medicineId: second.id,
        prescriptionReference: 'RX-TEST-002',
      })
    ).status,
    200,
  );
  assert.equal((await call(`/medicines/${id}`)).data.stock, 10);
  assert.equal((await call(`/medicines/${second.id}`)).data.stock, 8);
  const ordinary = (
    await call('/medicines', 'POST', {
      name: 'Produto comum',
      description: 'Teste',
      price: 30,
      stock: 2,
    })
  ).data;
  assert.equal(ordinary.requiresPrescription, false);
  assert.equal(ordinary.discountPercentage, 0);
  assert.equal(ordinary.finalPrice, 30);
  assert.equal(
    (
      await call('/prescriptions', 'POST', {
        userId,
        medicineId: ordinary.id,
        quantity: 1,
      })
    ).status,
    201,
  );
  assert.equal(
    (await call('/medicines')).data.find((p) => p.id === id).finalPrice,
    160,
  );
});

test('spreadsheet preserves prescription and discount fields', async () => {
  const body = new FormData();
  body.append(
    'file',
    new Blob(
      [
        'nome;descricao;preco;estoque;desconto;exige_receita\nImportado;Teste;100;5;12,5;sim',
      ],
      { type: 'text/csv' },
    ),
    'produtos.csv',
  );
  const preview = await call('/medicines/import/preview', 'POST', body);
  assert.equal(preview.status, 201);
  assert.equal(preview.data.products[0].requiresPrescription, true);
  assert.equal(preview.data.products[0].discountPercentage, 12.5);
  assert.equal(
    (
      await call('/medicines/import', 'POST', {
        products: preview.data.products,
      })
    ).status,
    201,
  );
  const imported = (await call('/medicines')).data.find(
    (p) => p.name === 'Importado',
  );
  assert.equal(imported.finalPrice, 87.5);
  assert.equal(imported.requiresPrescription, true);
});
