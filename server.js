import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const token = process.env.NIBO_API_TOKEN;
const base =
  process.env.NIBO_BASE_URL ||
  'https://api.nibo.com.br/empresas/v1';

if (!token || token === 'replace_with_new_private_token') {
  throw new Error('Set NIBO_API_TOKEN in .env');
}

const server = new McpServer({
  name: 'nibo-readonly',
  version: '0.2.0',
});

const endpoints = {
  payables: 'schedules/debit',
  receivables: 'schedules/credit',
};

function getItems(payload) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;

  return [];
}

function escapeODataDate(value) {
  return value.trim();
}

function buildDateFilter(startDate, endDate) {
  const filters = [];

  if (startDate) {
    filters.push(`dueDate ge ${escapeODataDate(startDate)}`);
  }

  if (endDate) {
    filters.push(`dueDate le ${escapeODataDate(endDate)}`);
  }

  return filters.join(' and ');
}

async function requestNibo(path, params = {}) {
  const url = new URL(
    `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      ApiToken: token,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');

    throw new Error(
      `Nibo returned HTTP ${response.status}. ${body.slice(0, 300)}`
    );
  }

  return response.json();
}

async function fetchPage({
  kind,
  top = 100,
  skip = 0,
  orderby = 'dueDate',
  startDate,
  endDate,
}) {
  const filter = buildDateFilter(startDate, endDate);

  return requestNibo(endpoints[kind], {
    '$orderby': orderby,
    '$top': Math.min(top, 500),
    '$skip': skip,
    '$filter': filter || undefined,
  });
}

async function fetchAll({
  kind,
  orderby = 'dueDate',
  startDate,
  endDate,
  maxRecords = 5000,
}) {
  const pageSize = 500;
  let skip = 0;
  let totalCount = null;
  const records = [];

  while (records.length < maxRecords) {
    const payload = await fetchPage({
      kind,
      top: pageSize,
      skip,
      orderby,
      startDate,
      endDate,
    });

    const items = getItems(payload);

    if (totalCount === null && Number.isFinite(Number(payload?.count))) {
      totalCount = Number(payload.count);
    }

    records.push(...items);

    if (items.length < pageSize) break;

    skip += pageSize;

    if (totalCount !== null && skip >= totalCount) break;
  }

  return {
    kind,
    count: records.length,
    apiCount: totalCount,
    truncated:
      records.length >= maxRecords &&
      totalCount !== null &&
      records.length < totalCount,
    records: records.slice(0, maxRecords),
  };
}

function calculateSummary(records) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalOriginal = 0;
  let totalPaid = 0;
  let totalOpen = 0;

  let paidCount = 0;
  let openCount = 0;
  let overdueCount = 0;

  let overdueValue = 0;
  let recordsWithNumericValue = 0;

  for (const record of records) {
    const value = Number(record?.value);
    const paidValue = Number(record?.paidValue);
    const openValue = Number(record?.openValue);

    if (Number.isFinite(value)) {
      totalOriginal += value;
      recordsWithNumericValue += 1;
    }

    if (Number.isFinite(paidValue)) {
      totalPaid += paidValue;
    }

    if (Number.isFinite(openValue)) {
      totalOpen += openValue;
    }

    if (record?.isPaid === true) {
      paidCount += 1;
    }

    if (Number.isFinite(openValue) && openValue > 0) {
      openCount += 1;

      if (record?.dueDate) {
        const dueDate = new Date(record.dueDate);

        if (!Number.isNaN(dueDate.getTime()) && dueDate < today) {
          overdueCount += 1;
          overdueValue += openValue;
        }
      }
    }
  }

  return {
    referenceDate: today.toISOString().slice(0, 10),

    quantity: records.length,

    counts: {
      paid: paidCount,
      open: openCount,
      overdue: overdueCount,
    },

    amounts: {
      original: Number(totalOriginal.toFixed(2)),
      paid: Number(totalPaid.toFixed(2)),
      open: Number(totalOpen.toFixed(2)),
      overdue: Number(overdueValue.toFixed(2)),
    },

    recordsWithNumericValue,
  };
};

const commonInput = {
  top: z.number().int().min(1).max(500).default(100),
  skip: z.number().int().min(0).default(0),
  orderby: z.enum(['dueDate', 'value']).default('dueDate'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
};

server.tool(
  'list_payables',
  'Read one page of Nibo scheduled payables.',
  commonInput,
  async (args) => {
    try {
      const result = await fetchPage({
        kind: 'payables',
        ...args,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
);

server.tool(
  'list_receivables',
  'Read one page of Nibo scheduled receivables.',
  commonInput,
  async (args) => {
    try {
      const result = await fetchPage({
        kind: 'receivables',
        ...args,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
);

server.tool(
  'get_all_payables',
  'Automatically paginate Nibo scheduled payables.',
  {
    orderby: z.enum(['dueDate', 'value']).default('dueDate'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    maxRecords: z.number().int().min(1).max(10000).default(5000),
  },
  async (args) => {
    try {
      const result = await fetchAll({
        kind: 'payables',
        ...args,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
);

server.tool(
  'summarize_payables',
  'Calculate quantity and total value of Nibo scheduled payables.',
  {
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    maxRecords: z.number().int().min(1).max(10000).default(5000),
  },
  async (args) => {
    try {
      const result = await fetchAll({
        kind: 'payables',
        orderby: 'dueDate',
        ...args,
      });

      const summary = calculateSummary(result.records);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              period: {
                startDate: args.startDate ?? null,
                endDate: args.endDate ?? null,
              },
              ...summary,
              apiCount: result.apiCount,
              truncated: result.truncated,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
);

await server.connect(new StdioServerTransport());