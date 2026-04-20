// Idempotent migration runner. Reads db/migrations/*.sql in filename order
// and applies any that aren't recorded in the _migrations table.
//
// Run locally: `deno task -c server/deno.json --allow-net --allow-env --allow-read ../db/migrate.ts`
// CI: see .github/workflows/db-push.yml

import postgres from "npm:postgres@3.4.4";

const url = Deno.env.get("DATABASE_URL");
if (!url) {
    console.error("DATABASE_URL is not set");
    Deno.exit(1);
}

const sql = postgres(url, { prepare: false, onnotice: () => {} });

try {
    await sql`
        create table if not exists _migrations (
            name        text        primary key,
            applied_at  timestamptz not null default now()
        )`;

    const appliedRows = await sql<Array<{ name: string }>>`select name from _migrations`;
    const applied = new Set(appliedRows.map((r) => r.name));

    const dir = new URL("./migrations/", import.meta.url);
    const names: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
        if (entry.isFile && entry.name.endsWith(".sql")) names.push(entry.name);
    }
    names.sort();

    for (const name of names) {
        if (applied.has(name)) {
            console.log(`skip  ${name}`);
            continue;
        }
        const body = await Deno.readTextFile(new URL(`./migrations/${name}`, import.meta.url));
        console.log(`apply ${name}`);
        await sql.unsafe(body);
        await sql`insert into _migrations (name) values (${name})`;
    }
    console.log("migrations up to date");
} finally {
    await sql.end({ timeout: 5 });
}
