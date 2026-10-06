# Nibo ↔ ChatGPT: conector MCP inicial (somente leitura)

## Segurança antes de começar
Se o token enviado anteriormente for real, revogue-o no Nibo e gere outro. Nunca coloque o token na URL, em chats, repositórios ou logs. Este projeto envia o token no cabeçalho `ApiToken`, não em `Authorization`.

## Instalação local
1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e insira sua NOVA chave somente nesse arquivo.
4. Execute `npm start` para iniciar o servidor MCP via stdio.
5. Configure um cliente MCP que suporte servidores locais para executar `node /CAMINHO/nibo-chatgpt/server.js` com `NIBO_API_TOKEN` no ambiente.

## Ferramentas
- `list_payables`: GET `/schedules/debit` com paginação `$orderby`, `$skip`, `$top`.
- `list_receivables`: GET `/schedules/credit` **a confirmar na documentação/conta** antes de uso real.

Cada consulta retorna no máximo 500 registros. Para buscar todas as páginas, repita as consultas com `skip` crescente e use `count` da resposta. Este conector não escreve, altera, paga nem concilia lançamentos.

## Conectar ao ChatGPT
Este projeto usa MCP via stdio para desenvolvimento local. A conexão direta com ChatGPT pode exigir um servidor MCP remoto HTTPS e configuração específica no ChatGPT; este pacote **não está hospedado nem conectado à sua conta**. Antes de expor um endpoint remoto, implemente OAuth ou outra autenticação compatível, autorização por usuário, TLS, limites de acesso e auditoria. Não exponha um servidor que dependa apenas do token Nibo.

## Validação
Execute `npm run check` para verificar sintaxe. Teste consultas somente após confirmar a chave, as permissões e os endpoints oficiais no Nibo. Não foram acessados dados reais.
