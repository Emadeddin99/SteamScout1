import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiSource = await readFile(new URL('./api/deals.js', import.meta.url), 'utf8');
const { default: handleDeals } = await import(
    `data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`
);

test('filtered deals keep full, non-overlapping pages of 20', async () => {
    const previousFetch = globalThis.fetch;
    const previousApiKey = process.env.ITAD_API_KEY;
    const records = Array.from({ length: 80 }, (_, index) => ({
        appid: String(index + 1),
        title: `Game ${index + 1}`,
        deal: {
            price: { amount: index % 3 === 0 ? '10' : '5' },
            regular: { amount: '10' },
            cut: index % 3 === 0 ? 0 : 50,
            shop: { name: 'Steam' },
            url: `https://store.steampowered.com/app/${index + 1}`
        }
    }));

    process.env.ITAD_API_KEY = 'test-key';
    globalThis.fetch = async request => {
        const url = new URL(request);
        const offset = Number(url.searchParams.get('offset'));
        const limit = Number(url.searchParams.get('limit'));
        const list = records.slice(offset, offset + limit);
        return {
            ok: true,
            json: async () => ({ list, hasMore: offset + list.length < records.length })
        };
    };

    const invoke = async page => {
        const response = {
            statusCode: 200,
            setHeader() {},
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                this.body = body;
                return this;
            },
            end() {}
        };
        await handleDeals({ method: 'GET', query: { page: String(page), limit: '20', sort: 'discount' } }, response);
        assert.equal(response.statusCode, 200);
        return response.body;
    };

    try {
        const firstPage = await invoke(1);
        const secondPage = await invoke(2);
        const firstIds = firstPage.deals.map(deal => deal.steamAppID);
        const secondIds = secondPage.deals.map(deal => deal.steamAppID);

        assert.equal(firstPage.pageSize, 20);
        assert.equal(firstIds.length, 20);
        assert.equal(secondIds.length, 20);
        assert.equal(new Set([...firstIds, ...secondIds]).size, 40);
        assert.equal(firstPage.hasMore, true);
        assert.equal(secondPage.hasMore, true);
    } finally {
        globalThis.fetch = previousFetch;
        if (previousApiKey === undefined) delete process.env.ITAD_API_KEY;
        else process.env.ITAD_API_KEY = previousApiKey;
    }
});