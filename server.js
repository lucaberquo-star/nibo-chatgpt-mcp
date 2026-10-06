import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const token = process.env.NIBO_API_TOKEN;
const base = process.env.NIBO_BASE_URL || 'https://api.nibo.com.br/empresas/v1';
if (!token || token === 'replace_with_new_private_token') throw new Error('Set NIBO_API_TOKEN in .env');
const server = new McpServer({name:'nibo-readonly',version:'0.1.0'});
const allowed = {payables:'schedules/debit',receivables:'schedules/credit'};
async function fetchPage(kind, top, skip, orderby) {
  const u = new URL(`${base.replace(/\/$/,'')}/${allowed[kind]}`);
  u.searchParams.set('$top', String(top));
  u.searchParams.set('$skip', String(skip));
  u.searchParams.set('$orderby', orderby);
  const r = await fetch(u, {headers:{ApiToken:token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error(`Nibo returned HTTP ${r.status}; check permissions, route and API availability`);
  return await r.json();
}
for (const [kind,description] of Object.entries({payables:'Read Nibo scheduled payables',receivables:'Read Nibo scheduled receivables (confirm route is enabled for your account)'})) {
  server.tool(`list_${kind}`,description,{top:z.number().int().min(1).max(500).default(100),skip:z.number().int().min(0).default(0),orderby:z.enum(['dueDate','value']).default('dueDate')},async ({top,skip,orderby})=>{
    try { const result=await fetchPage(kind,top,skip,orderby);return {content:[{type:'text',text:JSON.stringify(result)}]}; }
    catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}
  });
}
await server.connect(new StdioServerTransport());
