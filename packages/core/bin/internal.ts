#!/usr/bin/env node
import { run } from '../src/bin-internal/index';
import { loadEnv } from '../src/bin-internal/load-env';
import { ensureTsRuntime } from '../src/ts-runtime';

const reexecCode = ensureTsRuntime();
if (reexecCode !== null) process.exit(reexecCode);

loadEnv();

const code = await run(process.argv.slice(2));
process.exit(code);
