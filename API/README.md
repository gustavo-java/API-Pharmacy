# API

Backend NestJS com Prisma e PostgreSQL. O portal React está em `../FrontEnd`.

Configure o `.env` a partir do `.env.example` e execute:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

- `npm run build`: compila apenas a API.
- `npm run start:prod`: inicia a API compilada na porta 3000.
- `npm test`: testes unitários.

O schema utilizado é `prisma/schema.prisma`. As migrations devem ser aplicadas
antes de iniciar a API. Não execute reset em bancos com dados existentes.

## Rotas

- `POST /auth/register`, `POST /auth/login`: públicas.
- `GET /auth/me`: perfil autenticado.
- `/users`: CRUD somente Admin, incluindo a edição de `roles`.
- `/medicines`: consulta para todos; escrita para Admin e Farmácia.
- `POST /medicines/images`: multipart `file`, até 5 MB, JPG/PNG/WebP.
- `POST /medicines/import/preview`: multipart `file`, até 2 MB, CSV/XLSX.
- `POST /medicines/import`: JSON `{ "products": [...] }`, até 1.000 produtos;
  validação repetida no servidor e inserção atômica.
- `/prescriptions`: restrito ao Admin.

Os recursos protegidos exigem `Authorization: Bearer <token>`. As funções são
`Admin`, `Farmacia` e `Usuario` (Cliente no portal). O primeiro cadastro recebe
Admin em um banco vazio; não é possível remover ou rebaixar o último Admin.

Uploads ficam em `uploads/` ou `UPLOAD_DIR` e são públicos em `/uploads/`.
Mantenha essa pasta em volume persistente e inclua-a nos backups. A remoção de
uma foto do produto não remove o arquivo do disco. Não há log de atividades
no portal nem endpoint de auditoria.

Consulte o [README principal](../README.md) para executar o front-end e os testes
integrados usando o banco temporário.

## Produtos com prescrição e desconto

Em `POST /medicines` e `PATCH /medicines/:id`, informe os novos campos opcionais:

```json
{
  "name": "Produto de exemplo",
  "description": "Apresentação do produto",
  "price": 100,
  "stock": 20,
  "requiresPrescription": true,
  "discountPercentage": 15
}
```

A API preserva `price: 100` e retorna `finalPrice: 85` e `discountAmount: 15`.
`discountPercentage` aceita números de 0 a 100 com até duas casas decimais.
O cálculo é feito automaticamente, arredondado para centavos, sempre sobre o
preço original. Alterar o preço ou o percentual recalcula o resultado; desconto
zero remove o abatimento e desconto 100 resulta em preço final zero.
`finalPrice` e `discountAmount` são somente de leitura e não devem ser enviados
no cadastro/edição. A importação JSON aceita os mesmos campos.

Na planilha, as colunas opcionais `desconto` e `exige_receita` permitem informar
o percentual e `sim`/`não`, `true`/`false` ou `1`/`0`. Planilhas antigas continuam
aceitas. Produtos existentes recebem `requiresPrescription: false` e
`discountPercentage: 0` na migration, preservando preços e estoque.

Os arquivos `prescription` usam a relação `medicineId` para registrar a receita:

```json
{
  "userId": 1,
  "medicineId": 10,
  "quantity": 2,
  "prescriptionReference": "RECEITA-2026-001"
}
```

Envie o JSON a `POST /prescriptions`. Para um produto marcado como exigindo
receita, `prescriptionReference` é obrigatório, não pode ser vazio e tem limite
de 120 caracteres. Sem ele, a API responde HTTP 400 (`PRESCRIPTION_REQUIRED`) e
não reduz o estoque. Produtos comuns continuam aceitando registros sem referência.
A referência é um identificador registrado pela equipe; não há consulta a um
serviço externo de validação de receitas.

As respostas de `/prescriptions` incluem `medicine`, com a exigência de receita
e os preços atuais calculados do catálogo. Esses valores não representam um
histórico de pagamento. Editar a quantidade ajusta o saldo de estoque na mesma
transação; trocar o medicamento devolve o saldo anterior e baixa o novo produto.
Ao trocar para um produto que exige receita, envie uma nova referência.
Excluir um registro mantém o comportamento anterior: remove o registro, sem
estornar automaticamente o estoque.

As permissões existentes são preservadas: Admin/Farmácia cadastram e editam
produtos; somente Admin acessa `/prescriptions`.

Aplique a migration antes de executar a nova versão:

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
```

Para testar essa integração com banco descartável (sem usar o banco do `.env`):

```bash
npm run test:products
```

O formulário do front-end permite configurar a exigência de receita e o desconto,
com prévia automática. O catálogo exibe preço original, desconto e preço final.
