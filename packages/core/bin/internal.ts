#!/usr/bin/env node
import { run } from '../src/bin-internal/index';
import { loadEnv } from '../src/bin-internal/load-env';

loadEnv();

const code = await run(process.argv.slice(2));
process.exit(code);
