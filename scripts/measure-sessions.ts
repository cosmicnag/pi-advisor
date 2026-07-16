import { measureRepresentativeSessions } from "../tests/fixtures/session-measurements.js";

process.stdout.write(`${JSON.stringify(measureRepresentativeSessions(), null, 2)}\n`);
